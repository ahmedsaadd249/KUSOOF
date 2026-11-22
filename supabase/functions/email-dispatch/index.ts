// ===========================================================================
// KUSOOF — email-dispatch
// Sends queued order emails (public.email_notifications) through Brevo.
//
// Called by the database (pg_net trigger on insert + pg_cron every minute)
// with a shared secret header; never by the browser. Each run:
//   claim_email_jobs  → rows move pending → sending (row-locked, SKIP LOCKED)
//   render            → ./email-templates.js (same module the admin preview
//                       uses; copied from js/data/ by scripts/sync-functions.mjs)
//   Brevo             → POST /v3/smtp/email
//   complete_email_job→ sent (+ Brevo messageId) | retry with backoff | failed
// Email problems never touch orders: they only update the notification row.
// ===========================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { renderEmail } from './email-templates.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const SENDER_EMAIL = Deno.env.get('BREVO_SENDER_EMAIL') ?? '';
const SENDER_NAME = Deno.env.get('BREVO_SENDER_NAME') ?? 'KUSOOF';
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

class SendError extends Error {
  permanent: boolean;
  constructor(message: string, permanent = false) {
    super(message);
    this.permanent = permanent;
  }
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function formatPhone(value: string): string {
  const d = String(value || '').replace(/\D/g, '');
  const local = d.startsWith('20') ? d.slice(2) : d;
  return local.length === 10 ? `+20 ${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}` : value;
}

function addressLine(order: Row, locale: string): string {
  const ar = locale === 'ar';
  const gov = ar && order.shipping_governorate_ar ? order.shipping_governorate_ar : order.shipping_governorate;
  const area = ar && order.shipping_area_ar ? order.shipping_area_ar : order.shipping_area;
  return ar
    ? `${order.street}، مبنى ${order.building_number}، شقة ${order.apartment_number}، ${area}، ${gov}، مصر`
    : `${order.street}, Building ${order.building_number}, Apt ${order.apartment_number}, ${area}, ${gov}, Egypt`;
}

// deno-lint-ignore no-explicit-any
async function complete(admin: any, id: string, ok: boolean, extra: { messageId?: string; error?: string; subject?: string; permanent?: boolean }) {
  await admin.rpc('complete_email_job', {
    p_id: id,
    p_ok: ok,
    p_message_id: extra.messageId ?? null,
    p_error: extra.error ?? null,
    p_subject: extra.subject ?? null,
    p_permanent: extra.permanent ?? false,
  });
}

// deno-lint-ignore no-explicit-any
async function sendOne(admin: any, job: Row, settings: Row | null) {
  let subject = '';
  try {
    const { data: order, error } = await admin.from('orders').select('*, order_items(*)').eq('id', job.order_id).single();
    if (error || !order) throw new SendError(`Order not found (${error?.message ?? 'missing'})`, true);

    const locale = job.locale === 'ar' ? 'ar' : 'en';
    const httpsApp = APP_URL.startsWith('https://');
    const rendered = renderEmail({
      type: job.notification_type,
      locale,
      logoUrl: httpsApp ? `${APP_URL}/logo/kusoof-logo-transparent.png` : '',
      data: {
        customerName: order.customer_name,
        customerPhone: formatPhone(order.customer_phone),
        orderNumber: order.order_number,
        items: (order.order_items as Row[]).map((i) => ({
          name: locale === 'ar' && i.product_name_ar ? i.product_name_ar : i.product_name,
          qty: i.quantity,
          lineTotal: Number(i.line_total),
        })),
        subtotal: Number(order.subtotal),
        deliveryFee: Number(order.delivery_fee),
        total: Number(order.total_amount),
        address: addressLine(order, locale),
        orderUrl: APP_URL ? `${APP_URL}/order-confirmation.html?order=${encodeURIComponent(order.order_number)}&lang=${locale}` : '',
        currency: {
          code: settings?.currency_code ?? 'EGP',
          display: settings?.currency_display ?? 'code',
          decimals: settings?.currency_decimals ?? 0,
        },
      },
    });
    subject = rendered.subject;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: SENDER_EMAIL, name: SENDER_NAME },
        to: [{ email: job.customer_email, name: order.customer_name }],
        ...(settings?.store_email ? { replyTo: { email: settings.store_email, name: SENDER_NAME } } : {}),
        subject,
        htmlContent: rendered.html,
        tags: ['kusoof', job.notification_type],
        headers: { 'X-Kusoof-Notification-Id': job.id },
      }),
    });
    const text = await res.text();
    if (res.ok) {
      let messageId = '';
      try {
        messageId = JSON.parse(text || '{}').messageId ?? '';
      } catch {
        messageId = '';
      }
      await complete(admin, job.id, true, { messageId, subject });
      return { id: job.id, status: 'sent' };
    }
    // 4xx (except 429) = bad request / sender / key → retrying won't help
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw new SendError(`Brevo ${res.status}: ${text.slice(0, 500)}`, permanent);
  } catch (e) {
    const err = e instanceof SendError ? e : new SendError(e instanceof Error ? e.message : String(e));
    await complete(admin, job.id, false, { error: err.message, subject, permanent: err.permanent });
    return { id: job.id, status: err.permanent ? 'failed' : 'retry', error: err.message };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'server_misconfigured' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const secret = req.headers.get('x-dispatch-secret') ?? '';
  const auth = await admin.rpc('email_dispatch_authorized', { p_secret: secret });
  if (auth.error || auth.data !== true) return json({ error: 'unauthorized' }, 401);

  // Not configured yet: leave every email queued (nothing is lost or marked failed)
  if (!BREVO_API_KEY || !SENDER_EMAIL) {
    return json({ error: 'brevo_not_configured', detail: 'Set BREVO_API_KEY and BREVO_SENDER_EMAIL as Edge Function secrets.' }, 503);
  }

  const claimed = await admin.rpc('claim_email_jobs', { p_limit: 10 });
  if (claimed.error) return json({ error: 'claim_failed', detail: claimed.error.message }, 500);
  const jobs = (claimed.data ?? []) as Row[];
  if (!jobs.length) return json({ processed: 0 });

  const { data: settings } = await admin.from('store_settings').select('*').eq('id', 1).maybeSingle();
  const results = [];
  for (const job of jobs) results.push(await sendOne(admin, job, settings));
  return json({ processed: results.length, results });
});

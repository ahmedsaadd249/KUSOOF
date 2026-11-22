// ===========================================================================
// KUSOOF — admin-request-code
// Sends a one-time sign-in code ONLY to an allowlisted admin email.
//   1. Looks the email up in public.admin_users (service role; clients can't).
//   2. First time: creates / finds the admin's auth user and links it.
//   3. Asks Supabase Auth to email the code (same OTP flow as customers,
//      shouldCreateUser: false). The code is verified in the browser with
//      supabase.auth.verifyOtp, and every admin read/write is then checked
//      server-side by RLS / is_admin().
// Any other email gets 403 not_admin and no email is sent.
// ===========================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) return json({ error: 'server_misconfigured' }, 500);

  let email = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return json({ error: 'invalid_email' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: row, error } = await admin.from('admin_users').select('email, user_id').eq('email', email).maybeSingle();
  if (error) return json({ error: 'server_error' }, 500);
  if (!row) return json({ error: 'not_admin' }, 403);

  // First sign-in: make sure the admin has an auth user and link it
  if (!row.user_id) {
    let userId: string | null = null;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: 'Store Admin', locale: 'en' } });
    if (created.data?.user) {
      userId = created.data.user.id;
    } else {
      const found = await admin.rpc('auth_user_id_by_email', { p_email: email });
      userId = (found.data as string | null) ?? null;
    }
    if (!userId) return json({ error: 'server_error' }, 500);
    const link = await admin.from('admin_users').update({ user_id: userId }).eq('email', email);
    if (link.error) return json({ error: 'server_error' }, 500);
  }

  // Supabase Auth emails the code (via the SMTP configured in the dashboard)
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: otpError } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (otpError) {
    const rateLimited = otpError.status === 429 || /rate|seconds/i.test(otpError.message);
    return json({ error: rateLimited ? 'rate_limited' : 'send_failed', message: otpError.message }, rateLimited ? 429 : 502);
  }
  return json({ ok: true });
});

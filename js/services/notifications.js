/* ==========================================================================
   Email notifications (admin) — history of the emails sent through Brevo by
   the email-dispatch Edge Function. Rows are created by the database when a
   new customer verifies their email (welcome, once) and when an order is
   placed or its status changes (one per order and type, ever).
   ========================================================================== */
import { sb, run, watchTable, searchTerm } from './api.js';

const mapNotification = (r) => ({
  id: r.id,
  orderId: r.orders ? r.orders.order_number : '', // '' for the welcome email
  customerName: r.orders ? r.orders.customer_name : (r.profiles && r.profiles.full_name) || '',
  customerEmail: r.customer_email,
  type: r.notification_type,
  locale: r.locale,
  subject: r.email_subject,
  status: r.delivery_status, // pending | sending | sent | failed | skipped
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  messageId: r.brevo_message_id,
  error: r.error_message || '',
  sentAt: r.sent_at,
  createdAt: r.created_at,
});

export async function listNotifications({ type, status, search } = {}) {
  let q = sb()
    .from('email_notifications')
    .select('*, orders(order_number, customer_name), profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (type) q = q.eq('notification_type', type);
  if (status) q = q.eq('delivery_status', status);
  const list = (await run(q)).map(mapNotification);
  const term = searchTerm(search).toLowerCase();
  return term
    ? list.filter((n) => n.customerEmail.toLowerCase().includes(term) || n.orderId.toLowerCase().includes(term) || n.customerName.toLowerCase().includes(term))
    : list;
}

/** Send a failed email again (same record — it can never turn into two emails). */
export async function retryNotification(id) {
  await run(sb().rpc('admin_retry_email', { p_notification_id: id }));
}

export const watchNotifications = (fn) => watchTable('email_notifications', fn);

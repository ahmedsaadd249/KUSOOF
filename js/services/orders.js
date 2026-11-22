/* ==========================================================================
   Orders service — Supabase.
   Customers: place_order RPC (server computes prices, fee, totals; checks and
   deducts stock atomically; idempotent per checkout attempt) and read their
   own orders (RLS). Admin: read all orders and change status through the
   admin_set_order_status RPC (forward-only, history, stock restore, email
   outbox). Pages get the same order shape as before, keyed by order number.
   ========================================================================== */
import { sb, run, ServiceError, toServiceError, watchTable, searchTerm } from './api.js';
import { snapshotImageUrl } from './products.js';

const SELECT = '*, order_items(*), order_status_history(*)';

export function mapOrder(r) {
  return {
    id: r.order_number,
    uuid: r.id,
    customerId: r.customer_id,
    customer: { name: r.customer_name, email: r.customer_email, phone: r.customer_phone },
    locale: r.locale,
    items: (r.order_items || []).map((i) => ({
      productId: i.product_id,
      name: { en: i.product_name, ar: i.product_name_ar || i.product_name },
      price: Number(i.product_price),
      qty: i.quantity,
      lineTotal: Number(i.line_total),
      image: snapshotImageUrl(i.product_image),
    })),
    subtotal: Number(r.subtotal),
    deliveryFee: Number(r.delivery_fee),
    total: Number(r.total_amount),
    currency: 'EGP',
    payment: { method: 'cod', status: r.payment_status },
    address: {
      country: 'EG',
      zoneId: r.shipping_zone_id,
      governorate: { en: r.shipping_governorate, ar: r.shipping_governorate_ar || r.shipping_governorate },
      area: { en: r.shipping_area, ar: r.shipping_area_ar || r.shipping_area },
      street: r.street,
      building: r.building_number,
      apartment: r.apartment_number,
      instructions: r.delivery_instructions,
      lat: r.latitude == null ? null : Number(r.latitude),
      lng: r.longitude == null ? null : Number(r.longitude),
      formatted: r.formatted_address,
    },
    status: r.order_status,
    stockRestored: Boolean(r.stock_restored_at),
    history: (r.order_status_history || [])
      .slice()
      .sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at)))
      .map((h) => ({ status: h.new_status, from: h.previous_status, at: h.changed_at, note: h.note, by: h.changed_by })),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * placeOrder({ customer:{ name, phone }, address:{ zoneId, area, street, building,
 *   apartment, instructions, lat, lng, formatted }, items:[{ uuid, qty }], locale, idempotencyKey })
 * → { id: order number }. Prices and totals are never sent: the server computes them.
 */
export async function placeOrder({ customer, address, items, locale = 'en', idempotencyKey }) {
  if (!items || !items.length) throw new ServiceError('empty_cart');
  const payload = {
    customer_name: customer.name,
    phone: customer.phone,
    locale,
    shipping_zone_id: address.zoneId,
    area: address.area || '',
    street: address.street,
    building_number: address.building,
    apartment_number: address.apartment,
    delivery_instructions: address.instructions || '',
    latitude: address.lat ?? null,
    longitude: address.lng ?? null,
    formatted_address: address.formatted || '',
    items: items.map((i) => ({ product_id: i.uuid, quantity: i.qty })),
  };
  const { data, error } = await sb().rpc('place_order', { payload, p_idempotency_key: idempotencyKey });
  if (error) throw toServiceError(error, 'orderFailed');
  return { id: data.order_number, uuid: data.order_id, duplicate: Boolean(data.duplicate) };
}

/** By order number. RLS: customers see only their own orders; admins see all. */
export async function getOrder(id) {
  if (!id) return null;
  const row = await run(sb().from('orders').select(SELECT).eq('order_number', id).maybeSingle());
  return row ? mapOrder(row) : null;
}

/**
 * listOrders({ status, search, customerId, from, to, limit })
 * Customers automatically get only their own orders (RLS).
 */
export async function listOrders({ status, search, customerId, from, to, limit = 1000 } = {}) {
  let q = sb().from('orders').select(SELECT).order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('order_status', status);
  if (customerId) q = q.eq('customer_id', customerId);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  const term = searchTerm(search);
  if (term) q = q.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%`);
  return (await run(q)).map(mapOrder);
}

/** Admin: change status (forward only — enforced by the database). */
export async function updateOrderStatus(id, status, note = '') {
  const order = await getOrder(id);
  if (!order) throw new ServiceError('not_found');
  await run(sb().rpc('admin_set_order_status', { p_order_id: order.uuid, p_new_status: status, p_note: note }));
  const updated = await getOrder(id);
  const { data: notification } = await sb()
    .from('email_notifications')
    .select('notification_type, delivery_status')
    .eq('order_id', order.uuid)
    .eq('notification_type', status)
    .maybeSingle();
  return {
    order: updated,
    notification: notification ? { type: notification.notification_type, status: notification.delivery_status } : null,
  };
}

export const watchOrders = (fn) => watchTable('orders', fn);

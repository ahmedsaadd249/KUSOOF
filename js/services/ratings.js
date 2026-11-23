/* ==========================================================================
   Order ratings — the "Delivered" email links to rate.html?t=<token>&r=<n>.
   The token is the order's private rating_token, so no sign-in is needed;
   the database functions only ever reveal the order number, first name and
   items for it, and accept a rating only once the order is delivered.
   Published ratings appear as reviews on the products in that order.
   ========================================================================== */
import { sb, run, ServiceError } from './api.js';
import { snapshotImageUrl } from './products.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** → { orderNumber, firstName, status, canRate, items[], rating, comment } or null */
export async function getRatingContext(token) {
  if (!UUID.test(String(token || ''))) return null;
  const c = await run(sb().rpc('get_rating_context', { p_token: token }));
  if (!c) return null;
  return {
    orderNumber: c.order_number,
    firstName: c.first_name || '',
    status: c.status,
    canRate: Boolean(c.can_rate),
    items: (c.items || []).map((i) => ({ name: { en: i.name, ar: i.name_ar || i.name }, image: snapshotImageUrl(i.image), qty: i.qty })),
    rating: c.rating == null ? null : Number(c.rating),
    comment: c.comment || '',
  };
}

export async function submitRating(token, rating, comment = '', locale = 'en') {
  if (!UUID.test(String(token || ''))) throw new ServiceError('not_found');
  return run(sb().rpc('submit_order_rating', { p_token: token, p_rating: rating, p_comment: comment, p_locale: locale }));
}

/** Public reviews of one product (by its uuid) → { count, average, reviews[] } */
export async function productReviews(productUuid, limit = 20) {
  const r = await run(sb().rpc('product_reviews', { p_product_id: productUuid, p_limit: limit }));
  return {
    count: Number((r && r.count) || 0),
    average: r && r.average != null ? Number(r.average) : null,
    reviews: ((r && r.reviews) || []).map((x) => ({ rating: x.rating, comment: x.comment || '', locale: x.locale, name: x.name || '', at: x.created_at })),
  };
}

/* ---------- Admin ---------- */
export async function getOrderRating(orderUuid) {
  const r = await run(sb().from('order_ratings').select('*').eq('order_id', orderUuid).maybeSingle());
  return r ? { rating: r.rating, comment: r.comment, locale: r.locale, published: r.is_published, at: r.updated_at } : null;
}

export async function setRatingPublished(orderUuid, published) {
  await run(sb().from('order_ratings').update({ is_published: Boolean(published) }).eq('order_id', orderUuid).select('order_id').single());
}

/** Average of all ratings (admin dashboard) → { count, average } */
export async function ratingSummary() {
  const rows = await run(sb().from('order_ratings').select('rating'));
  const count = rows.length;
  return { count, average: count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null };
}

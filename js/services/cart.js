/* ==========================================================================
   Cart — per-device state (stays in the browser in Phase 2 too; prices and
   stock are re-validated by the server when the order is placed).
   ========================================================================== */
import { read, write, remove as removeKey, subscribe } from '../core/storage.js';
import { listProducts } from './products.js';

const KEY = 'cart.v1';
export const MAX_QTY = 9;

// One-time migration from the earlier "bag" key (kusoof.bag.v1)
(function migrate() {
  const old = read('bag.v1', null);
  if (Array.isArray(old) && old.length && !read(KEY, null)) write(KEY, old);
  if (old) removeKey('bag.v1');
})();

const clampQty = (n, max = MAX_QTY) => Math.min(Math.max(1, max), Math.max(1, Math.round(Number(n)) || 1));

function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach((it) => {
    if (!it || typeof it.id !== 'string' || out.some((o) => o.id === it.id)) return;
    out.push({ id: it.id, qty: clampQty(it.qty) });
  });
  return out;
}

export function getCart() {
  return sanitize(read(KEY, []));
}

export const count = () => getCart().reduce((s, l) => s + l.qty, 0);

function save(lines) {
  write(KEY, sanitize(lines));
}

/** Adds qty (capped by `max`, e.g. stock). Returns { qty, capped }. */
export function add(id, qty = 1, { max = MAX_QTY } = {}) {
  const lines = getCart();
  const line = lines.find((l) => l.id === id);
  const cap = Math.min(MAX_QTY, max);
  const wanted = (line ? line.qty : 0) + qty;
  const next = Math.min(cap, wanted);
  if (next <= 0) return { qty: 0, capped: true };
  if (line) line.qty = next;
  else lines.push({ id, qty: next });
  save(lines);
  return { qty: next, capped: wanted > cap };
}

export function setQty(id, qty, { max = MAX_QTY } = {}) {
  const lines = getCart();
  const line = lines.find((l) => l.id === id);
  if (!line) return;
  line.qty = clampQty(qty, Math.min(MAX_QTY, max));
  save(lines);
}

export function remove(id) {
  save(getCart().filter((l) => l.id !== id));
}

export function clear() {
  save([]);
}

/** Replace the whole cart (used by "Undo"). */
export function restore(lines) {
  save(lines);
}

export const onCartChange = (fn) => subscribe(KEY, () => fn(getCart()));

/** Lines joined with product data + totals. Unavailable products are flagged. */
export async function cartDetails() {
  const products = await listProducts({ includeUnavailable: true });
  const lines = getCart().map((l) => {
    const product = products.find((p) => p.id === l.id) || null;
    const available = Boolean(product && product.available && product.stock > 0);
    const maxQty = product ? Math.min(MAX_QTY, Math.max(0, product.stock)) : 0;
    const unitPrice = product ? product.price : 0;
    return { id: l.id, qty: l.qty, product, available, maxQty, unitPrice, lineTotal: available ? unitPrice * l.qty : 0 };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  return { lines, subtotal, count: lines.reduce((s, l) => s + (l.available ? l.qty : 0), 0) };
}

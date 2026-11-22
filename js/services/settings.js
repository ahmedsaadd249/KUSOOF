/* ==========================================================================
   Settings service — the single store_settings row in Supabase.
   Public read (currency display, store info); admin-only update (RLS).
   A copy is cached in localStorage so formatting (money()) and the admin
   shell can read it synchronously; it refreshes on every page load.
   ========================================================================== */
import { read, write, subscribe } from '../core/storage.js';
import { LOW_STOCK_DEFAULT } from '../config.js';
import { sb, run, ServiceError } from './api.js';

const CACHE = 'settings.cache';

const DEFAULTS = {
  store: { name: 'KUSOOF', email: '', phone: '', address: 'Cairo, Egypt' },
  currency: { code: 'EGP', display: 'code', decimals: 0 },
  lowStockThreshold: LOW_STOCK_DEFAULT,
  notifications: { order_confirmation: true, shipped: true, delivered: true, cancelled: true, lowStockAlert: true },
  delivery: { enabled: true },
};

function fromRow(r) {
  if (!r) return { ...DEFAULTS };
  return {
    store: { name: r.store_name, email: r.store_email, phone: r.store_phone, address: r.store_address },
    currency: { code: r.currency_code, display: r.currency_display, decimals: r.currency_decimals },
    lowStockThreshold: r.default_low_stock_threshold,
    notifications: {
      order_confirmation: r.notify_order_confirmation,
      shipped: r.notify_shipped,
      delivered: r.notify_delivered,
      cancelled: r.notify_cancelled,
      lowStockAlert: r.low_stock_alert,
    },
    delivery: { enabled: r.delivery_enabled },
    updatedAt: r.updated_at,
  };
}

function toRow(s) {
  const row = {};
  if (s.store) {
    if ('name' in s.store) row.store_name = String(s.store.name || '').trim();
    if ('email' in s.store) row.store_email = String(s.store.email || '').trim();
    if ('phone' in s.store) row.store_phone = String(s.store.phone || '').trim();
    if ('address' in s.store) row.store_address = String(s.store.address || '').trim();
  }
  if (s.currency) {
    if ('display' in s.currency) row.currency_display = s.currency.display === 'symbol' ? 'symbol' : 'code';
    if ('decimals' in s.currency) row.currency_decimals = Number(s.currency.decimals) === 2 ? 2 : 0;
  }
  if ('lowStockThreshold' in s) row.default_low_stock_threshold = Math.max(0, Math.round(Number(s.lowStockThreshold) || 0));
  if (s.notifications) {
    const n = s.notifications;
    if ('order_confirmation' in n) row.notify_order_confirmation = Boolean(n.order_confirmation);
    if ('shipped' in n) row.notify_shipped = Boolean(n.shipped);
    if ('delivered' in n) row.notify_delivered = Boolean(n.delivered);
    if ('cancelled' in n) row.notify_cancelled = Boolean(n.cancelled);
    if ('lowStockAlert' in n) row.low_stock_alert = Boolean(n.lowStockAlert);
  }
  if (s.delivery && 'enabled' in s.delivery) row.delivery_enabled = Boolean(s.delivery.enabled);
  return row;
}

/** Last known settings (cache), for synchronous readers. */
export function settingsSync() {
  const cached = read(CACHE, null);
  return cached ? { ...DEFAULTS, ...cached } : { ...DEFAULTS };
}

export async function getSettings() {
  const row = await run(sb().from('store_settings').select('*').eq('id', 1).maybeSingle());
  const s = fromRow(row);
  write(CACHE, s);
  return s;
}

/** Refresh the cache without blocking the page (called by page bootstraps). */
export function refreshSettings() {
  return getSettings().catch(() => settingsSync());
}

export async function saveSettings(next) {
  const patch = toRow(next);
  if (!Object.keys(patch).length) return settingsSync();
  const row = await run(sb().from('store_settings').update(patch).eq('id', 1).select('*').maybeSingle());
  if (!row) throw new ServiceError('forbidden');
  const s = fromRow(row);
  write(CACHE, s);
  return s;
}

export const watchSettings = (fn) => subscribe(CACHE, fn);

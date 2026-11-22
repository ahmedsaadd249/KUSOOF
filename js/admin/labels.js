/* Admin labels & small renderers (English UI, bilingual order statuses). */
import { esc } from '../core/dom.js';
import { money as fmtMoney, initials } from '../core/format.js';

export const STATUS = {
  preparing: { en: 'Preparing', ar: 'قيد التجهيز' },
  shipped: { en: 'Shipped', ar: 'تم الشحن' },
  delivered: { en: 'Delivered', ar: 'تم الاستلام' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
};
export const STATUS_ORDER = ['preparing', 'shipped', 'delivered', 'cancelled'];
export const STATUS_COLOR = { preparing: '#A86A00', shipped: '#3172C9', delivered: '#0E8A5F', cancelled: '#D2453A' };

export const PAYMENT = { pending: 'Pending', paid: 'Paid', void: 'Void', refunded: 'Refunded' };
export const PAYMENT_TONE = { pending: 'warn', paid: 'ok', void: 'muted', refunded: 'muted' };
export const LANG = { en: 'English', ar: 'Arabic' };
/** Email types (order confirmation + status emails). */
export const EMAIL_TYPE = {
  order_confirmation: { en: 'Order confirmation', ar: 'تأكيد الطلب' },
  preparing: { en: 'Preparing', ar: 'قيد التجهيز' },
  shipped: { en: 'Shipped', ar: 'تم الشحن' },
  delivered: { en: 'Delivered', ar: 'تم الاستلام' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
};
export const DELIVERY_STATUS = {
  pending: { label: 'Queued', tone: 'warn' },
  sending: { label: 'Sending', tone: 'warn' },
  sent: { label: 'Sent', tone: 'ok' },
  failed: { label: 'Failed', tone: 'err' },
  skipped: { label: 'Skipped', tone: 'muted' },
};
export const CATEGORIES = {
  sunglasses: { en: 'Sunglasses', ar: 'نظارات شمسية' },
  eyeglasses: { en: 'Eyeglasses', ar: 'نظارات طبية' },
};

export const money = (n) => fmtMoney(n, 'en');

/** Images are stored relative to the site root; the admin lives in /admin/. */
export function asset(src) {
  if (!src) return '';
  if (/^(data:|blob:|https?:|\/)/.test(src)) return src;
  return `../${src}`;
}

export function statusBadge(status) {
  const s = STATUS[status] || { en: status, ar: '' };
  return `<span class="s-badge" data-status="${esc(status)}"><i aria-hidden="true"></i>${esc(s.en)} <span class="ar" lang="ar">· ${esc(s.ar)}</span></span>`;
}

export function toneBadge(text, tone = 'muted') {
  return `<span class="s-badge" data-tone="${esc(tone)}"><i aria-hidden="true"></i>${esc(text)}</span>`;
}

export const langTag = (l) => `<span class="lang-tag" title="${esc(LANG[l] || l)}">${esc(String(l || 'en').toUpperCase())}</span>`;

export function who(name, email) {
  return `<div class="who"><span class="who__avatar" aria-hidden="true">${esc(initials(name))}</span><div style="min-width:0"><div class="who__name">${esc(name)}</div>${email ? `<div class="who__email">${esc(email)}</div>` : ''}</div></div>`;
}

export const itemsText = (items) => items.map((i) => `${i.name.en} × ${i.qty}`).join(', ');

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

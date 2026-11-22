/* ==========================================================================
   Formatting — money, dates, masks. Latin digits in both languages.
   Currency display (code vs symbol, decimals) follows admin Settings.
   ========================================================================== */
import { STORE } from '../config.js';
import { read } from './storage.js';
import { formatMoney } from '../data/email-templates.js';

const TAG = { en: 'en-EG', ar: 'ar-EG' };

/** Currency display from the cached store settings (services/settings.js keeps it fresh). */
function currencyPrefs() {
  const s = read('settings.cache', null);
  return {
    code: (s && s.currency && s.currency.code) || STORE.currency,
    display: (s && s.currency && s.currency.display) || 'code',
    decimals: s && s.currency && Number.isInteger(s.currency.decimals) ? s.currency.decimals : 0,
  };
}

/** money(8900) → "EGP 8,900" | "LE 8,900" (en, per Settings) / "8,900 ج.م" (ar).
    Same formatter the emails use, so prices match everywhere. */
export function money(amount, lang = 'en', override) {
  return formatMoney(amount, lang, { ...currencyPrefs(), ...(override || {}) });
}

export function number(n, lang = 'en', opts = {}) {
  return new Intl.NumberFormat(TAG[lang] || TAG.en, { numberingSystem: 'latn', ...opts }).format(Number(n) || 0);
}

export function date(value, lang = 'en', opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(TAG[lang] || TAG.en, { numberingSystem: 'latn', ...opts }).format(d);
}

export function dateTime(value, lang = 'en') {
  return date(value, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function time(value, lang = 'en') {
  return date(value, lang, { hour: 'numeric', minute: '2-digit' });
}

/** 75 → "1:15" */
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "alexandra@example.com" → "al•••a@example.com" */
export function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return email || '';
  if (user.length <= 2) return `${user[0] || ''}•••@${domain}`;
  return `${user.slice(0, 2)}•••${user.slice(-1)}@${domain}`;
}

export function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/** "+201012345678" → "+20 10 1234 5678" (Egyptian mobile) */
export function phone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.startsWith('20') ? digits.slice(2) : digits.replace(/^0/, '');
  if (local.length !== 10) return value || '';
  return `+20 ${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
}

export const pad = (n, len = 2) => String(n).padStart(len, '0');

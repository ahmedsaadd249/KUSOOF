/* ==========================================================================
   i18n — English / Arabic for the customer website.
   The locale is decided by a tiny inline <head> script on every page
   (sets <html lang dir> before first paint); this module reads it.
   ========================================================================== */
import en from '../i18n/en.js';
import ar from '../i18n/ar.js';

const DICTS = { en, ar };
export const LOCALES = ['en', 'ar'];
const STORAGE_KEY = 'kusoof.locale';

const htmlLang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2);
export const locale = LOCALES.includes(htmlLang) ? htmlLang : 'en';
export const isRTL = locale === 'ar';
export const dir = isRTL ? 'rtl' : 'ltr';

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function resolve(key, params, lang) {
  let value = lookup(DICTS[lang], key);
  if (value === undefined && lang !== 'en') value = lookup(DICTS.en, key);
  if (value === undefined) return null;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const n = Number(params && params.count);
    const cat = Number.isFinite(n) ? (n === 0 && value.zero ? 'zero' : new Intl.PluralRules(lang).select(n)) : 'other';
    value = value[cat] ?? value.other ?? '';
  }
  return value;
}

function interpolate(str, params, escape) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => {
    if (!(name in params)) return m;
    const v = params[name];
    return escape ? esc(v) : String(v);
  });
}

/** Plain-text translation (use with textContent). */
export function t(key, params, lang = locale) {
  const value = resolve(key, params, lang);
  if (value === null) {
    if (typeof console !== 'undefined') console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (Array.isArray(value)) return value;
  return interpolate(String(value), params, false);
}

/** Trusted-HTML translation: dictionary markup kept, params escaped. */
export function th(key, params, lang = locale) {
  const value = resolve(key, params, lang);
  if (value === null) return esc(key);
  return interpolate(String(value), params, true);
}

/** Pick the current language from a bilingual field `{ en, ar }`. */
export function loc(field, lang = locale) {
  if (field == null) return '';
  if (typeof field === 'string' || Array.isArray(field)) return field;
  return field[lang] ?? field.en ?? '';
}

/** Convert Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Latin digits. */
export function toLatinDigits(str) {
  return String(str ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Remember a language and reload the page in it (keeps the hash and query). */
export function setLocale(next) {
  if (!LOCALES.includes(next) || next === locale) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (e) {
    /* storage blocked: fall back to the ?lang param */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('lang', next);
  window.location.replace(url.toString());
}

/**
 * Translate static markup:
 *   data-i18n="key"            → textContent
 *   data-i18n-html="key"       → innerHTML (dictionary markup only)
 *   data-i18n-list="key"       → <li> items from a string array
 *   data-i18n-attr="aria-label:key;placeholder:key"
 */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = th(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-list]').forEach((el) => {
    const items = t(el.dataset.i18nList);
    if (Array.isArray(items)) el.innerHTML = items.map((s) => `<li>${esc(s)}</li>`).join('');
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}

/** Set <title> and meta description from dictionary keys. */
export function setMeta(titleKey, descKey, params) {
  if (titleKey) document.title = t(titleKey, params);
  if (descKey) {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t(descKey, params));
  }
}

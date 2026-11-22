/* ==========================================================================
   KUSOOF — store configuration (Phase 2: Supabase backend).
   Connection values (Supabase URL / anon key, Google Maps key) are NOT here:
   they come from js/env.public.js, generated from .env by
   `node scripts/write-env.mjs`. Store settings (currency display, low-stock
   threshold, notification toggles, delivery fees) live in the database and
   are edited in the admin.
   ========================================================================== */

export const STORE = {
  name: 'KUSOOF',
  market: 'EG',
  currency: 'EGP',
  phonePrefix: '+20',
};

/** Email one-time code length. Supabase Auth codes are 6 digits (set in Auth settings). */
export const OTP_LENGTH = 6;
/** Seconds before "Resend code" — Supabase allows one code email per address per 60 s. */
export const OTP_RESEND_SECONDS = 60;
/** Wrong attempts shown before asking for a new code (Supabase also rate-limits verification). */
export const OTP_MAX_ATTEMPTS = 5;
/** Minutes a code stays valid (Supabase › Auth › Email OTP Expiration = 600 s). */
export const OTP_TTL_MINUTES = 10;

/** Default low-stock threshold when a product has none (admin Settings overrides it). */
export const LOW_STOCK_DEFAULT = 5;

/** Order statuses, in workflow order. Labels live in i18n / admin. */
export const ORDER_STATUSES = ['preparing', 'shipped', 'delivered', 'cancelled'];

/** Forward-only status rules (the database enforces the same rules). */
export const NEXT_STATUSES = {
  preparing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export const COUNTRIES = ['EG'];

/** Product image uploads (the storage bucket enforces the same limits). */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const STORAGE_PREFIX = 'kusoof.';

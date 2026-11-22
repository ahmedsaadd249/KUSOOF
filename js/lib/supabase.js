/* ==========================================================================
   Supabase clients (browser). Only PUBLIC values are used here: the project
   URL and the anon key from js/env.public.js. Every read and write is then
   limited by Row Level Security and server-side functions.

   Two separate sessions so the admin and a customer never share one:
     customer pages → storage key "kusoof-auth"
     /admin/        → storage key "kusoof-admin-auth"
   ========================================================================== */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let ENV = null;
try {
  ({ ENV } = await import('../env.public.js'));
} catch (e) {
  ENV = null;
}

export const env = Object.freeze({
  supabaseUrl: (ENV && ENV.SUPABASE_URL) || '',
  supabaseAnonKey: (ENV && ENV.SUPABASE_ANON_KEY) || '',
  appUrl: (ENV && ENV.APP_URL) || '',
  googleMapsApiKey: (ENV && ENV.GOOGLE_MAPS_API_KEY) || '',
  googleMapsMapId: (ENV && ENV.GOOGLE_MAPS_MAP_ID) || '',
});

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
if (!isConfigured) {
  console.error('KUSOOF: Supabase is not configured. Run `node scripts/write-env.mjs` after filling .env (see docs/SETUP.md).');
}

export const isAdminContext = /\/admin(\/|$)/.test(window.location.pathname);

let client = null;

/** The Supabase client for this page (admin pages get the admin session). */
export function sb() {
  if (!isConfigured) throw Object.assign(new Error('Supabase is not configured'), { code: 'not_configured' });
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storageKey: isAdminContext ? 'kusoof-admin-auth' : 'kusoof-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

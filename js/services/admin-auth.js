/* ==========================================================================
   Admin auth — passwordless: admin email + one-time code (Supabase Auth).
     requestAdminCode → Edge Function admin-request-code: emails a code ONLY
                        to the allowlisted admin email (public.admin_users)
     verifyAdminCode  → supabase.auth.verifyOtp, then is_admin() must be true
                        (anyone else is signed out at once)
   The session uses its own storage key ("kusoof-admin-auth", see
   js/lib/supabase.js). Every admin read/write is authorised server-side by
   RLS and admin RPCs — the browser gate here is only for the UI.
   ========================================================================== */
import { read, write, remove } from '../core/storage.js';
import { OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES } from '../config.js';
import { sb, ServiceError } from './api.js';

const PENDING = 'admin.pending';

/** { email, userId, name, signedInAt } when signed in as the admin, else null. */
export async function getAdminSession() {
  try {
    const { data } = await sb().auth.getSession();
    const session = data && data.session;
    if (!session) return null;
    const { data: isAdmin, error } = await sb().rpc('is_admin');
    if (error || isAdmin !== true) return null;
    const { data: profile } = await sb().from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
    return {
      email: session.user.email,
      userId: session.user.id,
      name: (profile && profile.full_name) || 'Store Admin',
      signedInAt: session.user.last_sign_in_at || new Date().toISOString(),
    };
  } catch (e) {
    return null;
  }
}

/** Calls fn(event) when the admin session changes (e.g. signed out in another tab). */
export function onAdminSessionChange(fn) {
  try {
    const { data } = sb().auth.onAuthStateChange((event) => setTimeout(() => fn(event), 0));
    return () => data.subscription.unsubscribe();
  } catch (e) {
    return () => {};
  }
}

/** The admin's display name (their own profile row; RLS allows only their own). */
export async function updateAdminName(userId, name) {
  const { error } = await sb().from('profiles').update({ full_name: String(name || '').trim() }).eq('id', userId);
  if (error) throw new ServiceError('server', { detail: error.message });
}

export async function adminSignOut() {
  remove(PENDING, 'session');
  try {
    await sb().auth.signOut();
  } catch (e) {
    /* already signed out */
  }
}

export function getAdminPending() {
  return read(PENDING, null, 'session');
}

export function cancelAdminCode() {
  remove(PENDING, 'session');
}

async function functionError(error) {
  let body = null;
  try {
    body = error && error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
  } catch (e) {
    body = null;
  }
  const code = body && body.error;
  if (code === 'not_admin') return new ServiceError('notAdmin');
  if (code === 'invalid_email') return new ServiceError('invalidEmail');
  if (code === 'rate_limited') {
    const m = String(body.message || '').match(/after (\d+) second/);
    return new ServiceError('rateLimited', { seconds: m ? Number(m[1]) : 60 });
  }
  if (!body) return new ServiceError('network');
  return new ServiceError('sendFailed', { detail: body.message || code || '' });
}

/** Emails a code to the admin email; throws ServiceError('notAdmin') for anyone else. */
export async function requestAdminCode(email) {
  const clean = String(email || '').trim().toLowerCase();
  const { error } = await sb().functions.invoke('admin-request-code', { body: { email: clean } });
  if (error) throw await functionError(error);
  write(PENDING, { email: clean, sentAt: Date.now(), attempts: 0 }, 'session');
  return { email: clean };
}

export async function resendAdminCode() {
  const p = getAdminPending();
  if (!p) throw new ServiceError('noPending');
  return requestAdminCode(p.email);
}

/** Returns { ok: true, session } or { ok: false, attemptsLeft, locked, expired, rateLimited, notAdmin }. */
export async function verifyAdminCode(code) {
  const p = getAdminPending();
  if (!p) throw new ServiceError('noPending');
  if (Date.now() - p.sentAt > OTP_TTL_MINUTES * 60 * 1000) return { ok: false, attemptsLeft: 0, locked: true, expired: true };
  if (p.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, attemptsLeft: 0, locked: true };

  const { data, error } = await sb().auth.verifyOtp({ email: p.email, token: String(code), type: 'email' });
  if (error || !data || !data.session) {
    if (error && error.status === 429) return { ok: false, attemptsLeft: 0, locked: true, rateLimited: true };
    const attempts = p.attempts + 1;
    write(PENDING, { ...p, attempts }, 'session');
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
    return { ok: false, attemptsLeft, locked: attemptsLeft === 0 };
  }

  const session = await getAdminSession();
  if (!session) {
    await adminSignOut();
    return { ok: false, attemptsLeft: 0, locked: true, notAdmin: true };
  }
  remove(PENDING, 'session');
  return { ok: true, session };
}

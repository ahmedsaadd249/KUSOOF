/* ==========================================================================
   Customer auth — passwordless: Supabase Auth email one-time codes.
     register  → signInWithOtp({ shouldCreateUser: true,  data: { full_name, locale } })
     signIn    → signInWithOtp({ shouldCreateUser: false })  (unknown email → noAccount)
     verify    → verifyOtp({ type: 'email' }) → Supabase session (persisted)
   The profile row is created by a database trigger on sign-up.

   Pages read the session synchronously (header, account), so a small
   mirror { customerId, name, email, phone, locale, createdAt } is kept in
   localStorage and re-checked against the real Supabase session on every
   page load (syncSession). The mirror is display data only — every read and
   write is authorised by Supabase with the real session.
   ========================================================================== */
import { read, write, remove, subscribe } from '../core/storage.js';
import { OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES } from '../config.js';
import { sb, ServiceError, toServiceError } from './api.js';

const SESSION = 'session.v2';
const PENDING = 'auth.pending';

export function getSession() {
  const s = read(SESSION, null);
  return s && s.email ? s : null;
}

export const onSessionChange = (fn) => subscribe(SESSION, fn);

async function loadMirror(user) {
  const { data: profile } = await sb().from('profiles').select('full_name, phone, locale, created_at').eq('id', user.id).maybeSingle();
  const mirror = {
    customerId: user.id,
    name: (profile && profile.full_name) || (user.user_metadata && user.user_metadata.full_name) || '',
    email: user.email,
    phone: (profile && profile.phone) || '',
    locale: (profile && profile.locale) || 'en',
    createdAt: (profile && profile.created_at) || user.created_at,
    verifiedAt: user.last_sign_in_at || new Date().toISOString(),
  };
  write(SESSION, mirror);
  return mirror;
}

/** Make the mirror match the real Supabase session (call on page load). */
export async function syncSession() {
  try {
    const { data } = await sb().auth.getSession();
    const session = data && data.session;
    if (!session) {
      if (read(SESSION, null)) remove(SESSION);
      return null;
    }
    const mirror = getSession();
    if (mirror && mirror.customerId === session.user.id) return mirror;
    return await loadMirror(session.user);
  } catch (e) {
    return getSession();
  }
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  try {
    sb().auth.onAuthStateChange((event) => {
      // never await Supabase calls inside this callback
      if (event === 'SIGNED_OUT') setTimeout(() => remove(SESSION), 0);
    });
  } catch (e) {
    /* not configured */
  }
}
listen();

export async function signOut() {
  remove(SESSION);
  try {
    await sb().auth.signOut();
  } catch (e) {
    /* session already gone */
  }
}

/** Is the signed-in user a store admin? (is_admin() on the server; false on any error) */
export async function isAdmin() {
  try {
    const { data, error } = await sb().rpc('is_admin');
    return !error && data === true;
  } catch (e) {
    return false;
  }
}

export function getPending() {
  return read(PENDING, null, 'session');
}

function otpError(error) {
  const msg = String((error && error.message) || '');
  if (error && (error.status === 429 || /only request this after|rate limit/i.test(msg))) {
    const m = msg.match(/after (\d+) second/);
    return new ServiceError('rateLimited', { seconds: m ? Number(m[1]) : 60 });
  }
  if (error && (error.code === 'otp_disabled' || /signups not allowed/i.test(msg))) return new ServiceError('noAccount');
  if (error && (error.code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg))) return new ServiceError('invalidEmail');
  return toServiceError(error, 'sendFailed');
}

async function sendCode({ email, createUser, data }) {
  const { error } = await sb().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: createUser, ...(data ? { data } : {}) },
  });
  if (error) throw otpError(error);
}

function savePending(p) {
  write(PENDING, { ...p, attempts: 0, sentAt: Date.now() }, 'session');
}

/** Create account: emails a code (an existing account simply gets a sign-in code). */
export async function register({ name, email, locale = 'en', next = '' }) {
  const clean = String(email).trim().toLowerCase();
  const fullName = String(name).trim();
  await sendCode({ email: clean, createUser: true, data: { full_name: fullName, locale } });
  savePending({ mode: 'register', name: fullName, email: clean, locale, next });
  return { email: clean };
}

/** Sign in: emails a code to an existing account only. */
export async function signIn({ email, locale = 'en', next = '' }) {
  const clean = String(email).trim().toLowerCase();
  await sendCode({ email: clean, createUser: false });
  savePending({ mode: 'signin', name: '', email: clean, locale, next });
  return { email: clean };
}

export async function resendCode() {
  const p = getPending();
  if (!p) throw new ServiceError('noPending');
  await sendCode({
    email: p.email,
    createUser: p.mode === 'register',
    data: p.mode === 'register' ? { full_name: p.name, locale: p.locale } : null,
  });
  savePending(p);
  return { email: p.email };
}

/** Returns { ok: true, session, next } or { ok: false, attemptsLeft, locked, expired, rateLimited }. */
export async function verifyCode(code) {
  const p = getPending();
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

  // Remember the language they shop in (emails follow the order's language);
  // fill in the name for a new account if the profile has none yet.
  const user = data.user;
  const patch = { locale: p.locale === 'ar' ? 'ar' : 'en' };
  if (p.mode === 'register' && p.name) {
    const { data: prof } = await sb().from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    if (!prof || !prof.full_name) patch.full_name = p.name;
  }
  await sb().from('profiles').update(patch).eq('id', user.id);

  const session = await loadMirror(user);
  remove(PENDING, 'session');
  return { ok: true, session, next: p.next || '' };
}

/** Keep the mirror's display name/phone in step with the latest checkout. */
export function updateSession(patch) {
  const s = getSession();
  if (s) write(SESSION, { ...s, ...patch });
}

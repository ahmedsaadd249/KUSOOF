/* ==========================================================================
   Shared service helpers: the error shape every service throws, mapping of
   Supabase / Postgres errors to it, and realtime change subscriptions.
   ========================================================================== */
import { sb } from '../lib/supabase.js';

export { sb };

/** Error shape every service throws: { code, ...details }. */
export class ServiceError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'ServiceError';
    this.code = code;
    Object.assign(this, details);
  }
}

const KNOWN = new Set([
  'not_authenticated', 'validation', 'delivery_disabled', 'invalid_zone', 'outside_egypt', 'empty_cart',
  'product_unavailable', 'insufficient_stock', 'forbidden', 'not_found', 'invalid_transition',
  'not_retryable', 'zone_in_use',
]);

/** Turn a supabase-js / PostgREST error into a ServiceError. */
export function toServiceError(error, fallback = 'server') {
  if (!error) return new ServiceError(fallback);
  if (error instanceof ServiceError) return error;
  if (error.code === 'not_configured') return new ServiceError('not_configured');
  const message = String(error.message || '');
  if (KNOWN.has(message)) {
    let detail = error.details || '';
    try {
      if (detail && detail.trim().startsWith('{')) detail = JSON.parse(detail);
    } catch (e) {
      /* keep text */
    }
    return new ServiceError(message, { detail, hint: error.hint || '' });
  }
  if (error.code === '42501' || /permission denied|row-level security/i.test(message)) return new ServiceError('forbidden');
  if (error.code === '23505') return new ServiceError('duplicate', { detail: error.details || '' });
  if (/Failed to fetch|NetworkError|network/i.test(message)) return new ServiceError('network');
  if (error.code === 'PGRST116') return new ServiceError('not_found');
  return new ServiceError(fallback, { detail: message });
}

/** Run a supabase-js query builder / promise and return data or throw a ServiceError. */
export async function run(promise, fallback) {
  let result;
  try {
    result = await promise;
  } catch (e) {
    throw toServiceError(e, fallback);
  }
  if (result && result.error) throw toServiceError(result.error, fallback);
  return result ? result.data : null;
}

/** Subscribe to changes on a table (RLS applies). Returns an unsubscribe function. */
export function watchTable(table, fn) {
  let channel = null;
  let timer = 0;
  try {
    channel = sb()
      .channel(`kusoof-${table}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(timer);
        timer = setTimeout(fn, 200);
      })
      .subscribe();
  } catch (e) {
    return () => {};
  }
  return () => {
    clearTimeout(timer);
    if (channel) sb().removeChannel(channel);
  };
}

/** Escape a search term for a PostgREST or()/ilike filter. */
export const searchTerm = (q) =>
  String(q || '')
    .trim()
    .replace(/[%_\\]/g, (c) => `\\${c}`)
    .replace(/[,()*:"]/g, ' ')
    .slice(0, 80);

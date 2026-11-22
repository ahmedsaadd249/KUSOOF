/* ==========================================================================
   Storage — JSON over localStorage / sessionStorage with an in-memory
   fallback (private mode, blocked storage) and change notifications,
   including changes made in other tabs.
   Phase 2: server-owned data (orders, products…) moves to the API; only
   per-device state (cart, locale, session token) stays here.
   ========================================================================== */
import { STORAGE_PREFIX } from '../config.js';

const memory = { local: new Map(), session: new Map() };
const listeners = new Map(); // key -> Set<fn>

function area(kind) {
  try {
    const s = kind === 'session' ? window.sessionStorage : window.localStorage;
    const probe = `${STORAGE_PREFIX}__probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch (e) {
    return null;
  }
}

const stores = { local: area('local'), session: area('session') };

export function read(key, fallback = null, kind = 'local') {
  const full = STORAGE_PREFIX + key;
  const s = stores[kind];
  try {
    const raw = s ? s.getItem(full) : memory[kind].get(full);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

/** Returns false when the browser refused to save (e.g. quota exceeded). */
export function write(key, value, kind = 'local') {
  const full = STORAGE_PREFIX + key;
  const raw = JSON.stringify(value);
  const s = stores[kind];
  let ok = true;
  try {
    if (s) s.setItem(full, raw);
    else memory[kind].set(full, raw);
  } catch (e) {
    ok = false;
  }
  if (ok) emit(key, value);
  return ok;
}

export function remove(key, kind = 'local') {
  const full = STORAGE_PREFIX + key;
  const s = stores[kind];
  try {
    if (s) s.removeItem(full);
    else memory[kind].delete(full);
  } catch (e) {
    /* ignore */
  }
  emit(key, null);
}

/** Remove every key starting with `prefix`. */
export function removePrefix(prefix, kind = 'local') {
  const full = STORAGE_PREFIX + prefix;
  const s = stores[kind];
  if (s) {
    Object.keys(s).filter((k) => k.startsWith(full)).forEach((k) => s.removeItem(k));
  } else {
    [...memory[kind].keys()].filter((k) => k.startsWith(full)).forEach((k) => memory[kind].delete(k));
  }
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

function emit(key, value) {
  const set = listeners.get(key);
  if (set) set.forEach((fn) => fn(value));
}

// Other tabs
window.addEventListener('storage', (e) => {
  if (!e.key || !e.key.startsWith(STORAGE_PREFIX)) return;
  const key = e.key.slice(STORAGE_PREFIX.length);
  let value = null;
  try {
    value = e.newValue == null ? null : JSON.parse(e.newValue);
  } catch (err) {
    value = null;
  }
  emit(key, value);
});

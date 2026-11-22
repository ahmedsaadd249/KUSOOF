/* ==========================================================================
   KUSOOF Admin — sign-in gate, shell, hash router, intro, live refresh.
   Sign-in is passwordless: admin email + one-time code (admin/login.js),
   verified by Supabase Auth; admin rights are checked by is_admin() and every
   read/write is authorised server-side (RLS + admin RPCs). This gate only
   decides what the browser shows.
   ========================================================================== */
import { esc, reduceMotion } from '../core/dom.js';
import { date, initials } from '../core/format.js';
import { refreshSettings } from '../services/settings.js';
import { watchOrders } from '../services/orders.js';
import { watchProducts } from '../services/products.js';
import { watchNotifications } from '../services/notifications.js';
import { getAdminSession, adminSignOut, onAdminSessionChange } from '../services/admin-auth.js';
import { toast } from '../core/ui.js';
import { ai } from './icons.js';
import { mountLogin } from './login.js';
import dashboard from './views/dashboard.js';
import products from './views/products.js';
import orders from './views/orders.js';
import customers from './views/customers.js';
import notifications from './views/notifications.js';
import settings from './views/settings.js';

const ROUTES = [
  { path: 'dashboard', label: 'Dashboard', icon: ai.dashboard, view: dashboard },
  { path: 'products', label: 'Products', icon: ai.products, view: products },
  { path: 'orders', label: 'Orders', icon: ai.orders, view: orders },
  { path: 'customers', label: 'Customers', icon: ai.customers, view: customers },
  { path: 'notifications', label: 'Email notifications', icon: ai.mail, view: notifications },
  { path: 'settings', label: 'Settings', icon: ai.settings, view: settings },
];

const gsap = window.gsap && !reduceMotion ? window.gsap : null;
const rail = document.querySelector('.rail');
const top = document.querySelector('.admin-top');
let viewEl = document.getElementById('view');
let current = null;
let rendering = 0;
let session = null;

function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, qs = ''] = raw.split('?');
  const [name, ...params] = path.split('/').filter(Boolean);
  return { name: name || 'dashboard', params, query: new URLSearchParams(qs) };
}

function renderRail() {
  rail.innerHTML = `
    <a class="rail__logo" href="#/dashboard" aria-label="KUSOOF admin home"><img src="../logo/kusoof-icon.png" alt="" /></a>
    <nav class="rail__nav" aria-label="Admin">
      ${ROUTES.map((r) => `<a class="rail__link" href="#/${r.path}" data-route="${r.path}">${r.icon()}<span class="rail__tip">${esc(r.label)}</span><span class="visually-hidden">${esc(r.label)}</span></a>`).join('')}
    </nav>
    <div class="rail__foot">
      <a class="rail__link" href="../index.html" target="_blank" rel="noopener">${ai.store()}<span class="rail__tip">View store</span><span class="visually-hidden">View store (opens in a new tab)</span></a>
      <button class="rail__link" type="button" data-signout>${ai.logout()}<span class="rail__tip">Sign out</span><span class="visually-hidden">Sign out</span></button>
    </div>`;
  rail.querySelector('[data-signout]').addEventListener('click', signOut);
}

/** Sign out → back to the sign-in screen (also used by Settings). */
async function signOut() {
  await adminSignOut();
  try {
    sessionStorage.setItem('kusoof.admin.signedout', '1');
  } catch (e) {}
  window.location.replace(window.location.pathname);
}

function renderTop(route) {
  const name = (session && session.name) || 'Admin';
  top.innerHTML = `
    <div>
      <h1 class="admin-top__title">${esc(route.view.title)}</h1>
      <p class="admin-top__sub">${esc(route.view.subtitle || date(Date.now(), 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p>
    </div>
    <div class="admin-top__actions">
      <a class="pill-link" href="../index.html" target="_blank" rel="noopener">${ai.external({ size: 15 })} View store</a>
      <a class="admin-avatar" href="#/settings" title="${esc(name)}" aria-label="Admin profile: ${esc(name)}">${esc(initials(name))}</a>
    </div>`;
}

const ctx = (route, parsed) => ({
  params: parsed.params,
  query: parsed.query,
  navigate: (hash) => {
    if (window.location.hash === hash) refresh();
    else window.location.hash = hash;
  },
  refresh: () => refresh(),
  rerenderShell: () => renderTop(route),
  session,
  signOut,
});

async function show({ animate = true } = {}) {
  const parsed = parse();
  const route = ROUTES.find((r) => r.path === parsed.name) || ROUTES[0];
  const token = ++rendering;
  rail.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === route.path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${route.view.title} — KUSOOF Admin`;

  if (animate && current) {
    viewEl.classList.add('is-leaving');
    await new Promise((r) => setTimeout(r, 160));
  }
  if (token !== rendering) return;
  renderTop(route);
  // A fresh element per render, so listeners a view attached last time are dropped
  const fresh = viewEl.cloneNode(false);
  fresh.classList.remove('is-leaving');
  viewEl.replaceWith(fresh);
  viewEl = fresh;
  try {
    await route.view.render(viewEl, ctx(route, parsed));
  } catch (err) {
    console.error(err);
    if (err && (err.code === 'forbidden' || err.code === 'not_authenticated')) {
      // The session ended or admin rights were removed: back to sign-in
      window.location.reload();
      return;
    }
    viewEl.innerHTML = `<section class="a-card"><p>Something went wrong loading this page${err && err.code === 'network' ? ' — check your connection' : ''}.</p><button class="btn btn--outline btn--sm" type="button" style="margin-top:12px" onclick="location.reload()">Try again</button></section>`;
  }
  if (token !== rendering) return;
  current = route;
  if (animate && gsap) {
    gsap.from(viewEl.querySelectorAll(':scope > *, .a-grid > *, .a-hero, .toolbar'), {
      autoAlpha: 0,
      y: 16,
      duration: 0.6,
      stagger: 0.035,
      ease: 'power3.out',
      clearProps: 'opacity,visibility,transform',
    });
  }
  if (animate) window.scrollTo({ top: 0 });
}

function refresh() {
  return show({ animate: false });
}

/* Live refresh from Supabase Realtime (e.g. a customer places an order) */
let liveTimer = 0;
function watchData() {
  const onChange = () => {
    if (document.querySelector('.panel, .modal')) return; // don't yank the page under an open panel
    clearTimeout(liveTimer);
    liveTimer = setTimeout(refresh, 300);
  };
  watchOrders(onChange);
  watchProducts(onChange);
  watchNotifications(onChange);
}

/* Intro: dark screen → circular reveal (once per session, and after signing in) */
function intro({ force = false } = {}) {
  const node = document.querySelector('.admin-intro');
  let seen = false;
  try {
    seen = sessionStorage.getItem('kusoof.admin.intro') === '1';
    sessionStorage.setItem('kusoof.admin.intro', '1');
  } catch (e) {
    seen = true;
  }
  if (force) seen = false;
  if (!node) return;
  if (seen || !gsap) {
    node.remove();
    return;
  }
  gsap
    .timeline({ onComplete: () => node.remove() })
    .from(node.querySelector('img'), { scale: 0.6, autoAlpha: 0, duration: 0.6, ease: 'power3.out' })
    .to(node.querySelector('.admin-intro__dot'), { scale: 1, duration: 0.35, ease: 'power2.out' }, '+=0.15')
    .to(node.querySelector('img'), { autoAlpha: 0, duration: 0.25 }, '<')
    // a light circle opens from the centre and reveals the dashboard (reference intro)
    .to(node, { '--r': '150vmax', duration: 1, ease: 'power3.in' }, '+=0.05')
    .to(node.querySelector('.admin-intro__dot'), { autoAlpha: 0, duration: 0.2 }, '<0.15');
}

function boot(signedIn, { justSignedIn = false } = {}) {
  session = signedIn;
  document.documentElement.classList.remove('admin-locked');
  document.getElementById('admin-login').remove();
  refreshSettings();
  renderRail();
  intro({ force: justSignedIn });
  watchData();
  window.addEventListener('hashchange', () => show());
  show();
  if (justSignedIn) setTimeout(() => toast(`Signed in as ${session.email}`), gsap ? 1600 : 0);
}

// Signed out in another tab (or the session ended) → lock this one too
onAdminSessionChange((event) => {
  if (event === 'SIGNED_OUT' && !document.documentElement.classList.contains('admin-locked')) window.location.reload();
});

const existing = await getAdminSession();
if (existing) boot(existing);
else {
  document.documentElement.classList.add('admin-locked');
  document.title = 'Sign in — KUSOOF Admin';
  let signedOut = false;
  try {
    signedOut = sessionStorage.getItem('kusoof.admin.signedout') === '1';
    sessionStorage.removeItem('kusoof.admin.signedout');
  } catch (e) {}
  mountLogin(document.getElementById('admin-login'), { onSignedIn: (signedIn) => boot(signedIn, { justSignedIn: true }) });
  if (signedOut) toast('You’ve been signed out.');
}

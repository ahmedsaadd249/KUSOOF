/* ==========================================================================
   Account — passwordless: create an account or sign in with an email
   address and a one-time code (Supabase Auth) → OTP page; or the signed-in
   overview with the customer's orders.
   ========================================================================== */
import { t, th, locale, esc } from '../core/i18n.js';
import { $, $$, param, reduceMotion } from '../core/dom.js';
import { bindForm, rules } from '../core/validate.js';
import { money, date, initials, firstName } from '../core/format.js';
import { toast } from '../core/ui.js';
import { getSession, signOut, register, signIn } from '../services/auth.js';
import { listOrders } from '../services/orders.js';
import { OTP_LENGTH, OTP_TTL_MINUTES } from '../config.js';
import { icons } from '../components/icons.js';
import { initPage, sessionReady } from './common.js';

initPage({ page: 'account', titleKey: 'meta.accountTitle' });

const next = param('next') || '';
const translate = (key, params) => t(key, params);

/* ---------- Signed in ---------- */
async function showOverview(session) {
  $('#account').hidden = false;
  $('#account-hello').innerHTML = th('account.hello', { name: firstName(session.name) });

  $('#account-card').innerHTML = `
    <div class="avatar" aria-hidden="true">${esc(initials(session.name))}</div>
    <p class="account-card__name">${esc(session.name)}</p>
    <p class="account-card__email"><span dir="ltr">${esc(session.email)}</span> <span class="badge badge--ok">${esc(t('common.verified'))}</span></p>
    <dl>
      <div><dt>${esc(t('account.memberSinceLabel'))}</dt><dd>${esc(date(session.createdAt || session.verifiedAt, locale))}</dd></div>
    </dl>
    <button class="btn btn--outline" type="button" id="sign-out">${esc(t('account.signOut'))}</button>`;

  $('#sign-out').addEventListener('click', async () => {
    await signOut();
    toast(t('account.signedOut'));
    setTimeout(() => window.location.replace('account.html'), 400);
  });

  let orders = [];
  try {
    orders = await listOrders();
  } catch (err) {
    toast(t('common.errorGeneric'), { tone: 'error' });
  }
  const list = $('#orders-list');
  list.removeAttribute('aria-busy');
  if (!orders.length) {
    list.innerHTML = `
      <div class="empty-state" style="align-items:flex-start;text-align:start;min-height:0;padding:12px 0">
        <p>${esc(t('account.noOrders'))}</p>
        <a class="btn btn--outline" href="products.html">${esc(t('account.startShopping'))} ${icons.arrow()}</a>
      </div>`;
    return;
  }
  list.innerHTML = orders
    .map((o) => {
      const count = o.items.reduce((s, i) => s + i.qty, 0);
      return `
        <div class="order-row">
          <div>
            <p class="order-row__id">${esc(o.id)}</p>
            <p class="order-row__meta">${esc(date(o.createdAt, locale))} · ${esc(t('account.orderItems', { count }))}</p>
          </div>
          <span class="badge" data-status="${esc(o.status)}">${esc(t(`status.${o.status}`))}</span>
          <span class="order-row__total">${esc(money(o.total, locale))}</span>
          <a class="btn btn--outline btn--sm" href="order-confirmation.html?order=${encodeURIComponent(o.id)}">${esc(t('account.viewOrder'))}</a>
        </div>`;
    })
    .join('');
}

/* ---------- Signed out ---------- */
function showAuth() {
  $('#auth').hidden = false;
  $('[data-icon="user"]').innerHTML = icons.user({ size: 22 });
  $$('[data-code-note]').forEach((n) => (n.textContent = t('account.codeNote', { count: OTP_LENGTH, minutes: OTP_TTL_MINUTES })));
  if (next) $('#auth-gate').hidden = false;

  /* Tabs */
  const tablist = $('.auth-tabs');
  const tabs = $$('[role="tab"]', tablist);
  function select(name, focus) {
    tablist.dataset.active = name;
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      $(`#${tab.getAttribute('aria-controls')}`).hidden = !on;
      if (on && focus) tab.focus();
    });
    const form = $(`#form-${name}`);
    if (window.gsap && !reduceMotion) window.gsap.from(form.children, { autoAlpha: 0, y: 10, duration: 0.5, stagger: 0.04, ease: 'power2.out', clearProps: 'all' });
  }
  tabs.forEach((tab) => tab.addEventListener('click', () => select(tab.dataset.tab)));
  tablist.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const current = tablist.dataset.active === 'create' ? 0 : 1;
    const nextIndex = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - current;
    select(tabs[nextIndex].dataset.tab, true);
  });
  if (param('tab') === 'signin') select('signin');

  function busy(form, on) {
    const btn = $('button[type="submit"]', form);
    const label = $('.btn__label', btn);
    if (on) {
      btn.dataset.label = label.textContent;
      btn.classList.add('is-busy');
      btn.setAttribute('aria-disabled', 'true');
      label.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(t('account.busy'))}`;
    } else {
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-disabled');
      label.textContent = btn.dataset.label;
    }
  }

  /** Errors from asking Supabase for a code. */
  function codeError(check, err) {
    if (err.code === 'noAccount') check.setError('email', 'errors.noAccount');
    else if (err.code === 'invalidEmail') check.setError('email', 'errors.email');
    else if (err.code === 'rateLimited') toast(t('errors.rateLimited', { seconds: err.seconds || 60 }), { tone: 'error' });
    else if (err.code === 'sendFailed') toast(t('errors.sendFailed'), { tone: 'error' });
    else toast(t('common.errorGeneric'), { tone: 'error' });
  }

  /* Create account */
  const createForm = $('#form-create');
  const create = bindForm(
    createForm,
    {
      name: [rules.required, rules.fullName],
      email: [rules.required, rules.email],
    },
    {
      translate,
      summary: $('.form-summary', createForm),
      onSubmit: async (values) => {
        busy(createForm, true);
        try {
          await register({ name: values.name, email: values.email, locale, next });
          window.location.href = 'verify.html';
        } catch (err) {
          busy(createForm, false);
          codeError(create, err);
        }
      },
    }
  );

  /* Sign in */
  const signinForm = $('#form-signin');
  const signin = bindForm(
    signinForm,
    { email: [rules.required, rules.email] },
    {
      translate,
      summary: $('.form-summary', signinForm),
      onSubmit: async (values) => {
        busy(signinForm, true);
        try {
          await signIn({ email: values.email, locale, next });
          window.location.href = 'verify.html';
        } catch (err) {
          busy(signinForm, false);
          codeError(signin, err);
        }
      },
    }
  );

  if (window.gsap && !reduceMotion) {
    window.gsap.from('.glass-card', { autoAlpha: 0, y: 26, scale: 0.98, duration: 1.1, ease: 'power3.out', clearProps: 'all' });
  }
}

const session = (await sessionReady) || getSession();
if (session) showOverview(session);
else showAuth();

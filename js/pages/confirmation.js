/* Order confirmation — the signed-in customer's order, read through RLS. */
import { t, th, loc, locale, esc } from '../core/i18n.js';
import { $, param, reduceMotion } from '../core/dom.js';
import { dateTime, firstName, phone, number } from '../core/format.js';
import { toast } from '../core/ui.js';
import { getOrder } from '../services/orders.js';
import { createMapPicker } from '../components/map-picker.js';
import { summaryItemsHTML, totalsHTML } from '../components/order-summary.js';
import { icons } from '../components/icons.js';
import { getSession } from '../services/auth.js';
import { initPage, sessionReady } from './common.js';

initPage({ page: 'cart', titleKey: 'meta.confirmTitle' });

const root = $('#confirm-root');

async function main() {
  const orderNo = param('order') || '';
  if (!((await sessionReady) || getSession())) {
    // Orders are private: sign in first, then come back here
    window.location.replace(`account.html?tab=signin&next=${encodeURIComponent(`order-confirmation.html?order=${orderNo}`)}`);
    return;
  }
  let order = null;
  try {
    order = await getOrder(orderNo);
  } catch (err) {
    order = null;
  }
  root.removeAttribute('aria-busy');

  if (!order) {
    document.title = t('meta.notFoundTitle');
    root.innerHTML = `
      <div class="empty-state" style="min-height: 50svh">
        <p class="empty-state__title">${esc(t('confirm.notFound'))}</p>
        <p>${esc(t('confirm.notFoundBody'))}</p>
        <div class="confirm-actions">
          <a class="btn btn--solid" href="products.html">${esc(t('confirm.continue'))}</a>
          <a class="btn btn--outline" href="account.html">${esc(t('confirm.account'))}</a>
        </div>
      </div>`;
    return;
  }

  const a = order.address;
  const addressLines = [
    [a.street, loc(a.area)].filter(Boolean).join(t('common.listSep')),
    `${t('checkout.building')} ${a.building} · ${t('checkout.apartment')} ${a.apartment}`,
    `${loc(a.governorate)}${t('common.listSep')}${t('checkout.countryEG')}`,
  ];

  root.innerHTML = `
    <section class="confirm-hero">
      <span class="confirm-check" aria-hidden="true">${icons.check({ size: 30, stroke: 1.8 })}</span>
      <p class="eyebrow">${esc(t('confirm.eyebrow'))}</p>
      <h1 class="confirm-hero__title display">${th('confirm.title', { name: firstName(order.customer.name) })}</h1>
      <p class="confirm-hero__body">${esc(t('confirm.body', { email: order.customer.email }))}</p>
      <div class="order-no">
        <span class="caps" style="color: var(--ink-60)">${esc(t('confirm.number'))}</span>
        <strong id="order-number">${esc(order.id)}</strong>
        <button class="btn btn--outline btn--sm" type="button" data-copy>${icons.copy({ size: 14 })} <span>${esc(t('common.copy'))}</span></button>
      </div>
    </section>

    <div class="confirm-grid">
      <section class="confirm-card confirm-card--wide" aria-labelledby="c-items">
        <h2 id="c-items">${esc(t('confirm.items'))}</h2>
        ${summaryItemsHTML(order.items)}
        ${totalsHTML({ subtotal: order.subtotal, delivery: order.deliveryFee, total: order.total })}
      </section>

      <section class="confirm-card" aria-labelledby="c-customer">
        <h2 id="c-customer">${esc(t('confirm.customer'))}</h2>
        <p>${esc(order.customer.name)}</p>
        <p class="muted" dir="ltr" style="text-align: start">${esc(order.customer.email)}</p>
        <p class="muted" dir="ltr" style="text-align: start">${esc(phone(order.customer.phone))}</p>
        <h2 style="margin-top: 20px">${esc(t('confirm.status'))}</h2>
        <p><span class="badge" data-status="${esc(order.status)}">${esc(t(`status.${order.status}`))}</span></p>
        <p class="muted" style="margin-top: 8px">${esc(t('confirm.placed'))}: ${esc(dateTime(order.createdAt, locale))}</p>
        <h2 style="margin-top: 20px">${esc(t('confirm.payment'))}</h2>
        <p>${esc(t('payment.cod'))} · <span class="muted">${esc(t(`payment.${order.payment.status}`))}</span></p>
      </section>

      <section class="confirm-card" aria-labelledby="c-delivery">
        <h2 id="c-delivery">${esc(t('confirm.delivery'))}</h2>
        ${addressLines.map((l) => `<p>${esc(l)}</p>`).join('')}
        ${a.instructions ? `<p class="muted" style="margin-top: 6px">“${esc(a.instructions)}”</p>` : ''}
        ${a.lat != null ? `<p class="muted" style="margin-top: 8px" dir="ltr">${esc(t('confirm.coords'))}: ${esc(number(a.lat, 'en', { minimumFractionDigits: 6 }))}, ${esc(number(a.lng, 'en', { minimumFractionDigits: 6 }))}</p>` : ''}
        ${a.lat != null ? '<div class="confirm-map" id="confirm-map"></div>' : ''}
      </section>
    </div>

    <div class="confirm-actions">
      <a class="btn btn--solid" href="products.html">${esc(t('confirm.continue'))} ${icons.arrow()}</a>
      <a class="btn btn--outline" href="account.html">${esc(t('confirm.account'))}</a>
    </div>`;

  if (a.lat != null) createMapPicker($('#confirm-map'), { pin: { lat: a.lat, lng: a.lng }, readonly: true });

  $('[data-copy]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(order.id);
    } catch (err) {
      const range = document.createRange();
      range.selectNodeContents($('#order-number'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand && document.execCommand('copy');
    }
    $('span', btn).textContent = t('common.copied');
    toast(`${t('common.copied')} · ${order.id}`);
    setTimeout(() => ($('span', btn).textContent = t('common.copy')), 1800);
  });

  if (window.gsap && !reduceMotion) {
    window.gsap.from('.confirm-hero > *', { autoAlpha: 0, y: 16, duration: 0.8, stagger: 0.08, ease: 'power3.out', clearProps: 'all' });
    window.gsap.from('.confirm-card, .confirm-actions', { autoAlpha: 0, y: 22, duration: 0.9, stagger: 0.1, delay: 0.3, ease: 'power3.out', clearProps: 'all' });
  }
}

main();

/* Cart page — lines, quantities, removal (with Undo), totals. */
import { t, loc, locale, esc } from '../core/i18n.js';
import { $, reduceMotion } from '../core/dom.js';
import { money } from '../core/format.js';
import * as cart from '../services/cart.js';
import { listZones, minFee as lowestFee } from '../services/zones.js';
import { productUrl } from '../components/product-card.js';
import { removeWithUndo } from '../components/cart-drawer.js';
import { totalsHTML } from '../components/order-summary.js';
import { icons } from '../components/icons.js';
import { initPage } from './common.js';

initPage({ page: 'cart', titleKey: 'meta.cartTitle' });

const rootEl = $('#cart-root');
const countEl = $('[data-cart-count]');
// Cheapest active delivery zone (the exact fee is set at checkout from the chosen area)
let minFee = null;
const zonesReady = listZones()
  .then((zones) => (minFee = lowestFee(zones)))
  .catch(() => (minFee = null));
let first = true;

function rowHTML(l) {
  const p = l.product;
  const name = p ? loc(p.name) : '';
  const img = p && p.images[0] ? p.images[0].light || p.images[0].src : '';
  return `
    <div class="cart-row${l.available ? '' : ' is-unavailable'}" data-id="${esc(l.id)}">
      <div class="cart-row__product">
        <a class="cart-row__media" href="${productUrl(l.id)}" tabindex="-1" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" width="960" height="540" />` : ''}</a>
        <div>
          <p class="cart-line__cat">${esc(p ? loc(p.category) : '')}</p>
          <h2 class="cart-row__name"><a href="${productUrl(l.id)}">${esc(name)}</a></h2>
          ${l.available ? '' : `<p class="cart-line__warn">${esc(t('cart.unavailable'))}</p>`}
          ${l.available && l.qty >= l.maxQty ? `<p class="cart-line__warn">${esc(t('cart.stockCap', { count: l.maxQty }))}</p>` : ''}
          <button class="cart-row__remove" type="button" data-remove aria-label="${esc(t('cart.removeAria', { name }))}">${esc(t('cart.remove'))}</button>
        </div>
      </div>
      <div class="cart-row__price">${l.available ? esc(money(l.unitPrice, locale)) : '—'}</div>
      <div class="cart-row__qty">
        ${
          l.available
            ? `<div class="qty" role="group" aria-label="${esc(t('cart.qtyFor', { name }))}">
                <button type="button" data-step="-1" aria-label="${esc(t('product.decrease'))}"${l.qty <= 1 ? ' disabled' : ''}>&minus;</button>
                <output aria-live="polite">${l.qty}</output>
                <button type="button" data-step="1" aria-label="${esc(t('product.increase'))}"${l.qty >= l.maxQty ? ' disabled' : ''}>+</button>
              </div>`
            : ''
        }
      </div>
      <div class="cart-row__total">${l.available ? esc(money(l.lineTotal, locale)) : ''}</div>
    </div>`;
}

async function render() {
  let d;
  try {
    [d] = await Promise.all([cart.cartDetails(), zonesReady]);
  } catch (err) {
    rootEl.removeAttribute('aria-busy');
    rootEl.innerHTML = `<div class="empty-state"><p class="empty-state__title">${esc(t('common.errorGeneric'))}</p><button class="btn btn--outline" type="button" onclick="location.reload()">${esc(t('common.retry'))}</button></div>`;
    return;
  }
  rootEl.removeAttribute('aria-busy');
  countEl.textContent = d.count ? t('cart.items', { count: d.count }) : '';

  if (!d.lines.length) {
    rootEl.innerHTML = `
      <div class="empty-state" style="min-height: 40svh">
        <span class="glass-icon" aria-hidden="true">${icons.bag({ size: 28 })}</span>
        <p class="empty-state__title">${esc(t('cart.empty'))}</p>
        <p>${esc(t('cart.emptyBody'))}</p>
        <a class="btn btn--solid" href="products.html">${esc(t('cart.continue'))} ${icons.arrow()}</a>
      </div>`;
    return;
  }

  const hasAvailable = d.lines.some((l) => l.available);
  rootEl.innerHTML = `
    <div class="shop__grid">
      <section aria-label="${esc(t('cart.pageEyebrow'))}">
        <div class="cart-table__head" aria-hidden="true">
          <span>${esc(t('cart.colProduct'))}</span><span>${esc(t('cart.colPrice'))}</span><span>${esc(t('cart.colQty'))}</span><span style="text-align:end">${esc(t('cart.colTotal'))}</span>
        </div>
        <div class="cart-rows">${d.lines.map(rowHTML).join('')}</div>
      </section>
      <aside class="summary" aria-labelledby="summary-title">
        <h2 class="summary__title" id="summary-title">${esc(t('cart.summary'))}</h2>
        ${totalsHTML({
          subtotal: d.subtotal,
          delivery: minFee == null ? t('checkout.selectArea') : t('cart.deliveryEstimate', { fee: money(minFee, locale) }),
          total: d.subtotal + (d.subtotal && minFee != null ? minFee : 0),
          totalLabel: t('cart.estimatedTotal'),
        })}
        <p class="summary__note">${esc(t('cart.secure'))}</p>
        <div class="summary__actions">
          <a class="btn btn--solid" href="checkout.html"${hasAvailable ? '' : ' aria-disabled="true" tabindex="-1"'}>${esc(t('cart.proceed'))} ${icons.arrow()}</a>
          <a class="btn btn--outline" href="products.html">${esc(t('cart.continue'))}</a>
        </div>
      </aside>
    </div>`;

  if (first && window.gsap && !reduceMotion) {
    window.gsap.from('.cart-row, .summary', { autoAlpha: 0, y: 18, duration: 0.8, stagger: 0.08, ease: 'power3.out', clearProps: 'all' });
  }
  first = false;
}

rootEl.addEventListener('click', async (e) => {
  const row = e.target.closest('.cart-row');
  if (!row) return;
  const id = row.dataset.id;
  const step = e.target.closest('[data-step]');
  if (step) {
    const d = await cart.cartDetails();
    const line = d.lines.find((l) => l.id === id);
    if (line) cart.setQty(id, line.qty + Number(step.dataset.step), { max: line.maxQty });
    return;
  }
  if (e.target.closest('[data-remove]')) {
    removeWithUndo(id, row.querySelector('.cart-row__name').textContent.trim());
  }
});

// Keep focus on the stepper that was used after re-render
rootEl.addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (!step) return;
  const id = step.closest('.cart-row').dataset.id;
  const dir = step.dataset.step;
  setTimeout(() => {
    const again = rootEl.querySelector(`.cart-row[data-id="${CSS.escape(id)}"] [data-step="${dir}"]`);
    if (again && !again.disabled) again.focus();
  }, 220);
});

cart.onCartChange(render);
render();

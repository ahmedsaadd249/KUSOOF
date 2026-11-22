/* ==========================================================================
   Mini-cart drawer + "Add to Cart" handling for every customer page.
   Any [data-add-to-cart][data-id] button adds that product;
   [data-qty-from="#selector"] reads the quantity from an <output>/<input>.
   ========================================================================== */
import { t, loc, locale, esc } from '../core/i18n.js';
import { $, trapFocus, lockScroll, unlockScroll } from '../core/dom.js';
import { money } from '../core/format.js';
import { toast } from '../core/ui.js';
import { getProduct } from '../services/products.js';
import * as cart from '../services/cart.js';
import { icons } from './icons.js';
import { productUrl } from './product-card.js';

let drawer;
let panel;
let list;
let foot;
let total;
let returnFocus = null;

const isOpen = () => drawer && drawer.classList.contains('is-open');

function lineHTML(l) {
  const p = l.product;
  const name = p ? loc(p.name) : '';
  const img = p && p.images[0] ? p.images[0].light || p.images[0].src : '';
  return `
    <div class="cart-line" data-id="${esc(l.id)}">
      <a class="cart-line__media" href="${productUrl(l.id)}" tabindex="-1" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" width="960" height="540" decoding="async" />` : ''}</a>
      <div>
        <p class="cart-line__cat">${esc(p ? loc(p.category) : '')}</p>
        <h3 class="cart-line__name"><a href="${productUrl(l.id)}">${esc(name)}</a></h3>
        <p class="cart-line__price">${l.available ? esc(money(l.unitPrice, locale)) : esc(t('cart.unavailable'))}</p>
        <div class="cart-line__row">
          ${
            l.available
              ? `<div class="qty qty--sm" role="group" aria-label="${esc(t('cart.qtyFor', { name }))}">
                  <button type="button" data-step="-1" aria-label="${esc(t('product.decrease'))}"${l.qty <= 1 ? ' disabled' : ''}>&minus;</button>
                  <output aria-live="polite">${l.qty}</output>
                  <button type="button" data-step="1" aria-label="${esc(t('product.increase'))}"${l.qty >= l.maxQty ? ' disabled' : ''}>+</button>
                </div>`
              : '<span></span>'
          }
          <button class="cart-line__remove" type="button" data-remove aria-label="${esc(t('cart.removeAria', { name }))}">${esc(t('cart.remove'))}</button>
        </div>
      </div>
    </div>`;
}

async function render() {
  const details = await cart.cartDetails();
  total.textContent = t('cart.items', { count: details.count });
  foot.hidden = details.lines.length === 0;
  if (!details.lines.length) {
    list.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">${esc(t('cart.empty'))}</p>
        <p>${esc(t('cart.emptyBody'))}</p>
        <a class="btn btn--outline" href="products.html">${esc(t('cart.explore'))} ${icons.arrow()}</a>
      </div>`;
    return;
  }
  list.innerHTML = details.lines.map(lineHTML).join('');
  $('[data-subtotal]', drawer).textContent = money(details.subtotal, locale);
}

export function openCart() {
  if (isOpen()) return;
  returnFocus = document.activeElement;
  render();
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  lockScroll('cart');
  setTimeout(() => $('.cart-drawer__close', drawer).focus(), 80);
}

export function closeCart() {
  if (!isOpen()) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  unlockScroll('cart');
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
}

/** Remove a line with an Undo toast (shared with the cart page). */
export function removeWithUndo(id, name) {
  const snapshot = cart.getCart();
  cart.remove(id);
  toast(t('cart.removed', { name }), { action: { label: t('common.undo'), onClick: () => cart.restore(snapshot) } });
}

async function addFromButton(btn) {
  const p = await getProduct(btn.dataset.id);
  if (!p) return;
  let qty = 1;
  if (btn.dataset.qtyFrom) {
    const src = document.querySelector(btn.dataset.qtyFrom);
    if (src) qty = Math.max(1, Number(src.value || src.textContent) || 1);
  }
  const res = cart.add(p.id, qty, { max: p.stock });
  const name = loc(p.name);
  if (res.qty === 0) return;

  const label = $('.btn__label', btn);
  if (label) {
    if (!btn.dataset.label) btn.dataset.label = label.innerHTML;
    label.innerHTML = `${icons.check()} ${esc(t('card.added'))}`;
    btn.classList.add('is-added');
    clearTimeout(Number(btn.dataset.timer));
    btn.dataset.timer = String(
      setTimeout(() => {
        label.innerHTML = btn.dataset.label;
        btn.classList.remove('is-added');
      }, 1600)
    );
  }
  const msg = res.capped ? t('cart.stockCap', { count: res.qty }) : qty > 1 ? t('cart.addedQty', { name, count: qty }) : t('cart.added', { name });
  toast(msg, { action: { label: t('cart.viewCart'), onClick: openCart } });
}

export function mountCartDrawer() {
  drawer = document.createElement('div');
  drawer.className = 'cart-drawer';
  drawer.id = 'cart-drawer';
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `
    <div class="cart-drawer__scrim" data-close></div>
    <aside class="cart-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" tabindex="-1">
      <div class="cart-drawer__head">
        <h2 class="cart-drawer__title" id="cart-drawer-title">${esc(t('cart.drawerTitle'))} <span data-total></span></h2>
        <button class="icon-btn cart-drawer__close" type="button" data-close aria-label="${esc(t('cart.close'))}">${icons.close()}</button>
      </div>
      <div class="cart-drawer__list" data-lenis-prevent></div>
      <div class="cart-drawer__foot">
        <div class="cart-drawer__row"><span class="caps">${esc(t('cart.subtotal'))}</span><strong data-subtotal></strong></div>
        <p class="cart-drawer__note">${esc(t('cart.secure'))}</p>
        <div class="cart-drawer__actions">
          <a class="btn btn--outline" href="cart.html">${esc(t('cart.viewCart'))}</a>
          <a class="btn btn--solid" href="checkout.html">${esc(t('cart.checkout'))}</a>
        </div>
      </div>
    </aside>`;
  document.body.appendChild(drawer);
  panel = $('.cart-drawer__panel', drawer);
  list = $('.cart-drawer__list', drawer);
  foot = $('.cart-drawer__foot', drawer);
  total = $('[data-total]', drawer);

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeCart();
  });
  list.addEventListener('click', async (e) => {
    const row = e.target.closest('.cart-line');
    if (!row) return;
    const id = row.dataset.id;
    const step = e.target.closest('[data-step]');
    if (step) {
      const details = await cart.cartDetails();
      const line = details.lines.find((l) => l.id === id);
      if (line) cart.setQty(id, line.qty + Number(step.dataset.step), { max: line.maxQty });
      return;
    }
    if (e.target.closest('[data-remove]')) {
      const name = $('.cart-line__name', row).textContent;
      removeWithUndo(id, name);
      panel.focus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') closeCart();
    else trapFocus(panel, e);
  });
  document.addEventListener('cart:open', openCart);
  cart.onCartChange(() => isOpen() && render());

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (btn && !btn.disabled) addFromButton(btn);
  });
}

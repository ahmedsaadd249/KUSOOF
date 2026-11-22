/* Order summary pieces shared by cart, checkout and confirmation. */
import { t, loc, locale, esc } from '../core/i18n.js';
import { money } from '../core/format.js';

/** items: [{ name:{en,ar}|string, qty, price|unitPrice, image }] */
export function summaryItemsHTML(items) {
  return `
    <div class="summary__items">
      ${items
        .map((it) => {
          const price = it.price ?? it.unitPrice ?? 0;
          return `
          <div class="summary__item">
            <span class="summary__thumb">${it.image ? `<img src="${esc(it.image)}" alt="" width="960" height="540" decoding="async" />` : ''}<span class="summary__qty">${esc(it.qty)}</span></span>
            <span class="summary__name">${esc(loc(it.name))}<small>${esc(money(price, locale))} × ${esc(it.qty)}</small></span>
            <span class="summary__price">${esc(money(price * it.qty, locale))}</span>
          </div>`;
        })
        .join('')}
    </div>`;
}

/** rows: subtotal, delivery (number | string), total */
export function totalsHTML({ subtotal, delivery, total, totalLabel = t('cart.total') }) {
  const deliveryText = typeof delivery === 'number' ? money(delivery, locale) : delivery;
  return `
    <div class="summary__row"><span>${esc(t('cart.subtotal'))}</span><strong>${esc(money(subtotal, locale))}</strong></div>
    <div class="summary__row"><span>${esc(t('cart.delivery'))}</span><strong>${esc(deliveryText)}</strong></div>
    <div class="summary__row summary__row--total"><span>${esc(totalLabel)}</span><strong data-total>${esc(money(total, locale))}</strong></div>`;
}

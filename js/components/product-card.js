/* Product card — Products page and "Also in the collection". */
import { t, loc, locale, esc } from '../core/i18n.js';
import { money } from '../core/format.js';
import { stockState } from '../services/products.js';

export const productUrl = (id) => `product.html?id=${encodeURIComponent(id)}`;

/** Responsive <img>: light WebP for small draws, the original otherwise. */
export function imgHTML(image, { className = '', sizes = '100vw', alt, eager = false } = {}) {
  if (!image) return `<span class="${className} img-missing" aria-hidden="true"></span>`;
  const altText = alt ?? loc(image.alt);
  const srcset = image.light && image.light !== image.src ? ` srcset="${esc(image.light)} 960w, ${esc(image.src)} 1672w" sizes="${esc(sizes)}"` : '';
  return `<img class="${className}" src="${esc(image.src)}"${srcset} width="${image.w || 1672}" height="${image.h || 941}" alt="${esc(altText)}" decoding="async"${eager ? '' : ' loading="lazy"'} />`;
}

export function stockBadge(p) {
  const state = stockState(p);
  if (state === 'out') return `<span class="badge badge--err">${esc(t('card.outOfStock'))}</span>`;
  if (state === 'low') return `<span class="badge badge--warn">${esc(t('card.lowStock', { count: p.stock }))}</span>`;
  return '';
}

export function cardHTML(p, { heading = 'h2', sizes = '(min-width: 900px) 46vw, 92vw', eager = false } = {}) {
  const url = productUrl(p.id);
  const name = loc(p.name);
  const out = stockState(p) === 'out';
  return `
    <article class="card" data-product="${esc(p.id)}">
      <a class="card__media" href="${url}" tabindex="-1" aria-hidden="true">
        <span class="card__index">${esc(p.index || '')}</span>
        ${imgHTML(p.images[0], { className: 'card__image', sizes, alt: '', eager })}
      </a>
      <div class="card__body">
        <div class="card__meta">
          <p class="card__category">${esc(loc(p.category))}</p>
          ${stockBadge(p)}
        </div>
        <${heading} class="card__name">${esc(name)}</${heading}>
        <p class="card__desc">${esc(loc(p.short))}</p>
        <div class="card__footer">
          <p class="card__price">${esc(money(p.price, locale))}</p>
          <div class="card__actions">
            <a class="btn btn--outline" href="${url}" aria-label="${esc(t('card.viewDetailsAria', { name }))}">${esc(t('card.viewDetails'))}</a>
            <button class="btn btn--solid" type="button" data-add-to-cart data-id="${esc(p.id)}" aria-label="${esc(t('card.addToCartAria', { name }))}"${out ? ' disabled' : ''}>
              <span class="btn__label">${esc(out ? t('card.outOfStock') : t('card.addToCart'))}</span>
            </button>
          </div>
        </div>
      </div>
    </article>`;
}

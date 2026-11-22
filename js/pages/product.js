/* Product details page (product.html?id=sunglasses | optical). */
import { t, loc, locale, esc } from '../core/i18n.js';
import { $, $$, param, reduceMotion } from '../core/dom.js';
import { money } from '../core/format.js';
import { getProduct, listProducts, stockState } from '../services/products.js';
import { MAX_QTY } from '../services/cart.js';
import { cardHTML, imgHTML, stockBadge } from '../components/product-card.js';
import { openLightbox } from '../components/lightbox.js';
import { icons } from '../components/icons.js';
import { initPage } from './common.js';

initPage({ page: 'products' });

const mount = $('#pdp');
const crumb = $('[data-crumb]');
const SIZES = '(min-width: 960px) 54vw, 92vw';

async function main() {
  let p = null;
  try {
    p = await getProduct(param('id'));
  } catch (err) {
    p = null;
  }
  mount.removeAttribute('aria-busy');

  if (!p) {
    document.title = t('meta.notFoundTitle');
    crumb.textContent = t('product.notFoundEyebrow');
    mount.innerHTML = '';
    $('#not-found').hidden = false;
    return;
  }

  const name = loc(p.name);
  document.title = t('meta.productTitle', { name });
  const meta = $('meta[name="description"]');
  if (meta) meta.setAttribute('content', loc(p.short));
  crumb.textContent = name;

  const state = stockState(p);
  const max = Math.min(MAX_QTY, Math.max(0, p.stock));
  const multi = p.images.length > 1;

  mount.innerHTML = `
    <article class="pdp" aria-labelledby="pdp-name">
      <div class="pdp__gallery">
        <div class="pdp__stage" role="button" tabindex="0" aria-label="${esc(t('product.zoom'))}">
          ${imgHTML(p.images[0], { className: 'pdp__image', sizes: SIZES, eager: true })}
          <span class="pdp__zoom" aria-hidden="true">${icons.zoom({ size: 14 })} ${esc(t('product.zoom'))}</span>
        </div>
        ${
          multi
            ? `<div class="pdp__thumbs" role="group" aria-label="${esc(t('product.views'))}">
                ${p.images
                  .map(
                    (im, i) => `
                  <button class="pdp__thumb" type="button" data-index="${i}" aria-pressed="${i === 0}">
                    <img src="${esc(im.light || im.src)}" width="${im.w || 960}" height="${im.h || 540}" alt="" decoding="async" />
                    <span>${esc(loc(im.label))}</span>
                  </button>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>

      <div class="pdp__info">
        <p class="pdp__category">${esc(loc(p.category))}</p>
        <h1 class="pdp__name" id="pdp-name">${esc(name)}</h1>
        <p class="pdp__price">${esc(money(p.price, locale))}</p>
        ${state !== 'in' ? `<div class="pdp__stock">${stockBadge(p)}</div>` : ''}
        <div class="pdp__desc">${loc(p.description).map((para) => `<p>${esc(para)}</p>`).join('')}</div>

        <div class="pdp__buy">
          <div class="qty" role="group" aria-label="${esc(t('product.quantity'))}">
            <button type="button" data-step="-1" aria-label="${esc(t('product.decrease'))}" disabled>&minus;</button>
            <output id="pdp-qty" aria-live="polite">1</output>
            <button type="button" data-step="1" aria-label="${esc(t('product.increase'))}"${max <= 1 ? ' disabled' : ''}>+</button>
          </div>
          <button class="btn btn--solid btn--block" type="button" data-add-to-cart data-id="${esc(p.id)}" data-qty-from="#pdp-qty"${state === 'out' ? ' disabled' : ''}>
            <span class="btn__label">${esc(state === 'out' ? t('card.outOfStock') : t('card.addToCart'))}</span>
          </button>
        </div>
        <p class="pdp__note">${esc(t('product.note'))}</p>

        ${
          p.specs && p.specs.length
            ? `<dl class="pdp__specs">${p.specs.map((s) => `<div><dt>${esc(loc(s.label))}</dt><dd>${esc(loc(s.value))}</dd></div>`).join('')}</dl>`
            : ''
        }

        <div class="accordion">
          ${
            loc(p.details).length
              ? `<details open><summary>${esc(t('product.details'))} <i aria-hidden="true"></i></summary><ul>${loc(p.details).map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>`
              : ''
          }
          <details><summary>${esc(t('product.care'))} <i aria-hidden="true"></i></summary>
            <ul><li>${esc(t('product.care1'))}</li><li>${esc(t('product.care2'))}</li><li>${esc(t('product.care3'))}</li></ul>
          </details>
        </div>

        <a class="pdp__back" href="products.html">${icons.back()} ${esc(t('product.back'))}</a>
      </div>
    </article>`;

  /* Quantity (capped by stock) */
  const out = $('#pdp-qty');
  const [minus, plus] = $$('.pdp__buy .qty button', mount);
  $('.pdp__buy .qty', mount).addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (!step) return;
    const q = Math.min(Math.max(1, max), Math.max(1, Number(out.value) + Number(step.dataset.step)));
    out.value = String(q);
    minus.disabled = q <= 1;
    plus.disabled = q >= max;
  });

  /* Gallery */
  const mainImg = $('.pdp__image', mount);
  let current = 0;
  function showImage(i) {
    if (i === current) return;
    current = i;
    $$('.pdp__thumb', mount).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.index) === i)));
    const im = p.images[i];
    mainImg.classList.add('is-swapping');
    setTimeout(() => {
      if (im.light && im.light !== im.src) mainImg.srcset = `${im.light} 960w, ${im.src} 1672w`;
      else mainImg.removeAttribute('srcset');
      mainImg.src = im.src;
      mainImg.alt = loc(im.alt);
      const done = () => mainImg.classList.remove('is-swapping');
      if (mainImg.decode) mainImg.decode().then(done, done);
      else done();
    }, reduceMotion ? 0 : 280);
  }
  mount.addEventListener('click', (e) => {
    const thumb = e.target.closest('.pdp__thumb');
    if (thumb) showImage(Number(thumb.dataset.index));
  });
  const stage = $('.pdp__stage', mount);
  stage.addEventListener('click', () => openLightbox(p.images, current));
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openLightbox(p.images, current);
    }
  });

  /* Also in the collection */
  const others = (await listProducts().catch(() => [])).filter((x) => x.id !== p.id);
  if (others.length) {
    $('#related-grid').innerHTML = others.map((x) => cardHTML(x, { heading: 'h3', sizes: '(min-width: 700px) 640px, 92vw' })).join('');
    $('#related').hidden = false;
  }

  /* Motion */
  if (window.gsap && !reduceMotion) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    const done = { clearProps: 'transform,opacity,visibility' };
    window.gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .from('.pdp__stage', { autoAlpha: 0, y: 24, duration: 1.3, ...done })
      .from('.pdp__thumbs', { autoAlpha: 0, duration: 0.9, ...done }, '<0.4')
      .from('.pdp__info > *', { autoAlpha: 0, y: 18, duration: 1, stagger: 0.06, ...done }, '<-0.1');
    window.gsap.from('.related .related__head > *, .related .card', {
      autoAlpha: 0,
      y: 36,
      duration: 1.2,
      stagger: 0.12,
      ease: 'power3.out',
      ...done,
      scrollTrigger: { trigger: '.related', start: 'top 85%' },
    });
  }
}

main();

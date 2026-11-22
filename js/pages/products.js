/* Products page — the two collection pieces from the product service. */
import { t, esc } from '../core/i18n.js';
import { $, $$, reduceMotion, splitWords } from '../core/dom.js';
import { listProducts, watchProducts } from '../services/products.js';
import { cardHTML } from '../components/product-card.js';
import { initPage } from './common.js';

initPage({ page: 'products', titleKey: 'meta.productsTitle', descKey: 'meta.productsDesc' });

const grid = $('#product-grid');
const countEl = $('[data-collection-count]');

async function render({ animate = false } = {}) {
  let products;
  try {
    products = await listProducts();
  } catch (err) {
    grid.removeAttribute('aria-busy');
    grid.innerHTML = `<p class="collection__noscript">${esc(t('common.errorGeneric'))} <button class="btn btn--outline btn--sm" type="button" onclick="location.reload()">${esc(t('common.retry'))}</button></p>`;
    return;
  }
  countEl.textContent = t('products.count', { count: products.length });
  grid.removeAttribute('aria-busy');
  grid.innerHTML = products.length
    ? products.map((p) => cardHTML(p, { eager: true })).join('')
    : `<p class="collection__noscript">${esc(t('products.empty'))}</p>`;
  if (animate && window.gsap && !reduceMotion) {
    window.gsap.from($$('.card', grid), {
      autoAlpha: 0,
      y: 48,
      duration: 1.3,
      stagger: 0.15,
      ease: 'power3.out',
      clearProps: 'transform,opacity,visibility',
      scrollTrigger: { trigger: grid, start: 'top 90%' },
    });
  }
}

render({ animate: true });
// Admin edits (price, stock, availability) show up live, even from another tab
watchProducts(() => render());

if (window.gsap && !reduceMotion) {
  window.gsap.registerPlugin(window.ScrollTrigger);
  const words = splitWords($('.collection-hero__title'));
  const done = { clearProps: 'transform,opacity,visibility' };
  window.gsap
    .timeline({ defaults: { ease: 'power3.out' } })
    .from('.collection-hero .eyebrow', { autoAlpha: 0, y: 12, duration: 0.9 })
    .from(words, { yPercent: 115, opacity: 0, duration: 1.25, stagger: 0.08 }, '<0.1')
    .from('.collection-hero__sub', { autoAlpha: 0, y: 14, duration: 1, ...done }, '<0.45')
    .from('.collection__bar', { autoAlpha: 0, duration: 0.9, ...done }, '<0.2');
  window.gsap.from('.story > *', {
    autoAlpha: 0,
    y: 24,
    duration: 1.1,
    stagger: 0.12,
    ease: 'power3.out',
    ...done,
    scrollTrigger: { trigger: '.story', start: 'top 85%' },
  });
}

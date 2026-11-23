/* ==========================================================================
   Rate an order — reached from the stars in the "Delivered" email:
   rate.html?t=<order's rating token>&r=<1-5>&lang=en|ar. No sign-in needed.
   The chosen star is pre-selected; the customer confirms, may add a comment,
   and can come back later to change it.
   ========================================================================== */
import { t, th, loc, locale, esc } from '../core/i18n.js';
import { $, $$, param, reduceMotion } from '../core/dom.js';
import { toast } from '../core/ui.js';
import { getRatingContext, submitRating } from '../services/ratings.js';
import { icons } from '../components/icons.js';
import { initPage } from './common.js';

initPage({ page: 'rate', titleKey: 'meta.rateTitle' });

const root = $('#rate');
const token = param('t') || '';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';

function message(iconName, title, body) {
  root.innerHTML = `
    <div class="glass-card__icon" aria-hidden="true">${icons[iconName]({ size: 22 })}</div>
    <h1 class="glass-card__title">${esc(title)}</h1>
    <p class="glass-card__sub">${esc(body)}</p>
    <a class="btn btn--solid rate__cta" href="products.html">${esc(t('rate.shop'))} ${icons.arrow()}</a>`;
}

function starsHTML(selected) {
  return [1, 2, 3, 4, 5]
    .map(
      (n) => `
      <input class="rate__radio visually-hidden" type="radio" name="rating" id="star-${n}" value="${n}"${n === selected ? ' checked' : ''} />
      <label class="rate__star" for="star-${n}" title="${esc(t(`rate.star${n}`))}">${STAR}<span class="visually-hidden">${esc(t('rate.starsOf', { n }))}</span></label>`
    )
    .join('');
}

function paintStars(form) {
  const value = Number((form.querySelector('input[name="rating"]:checked') || {}).value || 0);
  $$('.rate__star', form).forEach((l, i) => l.classList.toggle('is-on', i < value));
  $('[data-star-label]', form).textContent = value ? t(`rate.star${value}`) : t('rate.pick');
  $('[type="submit"]', form).disabled = !value;
}

async function main() {
  let ctx = null;
  try {
    ctx = await getRatingContext(token);
  } catch (err) {
    root.removeAttribute('aria-busy');
    message('mail', t('common.errorGeneric'), t('errors.network'));
    return;
  }
  root.removeAttribute('aria-busy');
  if (!ctx) return message('mail', t('rate.invalidTitle'), t('rate.invalidBody'));
  if (!ctx.canRate) return message('mail', t('rate.notYetTitle'), t('rate.notYetBody', { number: ctx.orderNumber }));

  const fromLink = Number(param('r'));
  const selected = fromLink >= 1 && fromLink <= 5 ? fromLink : ctx.rating || 0;

  root.innerHTML = `
    <div class="glass-card__icon" aria-hidden="true">${icons.sparkle({ size: 22 })}</div>
    <h1 class="glass-card__title">${th('rate.title', { name: ctx.firstName })}</h1>
    <p class="glass-card__sub">${esc(ctx.rating ? t('rate.subChange') : t('rate.sub'))} <span class="rate__order" dir="ltr">${esc(ctx.orderNumber)}</span></p>

    <ul class="rate__items">
      ${ctx.items
        .map((i) => `<li>${i.image ? `<img src="${esc(i.image)}" alt="" width="64" height="36" />` : ''}<span>${esc(loc(i.name))}${i.qty > 1 ? ` × ${esc(i.qty)}` : ''}</span></li>`)
        .join('')}
    </ul>

    <form class="rate__form" novalidate>
      <fieldset class="rate__stars-wrap">
        <legend class="visually-hidden">${esc(t('rate.legend'))}</legend>
        <div class="rate__stars">${starsHTML(selected)}</div>
        <p class="rate__star-label" data-star-label aria-live="polite"></p>
      </fieldset>
      <div class="field">
        <label class="field__label" for="rate-comment">${esc(t('rate.comment'))} <small>${esc(t('common.optional'))}</small></label>
        <textarea class="textarea input" id="rate-comment" name="comment" rows="4" maxlength="1000" placeholder="${esc(t('rate.commentPh'))}">${esc(ctx.comment)}</textarea>
        <p class="field__hint">${esc(t('rate.publicNote'))}</p>
      </div>
      <button class="btn btn--solid" type="submit"><span class="btn__label">${esc(ctx.rating ? t('rate.update') : t('rate.submit'))}</span></button>
    </form>`;

  const form = $('.rate__form', root);
  paintStars(form);
  form.addEventListener('change', () => paintStars(form));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = Number((form.querySelector('input[name="rating"]:checked') || {}).value || 0);
    if (!value) return;
    const btn = $('[type="submit"]', form);
    btn.classList.add('is-busy');
    btn.disabled = true;
    try {
      await submitRating(token, value, form.elements.comment.value, locale);
      root.innerHTML = `
        <div class="glass-card__icon" aria-hidden="true">${icons.check({ size: 22, stroke: 1.8 })}</div>
        <div class="rate__stars rate__stars--done" aria-label="${esc(t('rate.starsOf', { n: value }))}">${[1, 2, 3, 4, 5].map((n) => `<span class="rate__star${n <= value ? ' is-on' : ''}">${STAR}</span>`).join('')}</div>
        <h1 class="glass-card__title">${esc(t('rate.thanksTitle'))}</h1>
        <p class="glass-card__sub">${esc(t('rate.thanksBody'))}</p>
        <a class="btn btn--solid rate__cta" href="products.html">${esc(t('rate.shop'))} ${icons.arrow()}</a>`;
    } catch (err) {
      btn.classList.remove('is-busy');
      btn.disabled = false;
      toast(err.code === 'not_delivered' ? t('rate.notYetTitle') : err.code === 'network' ? t('errors.network') : t('common.errorGeneric'), { tone: 'error' });
    }
  });

  if (window.gsap && !reduceMotion) {
    window.gsap.from('#rate > *', { autoAlpha: 0, y: 14, duration: 0.8, stagger: 0.06, ease: 'power3.out', clearProps: 'all' });
  }
}

main();

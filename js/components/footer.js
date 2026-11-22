/* Customer footer — fills the static <footer class="site-footer"> shell. */
import { t, esc } from '../core/i18n.js';
import { $ } from '../core/dom.js';

export function mountFooter() {
  const footer = $('.site-footer');
  if (!footer) return;
  footer.innerHTML = `
    <span>${esc(t('footer.rights'))}</span>
    <nav aria-label="${esc(t('footer.shop'))}">
      <ul>
        <li><a href="products.html">${esc(t('nav.products'))}</a></li>
        <li><a href="account.html">${esc(t('nav.account'))}</a></li>
        <li><a href="cart.html">${esc(t('nav.cart'))}</a></li>
      </ul>
    </nav>
    <span>${esc(t('footer.tagline'))}</span>`;
}

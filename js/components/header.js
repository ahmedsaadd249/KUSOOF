/* ==========================================================================
   Customer header + mobile menu. Fills the static <header class="site-header">
   shell on every page (the landing's main.js animates that same element).
   ========================================================================== */
import { t, locale, setLocale, esc } from '../core/i18n.js';
import { $, $$, lockScroll, unlockScroll } from '../core/dom.js';
import { firstName } from '../core/format.js';
import { getSession, onSessionChange } from '../services/auth.js';
import { count, onCartChange } from '../services/cart.js';
import { icons } from './icons.js';

const LINKS = [
  { id: 'home', href: 'index.html', key: 'nav.home' },
  { id: 'products', href: 'products.html', key: 'nav.products' },
  { id: 'account', href: 'account.html', key: 'nav.account' },
  { id: 'cart', href: 'cart.html', key: 'nav.cart', mobileOnly: true },
];

function langSwitch() {
  return `
    <div class="lang-switch" role="group" aria-label="${esc(t('lang.label'))}">
      <button type="button" lang="en" data-lang="en" aria-pressed="${locale === 'en'}" aria-label="${esc(t('lang.en'))}">EN</button>
      <button type="button" lang="ar" data-lang="ar" aria-pressed="${locale === 'ar'}" aria-label="${esc(t('lang.ar'))}">ع</button>
    </div>`;
}

export function mountHeader({ page = '' } = {}) {
  const header = $('.site-header');
  if (!header) return;
  const onHome = page === 'home';

  const label = (link) => {
    if (link.id === 'account') {
      const s = getSession();
      return s ? firstName(s.name) : t(link.key);
    }
    return t(link.key);
  };
  const href = (link) => (link.id === 'home' && onHome ? '#top' : link.href);
  const current = (link) => (link.id === page ? ' aria-current="page"' : '');

  header.innerHTML = `
    <a class="site-header__logo" href="${onHome ? '#top' : 'index.html'}" aria-label="${esc(t('nav.homeAria'))}">
      <img src="logo/kusoof-logo-transparent.png" width="2071" height="477" alt="KUSOOF" />
    </a>
    <nav class="site-nav" aria-label="${esc(t('nav.primary'))}">
      <ul>
        ${LINKS.filter((l) => !l.mobileOnly)
          .map((l) => `<li><a class="link" data-nav="${l.id}" href="${href(l)}"${current(l)}>${esc(label(l))}</a></li>`)
          .join('')}
      </ul>
    </nav>
    <div class="site-header__actions">
      ${langSwitch()}
      <button class="cart-button" type="button" data-count="0" aria-haspopup="dialog" aria-controls="cart-drawer">
        ${icons.bag()}
        <span class="cart-count" aria-hidden="true">0</span>
      </button>
      <button class="menu-button" type="button" aria-expanded="false" aria-controls="mobile-menu">
        <span class="menu-button__icon" aria-hidden="true"></span><span class="menu-button__label">${esc(t('common.menu'))}</span>
      </button>
    </div>`;

  /* ---------- Mobile menu ---------- */
  const menu = document.createElement('div');
  menu.className = 'mobile-menu';
  menu.id = 'mobile-menu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'true');
  menu.setAttribute('aria-label', t('common.menu'));
  menu.innerHTML = `
    <ul>
      ${LINKS.map(
        (l, i) =>
          `<li><a href="${href(l)}" data-nav="${l.id}"${current(l)}><small>${String(i + 1).padStart(2, '0')}</small><span>${esc(label(l))}</span></a></li>`
      ).join('')}
    </ul>
    <div class="mobile-menu__foot"><span>KUSOOF</span>${langSwitch()}</div>`;
  document.body.appendChild(menu);

  const menuButton = $('.menu-button', header);
  const menuLabel = $('.menu-button__label', header);
  const isOpen = () => menu.classList.contains('is-open');

  function closeMenu() {
    if (!isOpen()) return;
    menu.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuLabel.textContent = t('common.menu');
    unlockScroll('menu');
  }
  function openMenu() {
    menu.classList.add('is-open');
    menuButton.setAttribute('aria-expanded', 'true');
    menuLabel.textContent = t('common.close');
    lockScroll('menu');
    setTimeout(() => $('a', menu).focus(), 60);
  }
  menuButton.addEventListener('click', () => (isOpen() ? closeMenu() : openMenu()));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      closeMenu();
      menuButton.focus();
    } else if (e.key === 'Tab') {
      const items = [menuButton, ...$$('a, button', menu)];
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length].focus();
    }
  });
  window.matchMedia('(min-width: 900px)').addEventListener('change', (mq) => mq.matches && closeMenu());
  document.addEventListener('cart:open', closeMenu);

  /* ---------- Language ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.lang-switch [data-lang]');
    if (btn) setLocale(btn.dataset.lang);
  });

  /* ---------- Home anchor on the landing page ---------- */
  if (onHome) {
    $$('a[href="#top"]', header).concat($$('a[href="#top"]', menu)).forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const lenis = window.KUSOOF && window.KUSOOF.lenis;
        if (lenis) lenis.scrollTo(0, { duration: 2.2 });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      })
    );
  }

  /* ---------- Cart badge ---------- */
  const cartButton = $('.cart-button', header);
  const badge = $('.cart-count', header);
  let last = count();
  function paint(bump) {
    const n = count();
    cartButton.dataset.count = String(n);
    cartButton.setAttribute('aria-label', t('nav.cartAria', { count: n }));
    badge.textContent = String(n);
    if (bump && n > last) {
      badge.classList.remove('is-bumped');
      void badge.offsetWidth;
      badge.classList.add('is-bumped');
    }
    last = n;
  }
  paint(false);
  onCartChange(() => paint(true));
  cartButton.addEventListener('click', () => document.dispatchEvent(new CustomEvent('cart:open')));

  /* ---------- Account label follows the session ---------- */
  onSessionChange(() =>
    $$('[data-nav="account"]').forEach((a) => {
      const s = getSession();
      const span = a.querySelector('span') || a;
      span.textContent = s ? firstName(s.name) : t('nav.account');
    })
  );
}

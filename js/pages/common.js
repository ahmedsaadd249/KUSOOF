/* ==========================================================================
   Shared bootstrap for every customer page.
   ========================================================================== */
import { applyI18n, setMeta } from '../core/i18n.js';
import { reduceMotion } from '../core/dom.js';
import { mountHeader } from '../components/header.js';
import { mountFooter } from '../components/footer.js';
import { mountCartDrawer } from '../components/cart-drawer.js';
import { refreshSettings } from '../services/settings.js';
import { syncSession } from '../services/auth.js';

window.KUSOOF = window.KUSOOF || {};

/** Resolves once the signed-in state matches the real Supabase session. */
export const sessionReady = syncSession();
/** Store settings (currency display etc.), refreshed from the database. */
export const settingsReady = refreshSettings();

/** Lenis smooth scroll synced with GSAP/ScrollTrigger (pages other than the landing). */
function initSmoothScroll() {
  if (reduceMotion || !window.Lenis) return null;
  const lenis = new window.Lenis({
    duration: 1.15,
    easing: (x) => Math.min(1, 1.001 - Math.pow(2, -10 * x)),
    smoothWheel: true,
  });
  if (window.gsap) {
    if (window.ScrollTrigger) lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add((time) => lenis.raf(time * 1000));
    window.gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }
  window.KUSOOF.lenis = lenis;
  return lenis;
}

/** In-page anchors (skip link etc.) go through Lenis; bare "#" links do nothing. */
function wireAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.closest('.site-header, .mobile-menu')) return;
    const id = a.getAttribute('href');
    e.preventDefault();
    if (id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    const lenis = window.KUSOOF.lenis;
    if (lenis) lenis.scrollTo(target, { offset: -20, duration: 1.2 });
    else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    if (target.hasAttribute('tabindex')) target.focus({ preventScroll: true });
  });
}

export function initPage({ page, titleKey, descKey, smooth = true } = {}) {
  applyI18n(document);
  document.documentElement.classList.remove('i18n-pending');
  if (titleKey) setMeta(titleKey, descKey);
  mountHeader({ page });
  mountFooter();
  mountCartDrawer();
  if (smooth) {
    initSmoothScroll();
    wireAnchors();
  }
}

/* Landing page.
   1. Translate the page text right away (js/core/i18n.js only — no network),
      then tell js/main.js it can split the chapter headings into words.
   2. Mount the shared header / footer / cart afterwards; they load the
      Supabase client, which can take a moment, and must not hold up (or
      re-translate) the animated headings. */
import { applyI18n, setMeta } from '../core/i18n.js';

applyI18n(document);
document.documentElement.classList.remove('i18n-pending');
setMeta('meta.homeTitle', 'meta.homeDesc');

window.KUSOOF = window.KUSOOF || {};
window.KUSOOF.i18nReady = true;
window.dispatchEvent(new Event('kusoof:i18n-ready'));

// The landing owns its own Lenis instance (js/main.js), so no smooth-scroll init here.
import('./common.js').then(({ initPage }) => {
  initPage({ page: 'home', titleKey: 'meta.homeTitle', descKey: 'meta.homeDesc', smooth: false });
});

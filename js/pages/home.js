/* Landing page: translate static copy + mount shared UI before main.js
   (the scroll animation, loaded right after this module) splits the words. */
import { initPage } from './common.js';

// The landing owns its own Lenis instance (js/main.js), so no smooth-scroll init here.
initPage({ page: 'home', titleKey: 'meta.homeTitle', descKey: 'meta.homeDesc', smooth: false });

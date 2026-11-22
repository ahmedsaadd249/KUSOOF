/* ==========================================================================
   KUSOOF — scroll-driven assembly
   GSAP + ScrollTrigger + Lenis (all via CDN, no build step)
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- Config ---------- */
  const FRAME_COUNT = 108;
  const FRAME_W = 1920;
  const FRAME_H = 1080;
  const BG = '#FEFEFE';

  // The source frames run assembled (0001) → exploded (0108).
  // Sequence index 0 is the exploded view, so we read the files in reverse.
  const framePath = (dir, i) => `${dir}/frame_${String(FRAME_COUNT - i).padStart(4, '0')}.webp`;

  // Two copies of the same frames: 960px for phones / small draws, 1920px otherwise.
  // A set is used while the frame is drawn at most this much larger than its source.
  const FRAME_SETS = {
    light: { dir: 'frames/mobile', width: 960 },
    full: { dir: 'frames', width: 1920 },
  };
  const MAX_UPSCALE = 1.15;

  // Master timeline is 100 units long and spans the whole 500vh section.
  const FRAMES_START = 5;   // short hold on the exploded view
  const FRAMES_END = 93;    // short hold on the finished frame
  const ZOOM_FROM = 0.94;   // subtle dolly-in, never above 1 so nothing is cropped
  const ZOOM_TO = 1;

  // Chapter windows, matched to the measured motion in the frames:
  // 1 exploded drift · 2 lenses + hinges travel in · 3 settle · 4 assembled
  const CHAPTERS = [
    { start: 0, end: 22 },
    { start: 22, end: 62 },
    { start: 62, end: 82 },
    { start: 82, end: 100 },
  ];
  const TRANS = 4;               // length of a chapter in/out, in timeline units
  const CALLOUTS_OUT_AT = 13;    // stage-1 callouts leave before the parts start travelling

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- DOM ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const root = document.documentElement;
  const loader = $('.loader');
  const loaderInner = $('.loader__inner');
  const loaderFill = $('.loader__fill');
  const loaderBar = $('.loader__bar');
  const loaderCount = $('.loader__count');
  const header = $('.site-header');
  const sequence = $('.sequence');
  const stage = $('.stage');
  const canvas = $('.stage__canvas');
  const boxEl = $('.stage__box');
  const progressEl = $('.progress');
  const progressNum = $('.progress__num');
  const segFills = $$('.progress__seg b');
  const hint = $('.hint');
  const productImg = $('.product__image');

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // Product shot: srcset lets phones take the 960px WebP instead of the full PNG.
  function loadProductImage() {
    if (productImg.dataset.srcset) productImg.srcset = productImg.dataset.srcset;
    productImg.src = productImg.dataset.src;
  }

  // If the CDN scripts are unavailable, drop the loader so the page stays usable.
  if (!window.gsap || !window.ScrollTrigger) {
    loader.remove();
    root.classList.remove('is-loading');
    loadProductImage();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  /* ---------- Canvas renderer ---------- */
  const ctx = canvas.getContext('2d', { alpha: false });
  let frames = new Array(FRAME_COUNT);
  let ready = new Array(FRAME_COUNT).fill(false);
  let frameSet = null;     // set chosen at boot
  let upgrading = false;   // background swap to the full set in progress

  const state = { frame: 0, zoom: ZOOM_FROM };
  let view = { w: 0, h: 0 };
  let box = { x: 0, y: 0, w: 0, h: 0 };
  let drawn = { x: 0, y: 0, w: 0, h: 0 };
  let lastKey = '';
  let calloutsActive = true;

  const callouts = $$('.callout').map((el) => ({ el, x: +el.dataset.x, y: +el.dataset.y }));

  function measure() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view = { w: r.width, h: r.height };
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const b = boxEl.getBoundingClientRect();
    box = { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height };
    lastKey = ''; // force the next tick to redraw
    maybeUpgrade();
  }

  // Device pixels the frame will actually cover at full zoom
  function neededWidth() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return Math.min(box.w, box.h * (FRAME_W / FRAME_H)) * dpr;
  }

  function pickFrameSet() {
    return neededWidth() <= FRAME_SETS.light.width * MAX_UPSCALE ? FRAME_SETS.light : FRAME_SETS.full;
  }

  // Window grew past what the light set can cover: fetch the full set quietly,
  // keep drawing the light frames meanwhile, then swap in one go.
  function maybeUpgrade() {
    if (!frameSet || upgrading || frameSet === FRAME_SETS.full) return;
    if (neededWidth() <= frameSet.width * MAX_UPSCALE) return;
    upgrading = true;
    const store = { frames: new Array(FRAME_COUNT), ready: new Array(FRAME_COUNT).fill(false) };
    const jobs = [];
    for (let i = 0; i < FRAME_COUNT; i++) jobs.push(loadFrame(FRAME_SETS.full.dir, i, store));
    Promise.all(jobs).then(() => {
      frames = store.frames;
      ready = store.ready;
      frameSet = FRAME_SETS.full;
      root.dataset.frames = 'full';
      lastKey = '';
    });
  }

  // Nearest decoded frame, in case one failed to load
  function frameAt(i) {
    if (ready[i]) return frames[i];
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (ready[i - d]) return frames[i - d];
      if (ready[i + d]) return frames[i + d];
    }
    return null;
  }

  function positionCallouts() {
    const s = drawn.w / FRAME_W;
    for (const c of callouts) {
      const x = drawn.x + c.x * s;
      const y = drawn.y + c.y * s;
      c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  function render() {
    const idx = Math.min(FRAME_COUNT - 1, Math.max(0, Math.round(state.frame)));
    const key = `${idx}|${state.zoom.toFixed(4)}`;
    if (key === lastKey || !box.w) return;
    lastKey = key;

    // Contain-fit inside the safe box: aspect ratio preserved, never cropped.
    const scale = Math.min(box.w / FRAME_W, box.h / FRAME_H) * state.zoom;
    const w = FRAME_W * scale;
    const h = FRAME_H * scale;
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - h) / 2;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, view.w, view.h);
    const img = frameAt(idx);
    if (img) ctx.drawImage(img, x, y, w, h);

    drawn = { x, y, w, h };
    if (calloutsActive) positionCallouts();
  }

  measure();
  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(measure);
  };
  new ResizeObserver(onResize).observe(stage);
  window.addEventListener('resize', onResize);

  /* ---------- Preload ---------- */
  const loadState = { v: 0 };
  const setFill = gsap.quickSetter(loaderFill, 'scaleX');
  let lastPct = -1;

  function paintLoader() {
    setFill(loadState.v);
    const pct = Math.round(loadState.v * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      loaderCount.textContent = String(pct).padStart(3, '0');
      loaderBar.setAttribute('aria-valuenow', pct);
    }
  }

  function loadFrame(dir, i, store) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      const done = (ok) => {
        store.frames[i] = img;
        store.ready[i] = ok;
        resolve();
      };
      img.onload = () => {
        if (img.decode) img.decode().then(() => done(true), () => done(img.naturalWidth > 0));
        else done(true);
      };
      img.onerror = () => done(false);
      img.src = framePath(dir, i);
    });
  }

  function preload() {
    frameSet = pickFrameSet();
    root.dataset.frames = frameSet === FRAME_SETS.light ? 'light' : 'full';
    const store = { frames, ready };
    let count = 0;
    const jobs = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      jobs.push(
        loadFrame(frameSet.dir, i, store).then(() => {
          count++;
          gsap.to(loadState, {
            v: count / FRAME_COUNT,
            duration: 0.6,
            ease: 'power2.out',
            overwrite: true,
            onUpdate: paintLoader,
          });
        })
      );
    }
    return Promise.all(jobs).then(
      () =>
        new Promise((resolve) => {
          gsap.to(loadState, {
            v: 1,
            duration: 0.45,
            ease: 'power2.out',
            overwrite: true,
            onUpdate: paintLoader,
            onComplete: resolve,
          });
        })
    );
  }

  const fontsReady = document.fonts
    ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))])
    : Promise.resolve();

  /* ---------- Smooth scroll (Lenis ↔ ScrollTrigger) ---------- */
  let lenis = null;
  if (!reduceMotion && window.Lenis) {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenis.stop();
    // Shared so the bag drawer and mobile menu (site.js / bag.js) can pause scrolling
    window.KUSOOF = window.KUSOOF || {};
    window.KUSOOF.lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  gsap.ticker.add(render);

  // In-page anchors go through Lenis; the placeholder "#" CTA does nothing.
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      e.preventDefault();
      if (id === '#') return;
      const target = id === '#top' ? 0 : $(id);
      if (target === null) return;
      if (lenis) lenis.scrollTo(target, { duration: 2.4 });
      else if (target === 0) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ---------- Chapter text ---------- */
  function splitWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(' '));
          return;
        }
        const word = document.createElement('span');
        word.className = 'word';
        const inner = document.createElement('span');
        inner.className = 'word__inner';
        inner.textContent = part;
        word.appendChild(inner);
        frag.appendChild(word);
      });
      node.replaceWith(frag);
    });
    return $$('.word__inner', el);
  }

  const chapters = $$('.chapter').map((el) => ({
    el,
    words: splitWords($('.chapter__title', el)),
    meta: [$('.chapter__index', el), $('.chapter__body', el)],
  }));

  // Words rise through a mask and fade, so italic descenders never linger at the mask edge.
  const RISE = reduceMotion ? 0 : 115;   // word travel, in % of its own height
  const SHIFT = reduceMotion ? 0 : 18;   // index / body travel, in px
  const WORD_FROM = { yPercent: RISE, opacity: 0 };
  const WORD_SHOWN = { yPercent: 0, opacity: 1 };
  const WORD_GONE = { yPercent: -RISE, opacity: 0 };

  // Chapter 1 and the callouts start in their "shown" scroll state. The intro only
  // touches properties the scroll timeline never animates (article opacity, word `y`
  // in px, the callout container), so scrolling mid-intro can't leave text stuck.
  chapters.forEach((c, i) => {
    if (i === 0) {
      gsap.set(c.words, WORD_SHOWN);
      gsap.set(c.meta, { autoAlpha: 1, y: 0 });
    } else {
      gsap.set(c.words, WORD_FROM);
      gsap.set(c.meta, { autoAlpha: 0, y: SHIFT });
    }
  });

  const calloutWrap = $('.callouts');
  const calloutEls = callouts.map((c) => c.el);
  const calloutLines = $$('.callout__line');
  gsap.set([header, progressEl, hint, canvas, calloutWrap, chapters[0].el], { autoAlpha: 0 });

  function chapterIn(tl, c, at) {
    tl.fromTo(c.words, WORD_FROM, {
      ...WORD_SHOWN,
      duration: TRANS,
      stagger: TRANS * 0.1,
      ease: 'power3.out',
      immediateRender: false,
    }, at);
    tl.fromTo(c.meta, { autoAlpha: 0, y: SHIFT }, {
      autoAlpha: 1,
      y: 0,
      duration: TRANS,
      stagger: TRANS * 0.15,
      ease: 'power2.out',
      immediateRender: false,
    }, at + TRANS * 0.2);
  }

  function chapterOut(tl, c, at) {
    tl.fromTo(c.words, WORD_SHOWN, {
      ...WORD_GONE,
      duration: TRANS * 0.75,
      stagger: TRANS * 0.05,
      ease: 'power2.in',
      immediateRender: false,
    }, at);
    tl.fromTo(c.meta, { autoAlpha: 1, y: 0 }, {
      autoAlpha: 0,
      y: -SHIFT,
      duration: TRANS * 0.6,
      ease: 'power2.in',
      immediateRender: false,
    }, at);
  }

  /* ---------- Master scroll timeline ---------- */
  const segSetters = segFills.map((b) => gsap.quickSetter(b, 'scaleX'));
  // Callout fade is derived straight from scroll position (staggered), so it is
  // always exact in both directions regardless of what the intro is doing.
  const calloutSetters = calloutEls.map((el) => gsap.quickSetter(el, 'opacity'));
  let activeChapter = 0;

  function onScrollUpdate(self) {
    const t = self.progress * 100;

    CHAPTERS.forEach((c, i) => {
      segSetters[i](Math.min(1, Math.max(0, (t - c.start) / (c.end - c.start))));
    });

    let idx = CHAPTERS.findIndex((c) => t < c.end);
    if (idx === -1) idx = CHAPTERS.length - 1;
    if (idx !== activeChapter) {
      activeChapter = idx;
      progressNum.textContent = String(idx + 1).padStart(2, '0');
    }

    calloutSetters.forEach((set, i) => {
      const from = CALLOUTS_OUT_AT + i * 0.35;
      const k = Math.min(1, Math.max(0, (t - from) / TRANS));
      set(1 - k * k); // ease-in fade
    });
    calloutsActive = t < CALLOUTS_OUT_AT + TRANS + 2;
    hint.classList.toggle('is-hidden', t > 1.5);
  }

  function buildTimeline() {
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sequence,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: onScrollUpdate,
      },
    });

    // Frames: exploded (0) → assembled (107), locked 1:1 to scroll
    tl.fromTo(state, { frame: 0 }, {
      frame: FRAME_COUNT - 1,
      duration: FRAMES_END - FRAMES_START,
      ease: 'none',
      immediateRender: false,
    }, FRAMES_START);

    // Gentle dolly-in drawn on the canvas
    tl.fromTo(state, { zoom: ZOOM_FROM }, {
      zoom: ZOOM_TO,
      duration: FRAMES_END - FRAMES_START,
      ease: 'power1.inOut',
      immediateRender: false,
    }, FRAMES_START);

    // Chapter 1 enters with the intro; the rest are scroll-driven
    chapterOut(tl, chapters[0], CHAPTERS[0].end - TRANS);
    for (let i = 1; i < chapters.length; i++) {
      chapterIn(tl, chapters[i], CHAPTERS[i].start);
      if (i < chapters.length - 1) chapterOut(tl, chapters[i], CHAPTERS[i].end - TRANS);
    }

    // Pin the timeline length to exactly 100 units
    tl.set({}, {}, 100);
    return tl;
  }

  /* ---------- Final product section ---------- */
  function buildProductReveal() {
    gsap.fromTo('.product__figure',
      { autoAlpha: 0, y: reduceMotion ? 0 : 48, scale: reduceMotion ? 1 : 0.98 },
      {
        autoAlpha: 1, y: 0, scale: 1, duration: 1.6, ease: 'power3.out',
        scrollTrigger: { trigger: '.product', start: 'top 72%', toggleActions: 'play none none reverse' },
      });
    gsap.fromTo('.product__copy > *',
      { autoAlpha: 0, y: reduceMotion ? 0 : 22 },
      {
        autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.12, ease: 'power3.out',
        scrollTrigger: { trigger: '.product__copy', start: 'top 90%', toggleActions: 'play none none reverse' },
      });
  }

  /* ---------- Intro (after loading) ---------- */
  function unlockScroll() {
    root.classList.remove('is-loading');
    if (lenis) lenis.start();
  }

  function intro() {
    const c0 = chapters[0];
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.to(loaderInner, { autoAlpha: 0, y: -10, duration: 0.55, ease: 'power2.in' })
      .to(loader, { autoAlpha: 0, duration: 0.9, ease: 'power2.inOut' }, '-=0.05')
      .to(canvas, { autoAlpha: 1, duration: 1.4, ease: 'power2.out' }, '<')
      .add(unlockScroll, '<0.5')
      .to(header, { autoAlpha: 1, duration: 1 }, '<0.1')
      .to(c0.el, { autoAlpha: 1, duration: 0.7, ease: 'power1.out' }, '<0.1')
      .from(c0.words, {
        y: (i, el) => (reduceMotion ? 0 : el.offsetHeight * 1.25),
        duration: 1.3,
        stagger: 0.08,
      }, '<')
      .from(c0.meta, {
        yPercent: (i, el) => (reduceMotion ? 0 : (SHIFT / Math.max(1, el.offsetHeight)) * 100),
        duration: 1,
        stagger: 0.12,
      }, '<0.35')
      .to(calloutWrap, { autoAlpha: 1, duration: 0.9 }, '<0.2')
      .fromTo(calloutLines, { scaleY: 0 }, { scaleY: 1, duration: 0.9, stagger: 0.12 }, '<')
      .to([progressEl, hint], { autoAlpha: 1, duration: 0.8 }, '<0.3')
      .add(() => loader.remove());
  }

  /* ---------- Boot ---------- */
  Promise.all([preload(), fontsReady]).then(() => {
    window.scrollTo(0, 0);
    measure();
    render();
    buildTimeline();
    buildProductReveal();
    loadProductImage();
    ScrollTrigger.refresh();
    onScrollUpdate({ progress: 0 });
    intro();
  });
})();

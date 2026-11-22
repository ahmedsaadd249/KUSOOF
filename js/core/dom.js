/* ==========================================================================
   DOM helpers shared by the customer site and the admin.
   ========================================================================== */
export { esc } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Parse an HTML string into a single element. */
export function el(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(container) {
  return $$(FOCUSABLE, container).filter((n) => n.offsetParent !== null || n === document.activeElement);
}

/** Keep Tab focus inside `container` (call from a keydown handler). */
export function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const items = focusables(container);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Animate a number from 0 to `to` inside `node` (format via `fmt`). */
export function countUp(node, to, { duration = 1.4, fmt = (n) => String(Math.round(n)), delay = 0 } = {}) {
  if (reduceMotion || !window.gsap) {
    node.textContent = fmt(to);
    return;
  }
  const obj = { v: 0 };
  node.textContent = fmt(0);
  window.gsap.to(obj, {
    v: to,
    duration,
    delay,
    ease: 'power3.out',
    onUpdate: () => (node.textContent = fmt(obj.v)),
  });
}

/** Scroll lock shared by drawers, menus and modals (pauses Lenis when present). */
const locks = new Set();
export function lockScroll(reason) {
  locks.add(reason);
  document.documentElement.classList.add('is-locked');
  const lenis = window.KUSOOF && window.KUSOOF.lenis;
  if (lenis) lenis.stop();
}
export function unlockScroll(reason) {
  locks.delete(reason);
  if (locks.size) return;
  document.documentElement.classList.remove('is-locked');
  const lenis = window.KUSOOF && window.KUSOOF.lenis;
  if (lenis && !document.documentElement.classList.contains('is-loading')) lenis.start();
}

/** Split headline text into masked words for a rise reveal. */
export function splitWords(node) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((textNode) => {
    const frag = document.createDocumentFragment();
    textNode.textContent.split(/(\s+)/).forEach((part) => {
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
    textNode.replaceWith(frag);
  });
  return $$('.word__inner', node);
}

/** Simple query-string reader. */
export const param = (name) => new URLSearchParams(window.location.search).get(name);

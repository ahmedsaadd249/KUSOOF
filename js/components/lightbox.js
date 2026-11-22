/* Full-screen image viewer for the product gallery (keyboard + swipe). */
import { t, loc, esc } from '../core/i18n.js';
import { $, trapFocus, lockScroll, unlockScroll } from '../core/dom.js';
import { icons } from './icons.js';

export function openLightbox(images, start = 0) {
  if (!images.length) return;
  let index = start;
  const returnFocus = document.activeElement;
  const node = document.createElement('div');
  node.className = 'lightbox';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-label', t('lightbox.label'));
  node.innerHTML = `
    <button class="icon-btn lightbox__close" type="button" aria-label="${esc(t('common.close'))}">${icons.close()}</button>
    <figure class="lightbox__stage"><img alt="" /></figure>
    <div class="lightbox__bar">
      <button class="icon-btn" type="button" data-step="-1" aria-label="${esc(t('lightbox.prev'))}">${icons.chevronBack()}</button>
      <p class="lightbox__caption" aria-live="polite"></p>
      <button class="icon-btn" type="button" data-step="1" aria-label="${esc(t('lightbox.next'))}">${icons.chevron()}</button>
    </div>`;
  document.body.appendChild(node);
  const img = $('img', node);
  const caption = $('.lightbox__caption', node);
  const multi = images.length > 1;
  node.querySelectorAll('[data-step]').forEach((b) => (b.hidden = !multi));

  function show(i) {
    index = (i + images.length) % images.length;
    const im = images[index];
    img.classList.add('is-swapping');
    const swap = () => {
      img.src = im.src;
      img.alt = loc(im.alt);
      const done = () => img.classList.remove('is-swapping');
      if (img.decode) img.decode().then(done, done);
      else done();
    };
    setTimeout(swap, img.src ? 160 : 0);
    caption.textContent = `${loc(im.label)}${multi ? ` · ${t('lightbox.counter', { current: index + 1, total: images.length })}` : ''}`;
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    node.classList.remove('is-open');
    unlockScroll('lightbox');
    setTimeout(() => node.remove(), 400);
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(index + (document.dir === 'rtl' ? -1 : 1));
    else if (e.key === 'ArrowLeft') show(index + (document.dir === 'rtl' ? 1 : -1));
    else trapFocus(node, e);
  }

  node.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) show(index + Number(step.dataset.step));
    else if (e.target.closest('.lightbox__close') || e.target === node) close();
  });
  let x0 = null;
  node.addEventListener('pointerdown', (e) => (x0 = e.clientX));
  node.addEventListener('pointerup', (e) => {
    if (x0 === null || !multi) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1) * (document.dir === 'rtl' ? -1 : 1));
  });
  document.addEventListener('keydown', onKey, true);

  lockScroll('lightbox');
  show(index);
  requestAnimationFrame(() => node.classList.add('is-open'));
  setTimeout(() => $('.lightbox__close', node).focus(), 60);
}

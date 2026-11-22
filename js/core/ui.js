/* ==========================================================================
   UI primitives — toast, modal / confirm dialog, slide-over panel.
   Callers pass already-translated text.
   ========================================================================== */
import { $, el, esc, trapFocus, lockScroll, unlockScroll, focusables } from './dom.js';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

/* ---------- Toast ---------- */
let toastNode = null;
let toastTimer = 0;

export function toast(message, { action, tone = 'default', duration = 3600 } = {}) {
  if (!toastNode) {
    toastNode = el('<div class="toast" role="status" aria-live="polite"><span class="toast__text"></span><button class="toast__action" type="button" tabindex="-1"></button></div>');
    document.body.appendChild(toastNode);
    toastNode.addEventListener('mouseenter', () => clearTimeout(toastTimer));
    toastNode.addEventListener('mouseleave', () => (toastTimer = setTimeout(hideToast, 1600)));
  }
  const text = $('.toast__text', toastNode);
  const btn = $('.toast__action', toastNode);
  text.textContent = message;
  toastNode.dataset.tone = tone;
  if (action) {
    btn.hidden = false;
    btn.textContent = action.label;
    btn.tabIndex = 0;
    btn.onclick = () => {
      hideToast();
      action.onClick();
    };
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
  toastNode.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}

export function hideToast() {
  if (!toastNode) return;
  clearTimeout(toastTimer);
  toastNode.classList.remove('is-visible');
  const btn = $('.toast__action', toastNode);
  if (btn) btn.tabIndex = -1;
}

/* ---------- Dialog plumbing ---------- */
function mountDialog(node, panel, { onClose, lockKey }) {
  const returnFocus = document.activeElement;
  document.body.appendChild(node);
  lockScroll(lockKey);
  requestAnimationFrame(() => node.classList.add('is-open'));
  const first = focusables(panel)[0];
  setTimeout(() => (first || panel).focus(), 60);

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else trapFocus(panel, e);
  }
  document.addEventListener('keydown', onKey, true);

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    node.classList.remove('is-open');
    unlockScroll(lockKey);
    setTimeout(() => node.remove(), 450);
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    if (onClose) onClose(result);
  }
  return close;
}

/* ---------- Modal / confirm ---------- */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default' }) {
  return new Promise((resolve) => {
    const node = el(`
      <div class="modal" data-tone="${esc(tone)}">
        <div class="modal__scrim" data-close></div>
        <div class="modal__panel" role="alertdialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-msg" tabindex="-1">
          <h2 class="modal__title" id="modal-title">${esc(title)}</h2>
          <p class="modal__msg" id="modal-msg">${esc(message)}</p>
          <div class="modal__actions">
            <button class="btn btn--outline" type="button" data-close>${esc(cancelLabel)}</button>
            <button class="btn ${tone === 'danger' ? 'btn--danger' : 'btn--solid'}" type="button" data-confirm>${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>`);
    const panel = $('.modal__panel', node);
    const close = mountDialog(node, panel, { lockKey: 'modal', onClose: (r) => resolve(Boolean(r)) });
    node.addEventListener('click', (e) => {
      if (e.target.closest('[data-confirm]')) close(true);
      else if (e.target.closest('[data-close]')) close(false);
    });
  });
}

/* ---------- Slide-over panel ---------- */
export function openPanel({ title, subtitle = '', body, footer, onClose, width = 560, side = 'end' }) {
  const node = el(`
    <div class="panel" data-side="${side}">
      <div class="panel__scrim" data-close></div>
      <aside class="panel__sheet" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabindex="-1" style="--panel-w:${Number(width)}px">
        <header class="panel__head">
          <div>
            <h2 class="panel__title" id="panel-title">${esc(title)}</h2>
            ${subtitle ? `<p class="panel__sub">${esc(subtitle)}</p>` : ''}
          </div>
          <button class="icon-btn" type="button" data-close aria-label="Close">${CLOSE_ICON}</button>
        </header>
        <div class="panel__body" data-lenis-prevent></div>
        <footer class="panel__foot" hidden></footer>
      </aside>
    </div>`);
  const sheet = $('.panel__sheet', node);
  const bodyEl = $('.panel__body', node);
  const footEl = $('.panel__foot', node);
  if (body) bodyEl.append(body);
  if (footer) {
    footEl.hidden = false;
    footEl.append(footer);
  }
  const close = mountDialog(node, sheet, { lockKey: 'panel', onClose });
  node.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  return { el: node, body: bodyEl, footer: footEl, close };
}

/* ==========================================================================
   One-time-code input — a row of single-digit boxes.
   Shared by the customer verify page and the admin sign-in.
   Handles: auto-advance, Backspace to the previous box, arrow keys,
   full-code paste / one-time-code autofill, Arabic-Indic digits.
   ========================================================================== */
import { toLatinDigits } from '../core/i18n.js';
import { wait } from '../core/dom.js';

/**
 * createOtpInput(wrap, options)
 *   length       number of digits
 *   before       node inside `wrap` to insert the boxes before (optional)
 *   label(i, n)  accessible name for box i (0-based) of n
 *   onEdit()     the user changed something (clear errors here)
 *   onChange()   filled state changed (update buttons here)
 *   onComplete() every box holds a digit (fires shortly after the last one)
 */
export function createOtpInput(wrap, { length, before = null, label = (i, n) => `Digit ${i + 1} of ${n}`, onEdit = () => {}, onChange = () => {}, onComplete = () => {} }) {
  const boxes = Array.from({ length }, (_, i) => {
    const input = document.createElement('input');
    input.className = 'otp__box';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = length; // lets one-time-code autofill land in the first box
    input.autocomplete = i === 0 ? 'one-time-code' : 'off';
    input.setAttribute('aria-label', label(i, length));
    input.dataset.index = String(i);
    wrap.insertBefore(input, before);
    return input;
  });

  const code = () => boxes.map((b) => b.value).join('');
  const complete = () => code().length === length && /^\d+$/.test(code());

  function paint() {
    boxes.forEach((b) => b.classList.toggle('is-filled', b.value !== ''));
    onChange();
  }

  /** Put digits into the boxes starting at `from`; returns the next index. */
  function fill(digits, from = 0) {
    const clean = toLatinDigits(digits).replace(/\D/g, '');
    let i = from;
    for (const d of clean) {
      if (i >= length) break;
      boxes[i].value = d;
      i++;
    }
    paint();
    return i;
  }

  let autoTimer = 0;
  function maybeComplete() {
    clearTimeout(autoTimer);
    if (complete()) autoTimer = setTimeout(onComplete, 180);
  }

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      onEdit();
      const raw = toLatinDigits(box.value).replace(/\D/g, '');
      if (raw.length > 1) {
        // autofill / fast typing: spread the digits
        box.value = '';
        const end = fill(raw, i);
        boxes[Math.min(end, length - 1)].focus();
      } else {
        box.value = raw;
        paint();
        if (raw && i < length - 1) boxes[i + 1].focus();
      }
      maybeComplete();
    });

    box.addEventListener('keydown', (e) => {
      const rtl = getComputedStyle(box).direction === 'rtl';
      const back = rtl ? 'ArrowRight' : 'ArrowLeft';
      const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
      if (e.key === 'Backspace') {
        if (!box.value && i > 0) {
          e.preventDefault();
          boxes[i - 1].value = '';
          boxes[i - 1].focus();
          paint();
        }
        onEdit();
      } else if (e.key === back && i > 0) {
        e.preventDefault();
        boxes[i - 1].focus();
      } else if (e.key === fwd && i < length - 1) {
        e.preventDefault();
        boxes[i + 1].focus();
      } else if (e.key.length === 1 && !/[\d٠-٩۰-۹]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); // digits only
      }
    });

    box.addEventListener('focus', () => box.select());

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      onEdit();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const digits = toLatinDigits(text).replace(/\D/g, '');
      if (!digits) return;
      const start = digits.length >= length ? 0 : i;
      const end = fill(digits, start);
      boxes[Math.min(end, length - 1)].focus();
      maybeComplete();
    });
  });

  return {
    boxes,
    code,
    complete,
    fill,
    /** Stop a pending auto-complete (e.g. a submit is already running). */
    cancel: () => clearTimeout(autoTimer),
    clear() {
      boxes.forEach((b) => (b.value = ''));
      paint();
    },
    focus: (i = 0) => boxes[Math.max(0, Math.min(i, length - 1))].focus(),
    focusFirstEmpty() {
      const i = boxes.findIndex((b) => !b.value);
      boxes[i === -1 ? length - 1 : i].focus();
    },
    setDisabled(on) {
      boxes.forEach((b) => (b.disabled = on));
    },
    /** Type digits one by one (e.g. a pasted code), then auto-complete. */
    async type(digits, delay = 140) {
      boxes.forEach((b) => (b.value = ''));
      onEdit();
      for (let i = 0; i < digits.length && i < length; i++) {
        boxes[i].value = digits[i];
        boxes[i].focus();
        paint();
        await wait(delay);
      }
      maybeComplete();
    },
  };
}

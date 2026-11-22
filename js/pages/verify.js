/* ==========================================================================
   OTP verification — reproduces the "Glassy OTP" reference interaction:
   type / paste → auto-verify → boxes regroup into a grid ("Verifying…")
   → green + connecting X → collapse into a check tile → card morphs into
   "You’re verified" (Email confirmed).
   The code is emailed and checked by Supabase Auth (services/auth.js).
   ========================================================================== */
import { t, esc } from '../core/i18n.js';
import { $, $$, reduceMotion, wait } from '../core/dom.js';
import { maskEmail, clock } from '../core/format.js';
import { toast } from '../core/ui.js';
import { getPending, verifyCode, resendCode } from '../services/auth.js';
import { OTP_LENGTH, OTP_RESEND_SECONDS } from '../config.js';
import { icons } from '../components/icons.js';
import { createOtpInput } from '../components/otp-input.js';
import { initPage } from './common.js';

initPage({ page: 'account', titleKey: 'meta.verifyTitle', smooth: false });

const pending = getPending();
if (!pending) window.location.replace('account.html');

const gsap = window.gsap && !reduceMotion ? window.gsap : null;
const card = $('#otp');
const form = $('#otp-form');
const boxesWrap = $('.otp__boxes');
const xSvg = $('.otp__x');
const checkTile = $('.otp__check');
const errorEl = $('#otp-error');
const verifyBtn = $('.otp__verify');
const verifyLabel = $('.btn__label', verifyBtn);
const countdownEl = $('[data-countdown]');
const resendBtn = $('[data-resend]');

let busy = false;
let locked = false;

/* ---------- Static content ---------- */
$('[data-icon="mail"]').insertAdjacentHTML('afterbegin', icons.mail({ size: 22 }));
$('[data-icon="check"]').innerHTML = icons.check({ size: 30, stroke: 2 });
$('[data-icon="mail-sm"]').innerHTML = icons.mail({ size: 18 });
$$('[data-icon="ok"]').forEach((n) => (n.innerHTML = icons.check({ size: 12, stroke: 2.4 })));
checkTile.innerHTML = icons.check({ size: 34, stroke: 2.2 });
$('[data-sub]').textContent = t('verify.sub', { count: OTP_LENGTH });
$('[data-email]').textContent = maskEmail(pending ? pending.email : '');
boxesWrap.style.setProperty('--cols', String(Math.ceil(OTP_LENGTH / 2)));

/* ---------- Boxes (shared component) ---------- */
const otp = createOtpInput(boxesWrap, {
  length: OTP_LENGTH,
  before: xSvg,
  label: (i, n) => t('verify.digit', { index: i + 1, count: n }),
  onEdit: () => clearError(),
  onChange: () => paintFilled(),
  onComplete: () => {
    if (!busy && !locked) submit();
  },
});
const boxes = otp.boxes;
const code = otp.code;
const complete = otp.complete;

function paintFilled() {
  verifyBtn.disabled = !complete() || busy || locked;
}

function clearError() {
  if (card.dataset.state === 'error') card.dataset.state = 'idle';
  errorEl.textContent = '';
}

/* ---------- FLIP between the row and the grid ---------- */
async function regroup(toGrid) {
  if (!gsap) {
    boxesWrap.classList.toggle('is-grid', toGrid);
    return;
  }
  const first = boxes.map((b) => b.getBoundingClientRect());
  const h0 = boxesWrap.offsetHeight;
  boxesWrap.classList.toggle('is-grid', toGrid);
  const last = boxes.map((b) => b.getBoundingClientRect());
  const h1 = boxesWrap.offsetHeight;
  gsap.fromTo(boxesWrap, { height: h0 }, { height: h1, duration: 0.7, ease: 'power3.inOut', clearProps: 'height' });
  boxes.forEach((b, i) => {
    gsap.fromTo(
      b,
      { x: first[i].left - last[i].left, y: first[i].top - last[i].top },
      { x: 0, y: 0, duration: 0.75, delay: i * 0.05, ease: 'power3.inOut', clearProps: 'transform' }
    );
  });
  await wait(820);
}

/* Connecting X between diagonal boxes (2 × 2 layout) */
function drawX() {
  if (OTP_LENGTH !== 4) return Promise.resolve();
  const wrapRect = boxesWrap.getBoundingClientRect();
  const c = (b) => {
    const r = b.getBoundingClientRect();
    return [r.left + r.width / 2 - wrapRect.left, r.top + r.height / 2 - wrapRect.top];
  };
  const [l1, l2] = $$('line', xSvg);
  const set = (line, a, b) => {
    // shorten each end so the line starts at the box edge
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const k = 36 / len;
    line.setAttribute('x1', a[0] + dx * k);
    line.setAttribute('y1', a[1] + dy * k);
    line.setAttribute('x2', b[0] - dx * k);
    line.setAttribute('y2', b[1] - dy * k);
    const L = len - 72;
    line.style.strokeDasharray = `${L}`;
    line.style.strokeDashoffset = `${L}`;
    return L;
  };
  set(l1, c(boxes[0]), c(boxes[3]));
  set(l2, c(boxes[1]), c(boxes[2]));
  xSvg.style.opacity = '1';
  if (!gsap) {
    [l1, l2].forEach((l) => (l.style.strokeDashoffset = '0'));
    return Promise.resolve();
  }
  gsap.to([l1, l2], { strokeDashoffset: 0, duration: 0.45, stagger: 0.12, ease: 'power2.out' });
  return wait(650);
}

/* ---------- Verify ---------- */
function setButton(state) {
  verifyBtn.classList.toggle('is-verifying', state === 'verifying');
  verifyBtn.classList.toggle('is-verified', state === 'verified');
  if (state === 'verifying') verifyLabel.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(t('verify.verifying'))}`;
  else if (state === 'verified') verifyLabel.innerHTML = `${icons.check()} ${esc(t('verify.verified'))}`;
  else verifyLabel.textContent = t('verify.verify');
}

async function submit() {
  otp.cancel();
  if (busy || locked) return;
  if (!complete()) {
    errorEl.textContent = t('verify.incomplete', { count: OTP_LENGTH });
    card.dataset.state = 'error';
    otp.focusFirstEmpty();
    return;
  }
  busy = true;
  paintFilled();
  card.dataset.state = 'verifying';
  setButton('verifying');
  boxes.forEach((b) => b.blur());

  const [result] = await Promise.all([
    verifyCode(code()).catch((err) => ({ ok: false, error: err })),
    regroup(true),
  ]);

  if (result.ok) {
    await success(result);
    return;
  }

  // Wrong code: back to the row, shake, explain
  await regroup(false);
  busy = false;
  card.dataset.state = 'error';
  setButton('idle');
  boxesWrap.classList.remove('is-shaking');
  void boxesWrap.offsetWidth;
  boxesWrap.classList.add('is-shaking');
  if (result.error) {
    errorEl.textContent = t(result.error.code === 'noPending' ? 'verify.expired' : 'common.errorGeneric');
  } else if (result.locked) {
    locked = true;
    errorEl.textContent = t(result.expired ? 'verify.expired' : result.rateLimited ? 'verify.rateLimited' : 'verify.locked');
    otp.setDisabled(true);
    showResendNow();
  } else {
    errorEl.textContent = t('verify.incorrect', { count: result.attemptsLeft });
  }
  setTimeout(() => {
    otp.clear();
    if (!locked) otp.focus();
  }, 520);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  submit();
});

async function success(result) {
  card.dataset.state = 'success';
  setButton('verified');
  stopCountdown();
  await wait(gsap ? 350 : 0);
  await drawX();

  // Collapse the boxes into a single check tile
  if (gsap) {
    const wrapRect = boxesWrap.getBoundingClientRect();
    const cx = wrapRect.left + wrapRect.width / 2;
    const cy = wrapRect.top + wrapRect.height / 2;
    gsap.to(xSvg, { opacity: 0, duration: 0.25 });
    boxes.forEach((b) => {
      const r = b.getBoundingClientRect();
      gsap.to(b, { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2), scale: 0.6, opacity: 0, duration: 0.55, ease: 'power3.in' });
    });
    gsap.to(checkTile, { opacity: 1, scale: 1, duration: 0.6, delay: 0.42, ease: 'back.out(2)' });
    await wait(1250);
  }

  // Morph the card into the "verified" view
  const codeView = $('[data-view="code"]');
  const successView = $('[data-view="success"]');
  $('[data-row-email]').textContent = maskEmail(result.session.email);
  const target = result.next || 'account.html';
  const cont = $('[data-continue]');
  cont.href = target;
  cont.innerHTML = `${esc(target.startsWith('checkout') ? t('verify.continueCheckout') : t('verify.continue'))} ${icons.arrow()}`;

  if (!gsap) {
    codeView.hidden = true;
    successView.hidden = false;
    $('h2', successView).focus();
    return;
  }
  const h0 = card.offsetHeight;
  await gsap.to(codeView, { autoAlpha: 0, y: -10, duration: 0.35, ease: 'power2.in' });
  codeView.hidden = true;
  successView.hidden = false;
  const h1 = card.offsetHeight;
  gsap.fromTo(card, { height: h0 }, { height: h1, duration: 0.6, ease: 'power3.inOut', clearProps: 'height' });
  gsap
    .timeline()
    .from('.otp__halo', { scale: 0.3, autoAlpha: 0, duration: 0.7, ease: 'back.out(1.8)' })
    .from(successView.querySelectorAll('.glass-card__title, .glass-card__sub'), { autoAlpha: 0, y: 12, duration: 0.5, stagger: 0.08 }, '<0.2')
    .from('.otp__row', { autoAlpha: 0, y: 14, duration: 0.5, stagger: 0.1 }, '<0.15')
    .from('.otp__continue', { autoAlpha: 0, y: 10, duration: 0.5, clearProps: 'all' }, '<0.15');
  setTimeout(() => $('h2', successView).focus({ preventScroll: true }), 300);
}

/* ---------- Resend countdown ---------- */
let countdownTimer = 0;
function startCountdown(seconds = OTP_RESEND_SECONDS) {
  let left = seconds;
  resendBtn.hidden = true;
  countdownEl.hidden = false;
  const paint = () => (countdownEl.innerHTML = `${icons.refresh({ size: 14 })} ${esc(t('verify.resendIn', { time: clock(left) }))}`);
  paint();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) showResendNow();
    else paint();
  }, 1000);
}
function stopCountdown() {
  clearInterval(countdownTimer);
}
/** Offer "Resend code" now (countdown over, or the code is locked / expired). */
function showResendNow() {
  stopCountdown();
  countdownEl.hidden = true;
  resendBtn.hidden = false;
  resendBtn.innerHTML = `${icons.refresh({ size: 14 })} ${esc(t('verify.resend'))}`;
}

resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  try {
    await resendCode();
  } catch (err) {
    resendBtn.disabled = false;
    if (err.code === 'rateLimited') toast(t('errors.rateLimited', { seconds: err.seconds || 60 }), { tone: 'error' });
    else toast(t('errors.sendFailed'), { tone: 'error' });
    return;
  }
  resendBtn.disabled = false;
  locked = false;
  otp.setDisabled(false);
  otp.clear();
  clearError();
  startCountdown();
  otp.focus();
  toast(t('verify.resent', { email: maskEmail(pending.email) }));
});

/* ---------- Start ---------- */
if (pending) {
  paintFilled();
  // The countdown continues from when the code was sent (e.g. after a reload)
  const elapsed = Math.floor((Date.now() - (pending.sentAt || Date.now())) / 1000);
  if (elapsed >= OTP_RESEND_SECONDS) showResendNow();
  else startCountdown(OTP_RESEND_SECONDS - elapsed);
  if (gsap) gsap.from('.glass-card', { autoAlpha: 0, y: 26, duration: 1, ease: 'power3.out', clearProps: 'all' });
  setTimeout(() => otp.focus(), gsap ? 500 : 0);
}

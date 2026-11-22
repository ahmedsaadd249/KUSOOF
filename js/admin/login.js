/* ==========================================================================
   Admin sign-in — passwordless: admin email → one-time code → dashboard.
   The code is emailed by Supabase Auth (only to the allowlisted admin email,
   via the admin-request-code Edge Function) and verified by Supabase.
   Uses the same OTP boxes as the customer verify page.
   ========================================================================== */
import { esc, reduceMotion, wait } from '../core/dom.js';
import { maskEmail, clock } from '../core/format.js';
import { bindForm, rules } from '../core/validate.js';
import { toast } from '../core/ui.js';
import { requestAdminCode, resendAdminCode, verifyAdminCode, cancelAdminCode, getAdminPending } from '../services/admin-auth.js';
import { OTP_LENGTH, OTP_RESEND_SECONDS, OTP_TTL_MINUTES } from '../config.js';
import { createOtpInput } from '../components/otp-input.js';
import { icons } from '../components/icons.js';

const MSG = {
  'errors.required': 'Enter your admin email.',
  'errors.email': 'Enter a valid email address.',
  'errors.notAdmin': 'This email doesn’t have admin access.',
};

const attemptsText = (n) => `That code isn’t right. ${n} attempt${n === 1 ? '' : 's'} left.`;

function requestErrorText(err) {
  if (err.code === 'rateLimited') return `Please wait ${err.seconds || 60} seconds before asking for another code.`;
  if (err.code === 'network') return 'You seem to be offline. Check your connection and try again.';
  if (err.code === 'not_configured') return 'The store isn’t connected to Supabase yet (see docs/SETUP.md).';
  return 'We couldn’t send the code. Please try again in a moment.';
}

/**
 * mountLogin(root, { onSignedIn(session) })
 * Renders the sign-in card into `root` and resolves the flow on success.
 */
export function mountLogin(root, { onSignedIn }) {
  const gsap = window.gsap && !reduceMotion ? window.gsap : null;

  root.innerHTML = `
    <div class="admin-login__inner">
      <img class="admin-login__logo" src="../logo/kusoof-logo-transparent.png" alt="KUSOOF" />
      <div class="glass-card otp admin-login__card" data-state="idle">
        <section data-step="email">
          <div class="glass-card__icon">${icons.shield({ size: 22 })}</div>
          <p class="admin-login__eyebrow">Admin</p>
          <h1 class="glass-card__title" tabindex="-1">Sign in to the <em>dashboard</em></h1>
          <p class="glass-card__sub">Enter your admin email and we’ll email you a ${OTP_LENGTH}-digit one-time code. There’s no password.</p>
          <form class="auth-form admin-login__form" data-email-form novalidate>
            <div class="field">
              <label class="field__label" for="admin-email">Admin email</label>
              <input class="input" id="admin-email" name="email" type="email" inputmode="email" autocomplete="username" spellcheck="false" dir="ltr" aria-describedby="admin-email-error" />
              <p class="field__error" id="admin-email-error" hidden></p>
            </div>
            <button class="btn btn--solid btn--block" type="submit"><span class="btn__label">Email me a code</span></button>
            <p class="auth-note">The code works once and expires after ${OTP_TTL_MINUTES} minutes.</p>
          </form>
        </section>

        <section data-step="code" hidden>
          <div class="glass-card__icon">${icons.mail({ size: 22 })}<span class="dot" aria-hidden="true"></span></div>
          <h1 class="glass-card__title" tabindex="-1">Check your inbox</h1>
          <p class="glass-card__sub">Enter the ${OTP_LENGTH}-digit code we sent<br />to <span class="email-pill" data-email dir="ltr"></span></p>
          <form data-code-form novalidate>
            <div class="otp__boxes" role="group" aria-label="One-time code" aria-describedby="admin-otp-error"></div>
            <p class="otp__error" id="admin-otp-error" role="alert"></p>
            <button class="btn btn--solid otp__verify" type="submit" disabled><span class="btn__label">Verify and sign in</span></button>
          </form>
          <p class="otp__resend" aria-live="polite">
            <span style="color: inherit; font-weight: 400">Didn’t get it?</span>
            <span data-countdown></span>
            <button type="button" data-resend hidden></button>
          </p>
          <button class="otp__change" type="button" data-change>Use a different email</button>
        </section>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const card = $('.admin-login__card');
  const emailStep = $('[data-step="email"]');
  const codeStep = $('[data-step="code"]');
  const emailForm = $('[data-email-form]');
  const emailInput = $('#admin-email');
  const codeForm = $('[data-code-form]');
  const boxesWrap = $('.otp__boxes');
  const errorEl = $('#admin-otp-error');
  const verifyBtn = $('.otp__verify');
  const verifyLabel = verifyBtn.querySelector('.btn__label');
  const countdownEl = $('[data-countdown]');
  const resendBtn = $('[data-resend]');

  let busy = false;
  let locked = false;

  /* ---------- Step 1: email ---------- */
  function busyButton(btn, on, text) {
    const label = btn.querySelector('.btn__label');
    if (on) {
      btn.dataset.label = label.textContent;
      btn.classList.add('is-busy');
      btn.setAttribute('aria-disabled', 'true');
      label.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(text)}`;
    } else {
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-disabled');
      label.textContent = btn.dataset.label || label.textContent;
    }
  }

  const emailCheck = bindForm(
    emailForm,
    { email: [rules.required, rules.email] },
    {
      translate: (k) => MSG[k] || k,
      onSubmit: async ({ email }) => {
        const btn = emailForm.querySelector('button[type="submit"]');
        busyButton(btn, true, 'Sending code…');
        try {
          await requestAdminCode(email);
          busyButton(btn, false);
          showStep('code');
          toast(`Code sent to ${maskEmail(email.trim().toLowerCase())}`);
        } catch (err) {
          busyButton(btn, false);
          if (err.code === 'notAdmin') emailCheck.setError('email', 'errors.notAdmin');
          else if (err.code === 'invalidEmail') emailCheck.setError('email', 'errors.email');
          else toast(requestErrorText(err), { tone: 'error' });
        }
      },
    }
  );

  /* ---------- Step 2: code ---------- */
  const otp = createOtpInput(boxesWrap, {
    length: OTP_LENGTH,
    label: (i, n) => `Digit ${i + 1} of ${n}`,
    onEdit: () => clearError(),
    onChange: () => paintButton(),
    onComplete: () => {
      if (!busy && !locked) submitCode();
    },
  });

  function paintButton() {
    verifyBtn.disabled = !otp.complete() || busy || locked;
  }
  function clearError() {
    if (card.dataset.state === 'error') card.dataset.state = 'idle';
    errorEl.textContent = '';
  }
  function setVerifyLabel(state) {
    if (state === 'verifying') verifyLabel.innerHTML = `<span class="spinner" aria-hidden="true"></span> Verifying…`;
    else if (state === 'verified') verifyLabel.innerHTML = `${icons.check()} Signed in`;
    else verifyLabel.textContent = 'Verify and sign in';
    verifyBtn.classList.toggle('is-verifying', state === 'verifying');
    verifyBtn.classList.toggle('is-verified', state === 'verified');
  }

  async function submitCode() {
    otp.cancel();
    if (busy || locked) return;
    if (!otp.complete()) {
      card.dataset.state = 'error';
      errorEl.textContent = `Enter all ${OTP_LENGTH} digits.`;
      otp.focusFirstEmpty();
      return;
    }
    busy = true;
    paintButton();
    card.dataset.state = 'verifying';
    setVerifyLabel('verifying');
    otp.boxes.forEach((b) => b.blur());

    let result;
    try {
      result = await verifyAdminCode(otp.code());
    } catch (err) {
      busy = false;
      card.dataset.state = 'idle';
      setVerifyLabel('idle');
      showStep('email');
      toast('That sign-in request has ended. Please ask for a new code.', { tone: 'error' });
      return;
    }

    if (result.ok) {
      card.dataset.state = 'success';
      setVerifyLabel('verified');
      stopCountdown();
      await wait(gsap ? 700 : 0);
      if (gsap) await gsap.to(root, { autoAlpha: 0, duration: 0.45, ease: 'power2.in' });
      onSignedIn(result.session);
      return;
    }

    busy = false;
    card.dataset.state = 'error';
    setVerifyLabel('idle');
    boxesWrap.classList.remove('is-shaking');
    void boxesWrap.offsetWidth;
    boxesWrap.classList.add('is-shaking');
    if (result.notAdmin) {
      locked = true;
      otp.setDisabled(true);
      errorEl.textContent = 'This account doesn’t have admin access.';
    } else if (result.locked) {
      locked = true;
      otp.setDisabled(true);
      errorEl.textContent = result.expired
        ? 'This code has expired. Please request a new one.'
        : result.rateLimited
          ? 'Too many tries. Please wait a moment, then request a new code.'
          : 'Too many attempts. Please request a new code.';
      showResendNow();
    } else {
      errorEl.textContent = attemptsText(result.attemptsLeft);
    }
    setTimeout(() => {
      otp.clear();
      if (!locked) otp.focus();
    }, 520);
  }

  codeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCode();
  });

  /* ---------- Resend ---------- */
  let timer = 0;
  function stopCountdown() {
    clearInterval(timer);
  }
  function showResendNow() {
    stopCountdown();
    countdownEl.hidden = true;
    resendBtn.hidden = false;
    resendBtn.innerHTML = `${icons.refresh({ size: 14 })} Resend code`;
  }
  function startCountdown(seconds = OTP_RESEND_SECONDS) {
    let left = seconds;
    resendBtn.hidden = true;
    countdownEl.hidden = false;
    const paint = () => (countdownEl.innerHTML = `${icons.refresh({ size: 14 })} Resend in ${esc(clock(left))}`);
    paint();
    stopCountdown();
    timer = setInterval(() => {
      left -= 1;
      if (left <= 0) showResendNow();
      else paint();
    }, 1000);
  }

  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled = true;
    try {
      await resendAdminCode();
    } catch (err) {
      resendBtn.disabled = false;
      if (err.code === 'noPending') showStep('email');
      else toast(requestErrorText(err), { tone: 'error' });
      return;
    }
    resendBtn.disabled = false;
    locked = false;
    otp.setDisabled(false);
    otp.clear();
    clearError();
    startCountdown();
    otp.focus();
    toast(`A new code is on its way to ${maskEmail(getAdminPending().email)}`);
  });

  $('[data-change]').addEventListener('click', () => {
    cancelAdminCode();
    showStep('email');
  });

  /* ---------- Steps ---------- */
  function showStep(step) {
    const toCode = step === 'code';
    emailStep.hidden = toCode;
    codeStep.hidden = !toCode;
    card.dataset.state = 'idle';
    busy = false;
    locked = false;
    if (toCode) {
      const pending = getAdminPending();
      $('[data-email]').textContent = maskEmail(pending ? pending.email : '');
      otp.setDisabled(false);
      otp.clear();
      clearError();
      setVerifyLabel('idle');
      const elapsed = pending ? Math.floor((Date.now() - pending.sentAt) / 1000) : 0;
      if (elapsed >= OTP_RESEND_SECONDS) showResendNow();
      else startCountdown(OTP_RESEND_SECONDS - elapsed);
    } else {
      stopCountdown();
    }
    const view = toCode ? codeStep : emailStep;
    if (gsap) gsap.from(view.children, { autoAlpha: 0, y: 10, duration: 0.5, stagger: 0.04, ease: 'power2.out', clearProps: 'all' });
    setTimeout(() => (toCode ? otp.focus() : emailInput.focus()), gsap ? 250 : 0);
  }

  /* ---------- Start ---------- */
  const pending = getAdminPending();
  if (pending && Date.now() - pending.sentAt < OTP_TTL_MINUTES * 60 * 1000) {
    emailInput.value = pending.email;
    showStep('code'); // a code was already requested (e.g. the page was reloaded)
  } else {
    if (gsap) gsap.from(root.querySelectorAll('.admin-login__logo, .admin-login__card'), { autoAlpha: 0, y: 22, duration: 0.9, stagger: 0.08, ease: 'power3.out', clearProps: 'all' });
    setTimeout(() => emailInput.focus(), gsap ? 400 : 0);
  }
}

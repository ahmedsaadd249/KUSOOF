/* ==========================================================================
   Validation — rules + an accessible form binder.
   A rule returns true, or an error key (translated by the caller's
   `translate` function, so the same rules serve the customer site in
   EN/AR and the English admin).
   Markup per field:
     <div class="field">
       <label for="x">…</label>
       <input id="x" name="x" aria-describedby="x-error">
       <p class="field__error" id="x-error" hidden></p>
     </div>
   ========================================================================== */
import { toLatinDigits } from './i18n.js';

export const normalizePhone = (v) => {
  let d = toLatinDigits(v).replace(/\D/g, '');
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
};

export const rules = {
  required: (v) => String(v ?? '').trim() !== '' || 'errors.required',
  fullName: (v) => {
    const s = String(v ?? '').trim();
    return (s.length >= 3 && /\S+\s+\S+/.test(s)) || 'errors.name';
  },
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim()) || 'errors.email',
  /** Egyptian mobile: 10 digits after +20 — 10 / 11 / 12 / 15 then 8 digits */
  phoneEG: (v) => /^1[0125]\d{8}$/.test(normalizePhone(v)) || 'errors.phone',
  select: (v) => String(v ?? '') !== '' || 'errors.select',
  minNumber: (min, key = 'errors.required') => (v) => (v !== '' && Number(v) >= min) || key,
};

/**
 * bindForm(form, schema, { translate, onSubmit, summary })
 * schema: { name: [rule, …] } or { name: { rules, get, target, focus } } for custom fields.
 */
export function bindForm(form, schema, { translate = (k) => k, onSubmit, summary } = {}) {
  const touched = new Set();

  const entries = Object.entries(schema).map(([name, def]) => {
    const custom = !Array.isArray(def);
    const list = custom ? def.rules : def;
    const control = custom ? def.target : form.elements[name];
    const fieldEl = control && control.closest ? control.closest('.field') || control : null;
    const errorEl = form.querySelector(`#${CSS.escape(name)}-error`) || (fieldEl && fieldEl.querySelector('.field__error'));
    return {
      name,
      rules: list,
      get: custom ? def.get : () => (control ? control.value : ''),
      focus: custom && def.focus ? def.focus : () => control && control.focus(),
      control,
      fieldEl,
      errorEl,
    };
  });

  function show(entry, key) {
    const msg = key ? translate(key) : '';
    if (entry.errorEl) {
      entry.errorEl.textContent = msg;
      entry.errorEl.hidden = !msg;
    }
    if (entry.fieldEl) entry.fieldEl.classList.toggle('is-invalid', Boolean(msg));
    if (entry.control && entry.control.setAttribute) {
      if (msg) entry.control.setAttribute('aria-invalid', 'true');
      else entry.control.removeAttribute('aria-invalid');
    }
  }

  function check(entry) {
    const value = entry.get();
    for (const rule of entry.rules) {
      const res = rule(value, form);
      if (res !== true) return res;
    }
    return null;
  }

  function validateField(name) {
    const entry = entries.find((e) => e.name === name);
    if (!entry) return true;
    const err = check(entry);
    show(entry, err);
    return !err;
  }

  function validate() {
    const failed = [];
    entries.forEach((entry) => {
      touched.add(entry.name);
      const err = check(entry);
      show(entry, err);
      if (err) failed.push(entry);
    });
    if (summary) {
      summary.hidden = failed.length === 0;
      if (failed.length) summary.textContent = translate('errors.summary', { count: failed.length });
    }
    if (failed.length) failed[0].focus();
    return failed.length === 0;
  }

  function setError(name, key) {
    const entry = entries.find((e) => e.name === name);
    if (entry) {
      show(entry, key);
      touched.add(name);
    }
  }

  // Validate on blur; re-validate live once a field has been touched
  entries.forEach((entry) => {
    if (!entry.control || !entry.control.addEventListener || Array.isArray(schema[entry.name]) === false) return;
    entry.control.addEventListener('blur', () => {
      if (entry.control.value === '' && !touched.has(entry.name)) return;
      touched.add(entry.name);
      validateField(entry.name);
    });
    const live = () => {
      if (touched.has(entry.name)) validateField(entry.name);
    };
    entry.control.addEventListener('input', live);
    entry.control.addEventListener('change', live);
  });

  form.setAttribute('novalidate', '');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (onSubmit) onSubmit(values());
  });

  function values() {
    const out = {};
    entries.forEach((entry) => (out[entry.name] = entry.get()));
    return out;
  }

  return { validate, validateField, setError, values };
}

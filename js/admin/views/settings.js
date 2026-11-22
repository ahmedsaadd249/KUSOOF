/* Admin › Settings — store_settings row, shipping zones, admin profile.
   Everything is saved to Supabase (admin-only by RLS). */
import { esc, el } from '../../core/dom.js';
import { bindForm, rules } from '../../core/validate.js';
import { money as fmtMoney, dateTime } from '../../core/format.js';
import { openPanel, confirmDialog, toast } from '../../core/ui.js';
import { getSettings, saveSettings } from '../../services/settings.js';
import { listZones, createZone, updateZone, deleteZone } from '../../services/zones.js';
import { updateAdminName } from '../../services/admin-auth.js';
import { ai } from '../icons.js';
import { EMAIL_TYPE, money } from '../labels.js';

const MSG = {
  'errors.required': 'This field is required.',
  'errors.email': 'Enter a valid email address.',
  'errors.threshold': 'Enter a whole number of 0 or more.',
  'errors.fee': 'Enter a fee of 0 or more.',
  'errors.summary': 'Please fix the highlighted fields.',
};

const EMAIL_SUBJECTS = {
  order_confirmation: 'Order Confirmed — KSF-…',
  shipped: 'Your Order Has Been Shipped!',
  delivered: 'Your Order Has Been Delivered!',
  cancelled: 'Your Order Has Been Cancelled!',
};

/* ---------- Shipping zone form (slide-over) ---------- */
function zoneForm(zone, governorateHint, onSaved) {
  const isNew = !zone;
  const form = el(`
    <form class="form-stack" novalidate>
      <p class="form-summary" role="alert" hidden></p>
      <div class="lang-fields">
        <div class="field"><label class="field__label" for="z-gov">Governorate (English)</label><input class="input" id="z-gov" name="govEn" value="${esc(zone ? zone.governorate.en : governorateHint || '')}" aria-describedby="govEn-error" /><p class="field__error" id="govEn-error" hidden></p></div>
        <div class="field"><label class="field__label" for="z-gov-ar">Governorate (Arabic)</label><input class="input" id="z-gov-ar" name="govAr" dir="rtl" lang="ar" value="${esc(zone ? zone.governorate.ar : '')}" /></div>
      </div>
      <div class="lang-fields">
        <div class="field"><label class="field__label" for="z-area">Area (English)</label><input class="input" id="z-area" name="areaEn" value="${esc(zone && zone.area ? zone.area.en : '')}" aria-describedby="z-area-hint" /><p class="field__hint" id="z-area-hint">Leave empty for a governorate-wide fee (“Other area” at checkout).</p></div>
        <div class="field"><label class="field__label" for="z-area-ar">Area (Arabic)</label><input class="input" id="z-area-ar" name="areaAr" dir="rtl" lang="ar" value="${esc(zone && zone.area ? zone.area.ar : '')}" /></div>
      </div>
      <div class="field"><label class="field__label" for="z-fee">Delivery fee (EGP)</label><input class="input" id="z-fee" name="fee" type="number" min="0" step="1" inputmode="numeric" value="${zone ? zone.fee : ''}" aria-describedby="fee-error" style="max-width:200px" /><p class="field__error" id="fee-error" hidden></p></div>
      <label class="switch" style="min-height:44px"><input type="checkbox" name="active" ${!zone || zone.active ? 'checked' : ''} /><span class="switch__track"></span><span class="switch__text">Available at checkout</span></label>
    </form>`);
  const footer = el(`<div style="display:flex;gap:10px;justify-content:flex-end;width:100%"><button class="btn btn--outline btn--sm" type="button" data-cancel>Cancel</button><button class="btn btn--solid btn--sm" type="submit">${isNew ? 'Add zone' : 'Save zone'}</button></div>`);
  const panel = openPanel({ title: isNew ? 'Add delivery zone' : 'Edit delivery zone', subtitle: 'Customers pick their area at checkout; the fee is charged from here.', body: form, footer, width: 560 });
  footer.querySelector('[data-cancel]').addEventListener('click', panel.close);
  const saveBtn = footer.querySelector('[type="submit"]');
  saveBtn.addEventListener('click', () => form.requestSubmit());
  bindForm(
    form,
    { govEn: [rules.required], fee: [rules.required, (v) => (Number(v) >= 0 ? true : 'errors.fee')] },
    {
      translate: (k) => MSG[k] || k,
      summary: form.querySelector('.form-summary'),
      onSubmit: async (v) => {
        const f = form.elements;
        const payload = {
          governorate: { en: v.govEn.trim(), ar: f.govAr.value.trim() },
          area: f.areaEn.value.trim() ? { en: f.areaEn.value.trim(), ar: f.areaAr.value.trim() } : null,
          fee: Number(v.fee),
          active: f.active.checked,
        };
        saveBtn.classList.add('is-busy');
        saveBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving';
        try {
          if (isNew) await createZone(payload);
          else await updateZone(zone.id, payload);
          panel.close();
          toast(isNew ? 'Delivery zone added' : 'Delivery zone saved');
          onSaved();
        } catch (err) {
          saveBtn.classList.remove('is-busy');
          saveBtn.textContent = isNew ? 'Add zone' : 'Save zone';
          toast(err.code === 'duplicate' ? 'That governorate / area already exists.' : 'Could not save the zone.', { tone: 'error' });
        }
      },
    }
  );
}

function zonesCardHTML(zones) {
  const byGov = new Map();
  zones.forEach((z) => {
    if (!byGov.has(z.governorate.en)) byGov.set(z.governorate.en, []);
    byGov.get(z.governorate.en).push(z);
  });
  const rows = [...byGov.entries()]
    .map(([gov, list]) =>
      list
        .map(
          (z) => `
        <tr>
          <td class="cell-main" data-label="Governorate">${esc(gov)}${z.governorate.ar ? ` <span class="muted" lang="ar">· ${esc(z.governorate.ar)}</span>` : ''}</td>
          <td data-label="Area">${z.area ? `${esc(z.area.en)}${z.area.ar ? ` <span class="muted" lang="ar">· ${esc(z.area.ar)}</span>` : ''}` : '<span class="muted">Other areas (governorate-wide)</span>'}</td>
          <td data-label="Fee" class="num">${esc(money(z.fee))}</td>
          <td data-label="Checkout"><label class="switch"><input type="checkbox" data-zone-active="${esc(z.id)}" ${z.active ? 'checked' : ''} aria-label="${esc(`${gov} ${z.area ? z.area.en : 'other areas'} available at checkout`)}" /><span class="switch__track"></span></label></td>
          <td data-label=""><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn btn--outline btn--sm" type="button" data-zone-edit="${esc(z.id)}">Edit</button><button class="btn btn--outline btn--sm" type="button" data-zone-delete="${esc(z.id)}" aria-label="Delete ${esc(`${gov} ${z.area ? z.area.en : 'other areas'}`)}">${ai.trash()}</button></div></td>
        </tr>`
        )
        .join('')
    )
    .join('');
  return `
    <section class="a-card" aria-labelledby="st-zones" style="margin-top:18px">
      <div class="a-card__head">
        <div><h2 class="a-card__title" id="st-zones">Shipping zones</h2><p class="a-card__sub">Delivery fees by governorate and area. Checkout charges the fee of the area the customer selects; turned-off areas aren’t offered.</p></div>
        <button class="btn btn--solid btn--sm" type="button" data-zone-add>${ai.plus({ size: 15 })} Add zone</button>
      </div>
      <div class="a-table-wrap">
        <table class="a-table">
          <caption class="visually-hidden">Shipping zones</caption>
          <thead><tr><th scope="col">Governorate</th><th scope="col">Area</th><th scope="col">Fee</th><th scope="col">At checkout</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>${rows || '<tr><td class="a-table__empty" colspan="5">No delivery zones yet. Add one so customers can check out.</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
}

export default {
  id: 'settings',
  title: 'Settings',
  subtitle: 'Store details, currency, stock alerts, delivery zones and email preferences.',
  async render(view, { refresh, rerenderShell, signOut, session }) {
    const [s, zones] = await Promise.all([getSettings(), listZones({ includeInactive: true })]);
    view.innerHTML = `
      <form class="settings" novalidate>
        <p class="form-summary" role="alert" hidden style="margin-bottom:18px"></p>
        <div class="set-grid">
          <section class="a-card" aria-labelledby="st-store">
            <div class="a-card__head"><div><h2 class="a-card__title" id="st-store">Store information</h2><p class="a-card__sub">The contact email is used as the reply-to address of customer emails.</p></div></div>
            <div class="form-stack">
              <div class="field"><label class="field__label" for="s-name">Store name</label><input class="input" id="s-name" name="storeName" value="${esc(s.store.name)}" aria-describedby="storeName-error" /><p class="field__error" id="storeName-error" hidden></p></div>
              <div class="field"><label class="field__label" for="s-email">Contact email</label><input class="input" id="s-email" name="storeEmail" type="email" value="${esc(s.store.email)}" aria-describedby="storeEmail-error" /><p class="field__error" id="storeEmail-error" hidden></p></div>
              <div class="field"><label class="field__label" for="s-phone">Phone</label><input class="input" id="s-phone" name="storePhone" type="tel" value="${esc(s.store.phone)}" /></div>
              <div class="field"><label class="field__label" for="s-address">Address</label><input class="input" id="s-address" name="storeAddress" value="${esc(s.store.address)}" /></div>
            </div>
          </section>

          <section class="a-card" aria-labelledby="st-cur">
            <div class="a-card__head"><div><h2 class="a-card__title" id="st-cur">Currency display</h2><p class="a-card__sub">Prices are in Egyptian pounds (EGP). Arabic pages always show “ج.م” after the amount.</p></div></div>
            <div class="form-stack">
              <fieldset class="field"><legend class="field__label">Label</legend>
                <div class="radio-cards">
                  <label class="radio-card"><input type="radio" name="display" value="code" ${s.currency.display !== 'symbol' ? 'checked' : ''} /><b>EGP 8,900</b><small>Currency code</small></label>
                  <label class="radio-card"><input type="radio" name="display" value="symbol" ${s.currency.display === 'symbol' ? 'checked' : ''} /><b>LE 8,900</b><small>Local abbreviation</small></label>
                </div>
              </fieldset>
              <fieldset class="field"><legend class="field__label">Decimals</legend>
                <div class="radio-cards">
                  <label class="radio-card"><input type="radio" name="decimals" value="0" ${!s.currency.decimals ? 'checked' : ''} /><b>8,900</b><small>Whole pounds</small></label>
                  <label class="radio-card"><input type="radio" name="decimals" value="2" ${s.currency.decimals === 2 ? 'checked' : ''} /><b>8,900.00</b><small>With piastres</small></label>
                </div>
              </fieldset>
              <div class="preview-line" aria-live="polite" data-preview></div>
            </div>
          </section>

          <section class="a-card" aria-labelledby="st-stock">
            <div class="a-card__head"><div><h2 class="a-card__title" id="st-stock">Inventory &amp; delivery</h2><p class="a-card__sub">Products at or below this many units are marked “Low stock” in the admin and “Only N left” in the store.</p></div></div>
            <div class="field"><label class="field__label" for="s-threshold">Low-stock threshold (units)</label><input class="input" id="s-threshold" name="threshold" type="number" min="0" step="1" inputmode="numeric" value="${s.lowStockThreshold}" aria-describedby="threshold-error" style="max-width:180px" /><p class="field__error" id="threshold-error" hidden></p></div>
            <div class="toggle-row"><div>Accept new orders<small>When off, checkout explains that delivery is paused and orders are refused by the server.</small></div><label class="switch"><input type="checkbox" name="deliveryEnabled" ${s.delivery.enabled !== false ? 'checked' : ''} aria-label="Accept new orders" /><span class="switch__track"></span></label></div>
          </section>

          <section class="a-card" aria-labelledby="st-notify">
            <div class="a-card__head"><div><h2 class="a-card__title" id="st-notify">Customer emails</h2><p class="a-card__sub">Sent through Brevo in the customer’s language. Turned-off types are recorded as “Skipped”.</p></div></div>
            ${['order_confirmation', 'shipped', 'delivered', 'cancelled']
              .map(
                (k) => `
              <div class="toggle-row"><div>${esc(EMAIL_TYPE[k].en)} · <span lang="ar">${esc(EMAIL_TYPE[k].ar)}</span><small>“${esc(EMAIL_SUBJECTS[k])}”</small></div>
                <label class="switch"><input type="checkbox" name="n-${k}" ${s.notifications[k] !== false ? 'checked' : ''} aria-label="${esc(EMAIL_TYPE[k].en)} emails" /><span class="switch__track"></span></label></div>`
              )
              .join('')}
            <div class="toggle-row"><div>Low-stock alerts on the dashboard<small>Shows the “Needs attention” state on the stock cards</small></div><label class="switch"><input type="checkbox" name="n-lowStockAlert" ${s.notifications.lowStockAlert !== false ? 'checked' : ''} aria-label="Low-stock alerts" /><span class="switch__track"></span></label></div>
          </section>

          <section class="a-card" aria-labelledby="st-admin">
            <div class="a-card__head"><div><h2 class="a-card__title" id="st-admin">Admin profile</h2><p class="a-card__sub">You sign in with your email and a one-time code — no password.</p></div></div>
            <div class="form-stack">
              <div class="field"><label class="field__label" for="s-aname">Name</label><input class="input" id="s-aname" name="adminName" value="${esc(session ? session.name : '')}" aria-describedby="adminName-error" /><p class="field__error" id="adminName-error" hidden></p></div>
              <div class="field"><label class="field__label" for="s-aemail">Sign-in email</label><input class="input" id="s-aemail" type="email" value="${esc(session ? session.email : '')}" readonly aria-describedby="adminEmail-hint" /><p class="field__hint" id="adminEmail-hint">For security the admin email can only be changed on the server (docs/SETUP.md › Admin).</p></div>
              <div class="session-row">
                <p>Signed in as <b>${esc(session ? session.email : '')}</b>${session ? `<small>Since ${esc(dateTime(session.signedInAt, 'en'))}</small>` : ''}</p>
                <button class="btn btn--outline btn--sm" type="button" data-signout>Sign out</button>
              </div>
            </div>
          </section>
        </div>

        <div class="save-bar" data-dirty="false">
          <span data-save-msg>All changes saved</span>
          <button class="btn btn--light btn--sm" type="submit">Save settings</button>
        </div>
      </form>
      ${zonesCardHTML(zones)}`;

    const form = view.querySelector('form');
    const preview = view.querySelector('[data-preview]');
    const bar = view.querySelector('.save-bar');
    const msg = view.querySelector('[data-save-msg]');
    const currencyPrefs = () => ({ code: 'EGP', display: form.elements.display.value, decimals: Number(form.elements.decimals.value) });
    const paintPreview = () => {
      const c = currencyPrefs();
      preview.innerHTML = `<span>English: <b>${esc(fmtMoney(16875, 'en', c))}</b></span><span>Arabic: <b dir="rtl" lang="ar">${esc(fmtMoney(16875, 'ar', c))}</b></span>`;
    };
    paintPreview();

    form.addEventListener('input', () => {
      bar.dataset.dirty = 'true';
      msg.textContent = 'Unsaved changes';
      paintPreview();
    });
    form.addEventListener('change', paintPreview);

    bindForm(
      form,
      {
        storeName: [rules.required],
        storeEmail: [rules.required, rules.email],
        threshold: [rules.required, (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? true : 'errors.threshold')],
        adminName: [rules.required],
      },
      {
        translate: (k) => MSG[k] || k,
        summary: form.querySelector('.form-summary'),
        onSubmit: async (v) => {
          const btn = form.querySelector('[type="submit"]');
          btn.classList.add('is-busy');
          btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving';
          const f = form.elements;
          try {
            await saveSettings({
              store: { name: v.storeName.trim(), email: v.storeEmail.trim(), phone: f.storePhone.value.trim(), address: f.storeAddress.value.trim() },
              currency: currencyPrefs(),
              lowStockThreshold: Number(v.threshold),
              notifications: {
                order_confirmation: f['n-order_confirmation'].checked,
                shipped: f['n-shipped'].checked,
                delivered: f['n-delivered'].checked,
                cancelled: f['n-cancelled'].checked,
                lowStockAlert: f['n-lowStockAlert'].checked,
              },
              delivery: { enabled: f.deliveryEnabled.checked },
            });
            if (session && v.adminName.trim() !== session.name) {
              await updateAdminName(session.userId, v.adminName);
              session.name = v.adminName.trim();
            }
            toast('Settings saved');
            rerenderShell();
            refresh();
          } catch (err) {
            btn.classList.remove('is-busy');
            btn.textContent = 'Save settings';
            toast('Could not save the settings.', { tone: 'error' });
          }
        },
      }
    );

    view.querySelector('[data-signout]').addEventListener('click', () => signOut());

    /* Shipping zones (saved immediately, independent of the save bar) */
    const zonesCard = view.querySelector('#st-zones').closest('section');
    zonesCard.addEventListener('click', async (e) => {
      const add = e.target.closest('[data-zone-add]');
      const edit = e.target.closest('[data-zone-edit]');
      const del = e.target.closest('[data-zone-delete]');
      if (add) zoneForm(null, '', refresh);
      else if (edit) zoneForm(zones.find((z) => z.id === edit.dataset.zoneEdit), '', refresh);
      else if (del) {
        const zone = zones.find((z) => z.id === del.dataset.zoneDelete);
        const label = `${zone.governorate.en}${zone.area ? ` › ${zone.area.en}` : ' (other areas)'}`;
        const ok = await confirmDialog({
          title: 'Delete this delivery zone?',
          message: `${label} will no longer be offered at checkout. Past orders keep their address and fee.`,
          confirmLabel: 'Delete',
          tone: 'danger',
        });
        if (!ok) return;
        try {
          await deleteZone(zone.id);
          toast('Delivery zone deleted');
          refresh();
        } catch (err) {
          toast(err.code === 'zone_in_use' ? 'Open orders still use this zone — turn it off instead.' : 'Could not delete the zone.', { tone: 'error', duration: 6000 });
        }
      }
    });
    zonesCard.addEventListener('change', async (e) => {
      const toggle = e.target.closest('[data-zone-active]');
      if (!toggle) return;
      try {
        await updateZone(toggle.dataset.zoneActive, { active: toggle.checked });
        toast(toggle.checked ? 'Zone available at checkout' : 'Zone hidden from checkout');
      } catch (err) {
        toggle.checked = !toggle.checked;
        toast('Could not update the zone.', { tone: 'error' });
      }
    });
  },
};

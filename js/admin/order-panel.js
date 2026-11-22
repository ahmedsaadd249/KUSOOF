/* Order details slide-over (admin) — full order + forward-only status update
   (the database enforces the same rules and queues the email). */
import { esc, el } from '../core/dom.js';
import { dateTime, phone, number } from '../core/format.js';
import { openPanel, toast } from '../core/ui.js';
import { getOrder, updateOrderStatus } from '../services/orders.js';
import { settingsSync } from '../services/settings.js';
import { createMapPicker } from '../components/map-picker.js';
import { NEXT_STATUSES } from '../config.js';
import { STATUS, PAYMENT, PAYMENT_TONE, LANG, DELIVERY_STATUS, money, asset, statusBadge, toneBadge, langTag } from './labels.js';

export async function openOrderPanel(id, { onChange } = {}) {
  const order = await getOrder(id);
  if (!order) {
    toast('Order not found', { tone: 'error' });
    return;
  }

  const body = el('<div></div>');
  const footer = el(`<div style="display:flex;gap:10px;width:100%;justify-content:flex-end"><button class="btn btn--outline btn--sm" type="button" data-close-panel>Close</button></div>`);
  const panel = openPanel({ title: order.id, subtitle: `Placed ${dateTime(order.createdAt, 'en')}`, body, footer, width: 620 });
  footer.querySelector('[data-close-panel]').addEventListener('click', panel.close);

  function render(o) {
    const a = o.address;
    const emailOn = settingsSync().notifications || {};
    const nextStatuses = NEXT_STATUSES[o.status] || [];
    body.innerHTML = `
      <section class="o-section">
        <h3>Status</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px">${statusBadge(o.status)} ${toneBadge(`Payment: ${PAYMENT[o.payment.status] || o.payment.status}`, PAYMENT_TONE[o.payment.status])} ${langTag(o.locale)}</div>
        ${
          nextStatuses.length
            ? `<form class="o-status" data-status-form>
          <div class="field">
            <label class="field__label" for="o-status-select">Update order status</label>
            <select class="select" id="o-status-select" name="status">
              <option value="">Choose the next status…</option>
              ${nextStatuses.map((s) => `<option value="${s}">${esc(STATUS[s].en)} — ${esc(STATUS[s].ar)}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn--solid btn--sm" type="submit" style="min-height:44px">Update</button>
        </form>
        <p class="o-note" data-note></p>`
            : `<p class="o-note">This order is ${esc(STATUS[o.status].en.toLowerCase())} — its status can’t change any more.${o.status === 'cancelled' && o.stockRestored ? ' Its items were returned to stock.' : ''}</p>`
        }
      </section>

      <section class="o-section">
        <h3>Timeline</h3>
        <ol class="timeline">
          ${o.history
            .slice()
            .reverse()
            .map((h) => `<li><i aria-hidden="true"></i><div>${statusBadge(h.status)}<small>${esc(dateTime(h.at, 'en'))}${h.note ? ` · ${esc(h.note)}` : ''}</small></div></li>`)
            .join('')}
        </ol>
      </section>

      <section class="o-section">
        <h3>Items</h3>
        <div class="o-items">
          ${o.items
            .map(
              (i) => `<div class="o-item">${i.image ? `<img src="${esc(asset(i.image))}" alt="" />` : '<span></span>'}<div><div style="font-weight:500">${esc(i.name.en)}</div><div class="who__email">${esc(money(i.price))} × ${i.qty}</div></div><div style="font-weight:600">${esc(money(i.price * i.qty))}</div></div>`
            )
            .join('')}
        </div>
        <div class="o-totals">
          <div><span>Subtotal</span><span>${esc(money(o.subtotal))}</span></div>
          <div><span>Delivery</span><span>${esc(money(o.deliveryFee))}</span></div>
          <div class="total"><span>Total</span><span>${esc(money(o.total))}</span></div>
        </div>
      </section>

      <section class="o-section">
        <h3>Customer</h3>
        <dl class="kv">
          <dt>Name</dt><dd>${esc(o.customer.name)}</dd>
          <dt>Email</dt><dd>${esc(o.customer.email)}</dd>
          <dt>Phone</dt><dd>${esc(phone(o.customer.phone))}</dd>
          <dt>Language</dt><dd>${esc(LANG[o.locale] || o.locale)} — emails go out in ${esc(LANG[o.locale] || o.locale)}</dd>
        </dl>
      </section>

      <section class="o-section">
        <h3>Delivery address</h3>
        <dl class="kv">
          <dt>Country</dt><dd>Egypt</dd>
          <dt>Governorate</dt><dd>${esc(a.governorate.en)}${a.governorate.ar && a.governorate.ar !== a.governorate.en ? ` · <span lang="ar">${esc(a.governorate.ar)}</span>` : ''}</dd>
          <dt>Area</dt><dd>${esc(a.area.en || '—')}${a.area.ar && a.area.ar !== a.area.en ? ` · <span lang="ar">${esc(a.area.ar)}</span>` : ''}</dd>
          <dt>Street</dt><dd>${esc(a.street || '—')}</dd>
          <dt>Building / Apt</dt><dd>${esc(a.building || '—')} / ${esc(a.apartment || '—')}</dd>
          ${a.instructions ? `<dt>Instructions</dt><dd>${esc(a.instructions)}</dd>` : ''}
          ${a.formatted ? `<dt>Map address</dt><dd>${esc(a.formatted)}</dd>` : ''}
          <dt>Coordinates</dt><dd>${a.lat != null ? `${esc(number(a.lat, 'en', { minimumFractionDigits: 6 }))}, ${esc(number(a.lng, 'en', { minimumFractionDigits: 6 }))} · <a href="https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}" target="_blank" rel="noopener">Open in Google Maps</a>` : 'No map pin (entered manually)'}</dd>
        </dl>
        <div class="o-map" data-map style="margin-top:14px"></div>
      </section>

      <section class="o-section">
        <h3>Payment</h3>
        <dl class="kv"><dt>Method</dt><dd>Cash on delivery</dd><dt>Status</dt><dd>${esc(PAYMENT[o.payment.status] || o.payment.status)}</dd></dl>
      </section>`;

    createMapPicker(body.querySelector('[data-map]'), { pin: a.lat != null ? { lat: a.lat, lng: a.lng } : null, readonly: true });

    const form = body.querySelector('[data-status-form]');
    if (!form) return;
    const select = body.querySelector('#o-status-select');
    const note = body.querySelector('[data-note]');
    const paintNote = () => {
      const st = select.value;
      if (!st) {
        note.textContent = 'Status only moves forward: Preparing → Shipped → Delivered, or Cancelled before delivery.';
        return;
      }
      const email = emailOn[st] === false
        ? `“${STATUS[st].en}” emails are turned off in Settings, so no email is sent.`
        : `The customer gets a “${STATUS[st].en}” email in ${LANG[o.locale] || o.locale}.`;
      note.textContent = st === 'cancelled' ? `Cancelling returns the items to stock and can’t be undone. ${email}` : `${email} This can’t be undone.`;
    };
    select.addEventListener('change', paintNote);
    paintNote();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const next = select.value;
      if (!next) {
        select.focus();
        return;
      }
      const btn = e.currentTarget.querySelector('button');
      btn.classList.add('is-busy');
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving';
      try {
        const { order: updated, notification } = await updateOrderStatus(o.id, next);
        render(updated);
        const ds = notification ? DELIVERY_STATUS[notification.status] : null;
        toast(
          notification
            ? `Status → ${STATUS[next].en} · ${notification.status === 'skipped' ? 'email turned off in Settings' : `${LANG[updated.locale]} email ${ds ? ds.label.toLowerCase() : notification.status}`}`
            : `Status → ${STATUS[next].en}`
        );
        if (onChange) onChange(updated);
      } catch (err) {
        btn.classList.remove('is-busy');
        btn.textContent = 'Update';
        toast(err.code === 'invalid_transition' ? 'That status change isn’t allowed any more (the order may have changed).' : 'Could not update the order', { tone: 'error' });
        if (err.code === 'invalid_transition') {
          const fresh = await getOrder(o.id);
          if (fresh) render(fresh);
        }
      }
    });
  }

  render(order);
  return panel;
}

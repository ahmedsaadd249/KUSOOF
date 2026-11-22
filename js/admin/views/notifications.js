/* Admin › Email notifications — real delivery history (Brevo via the
   email-dispatch Edge Function) + template previews (EN / AR).
   Each order gets at most one email of each type; failed emails can be
   retried (same record, so never a duplicate). */
import { esc } from '../../core/dom.js';
import { dateTime, number } from '../../core/format.js';
import { toast } from '../../core/ui.js';
import { listNotifications, retryNotification } from '../../services/notifications.js';
import { settingsSync } from '../../services/settings.js';
import { renderEmail, TEMPLATE_TYPES } from '../../data/email-templates.js';
import { ai } from '../icons.js';
import { EMAIL_TYPE, DELIVERY_STATUS, LANG, toneBadge, langTag, who } from '../labels.js';

const SAMPLE = {
  en: { customerName: 'Mariam Adel', customerPhone: '+20 10 1234 5678', address: '15 Road 90, Building 14, Apt 7, New Cairo, Cairo, Egypt' },
  ar: { customerName: 'ليلى محمود', customerPhone: '+20 10 1234 5678', address: '15 شارع التسعين، مبنى 14، شقة 7، القاهرة الجديدة، القاهرة، مصر' },
};

function sampleData(locale) {
  return {
    ...SAMPLE[locale],
    orderNumber: 'KSF-261122-7Q4M',
    items: [
      { name: locale === 'ar' ? 'نظارة شمسية سوداء كلاسيكية' : 'Classic Black Sunglasses', qty: 1, lineTotal: 8900 },
      { name: locale === 'ar' ? 'نظارة طبية سوداء كلاسيكية' : 'Classic Black Optical Glasses', qty: 1, lineTotal: 7900 },
    ],
    subtotal: 16800,
    deliveryFee: 75,
    total: 16875,
    orderUrl: '#',
    currency: settingsSync().currency,
  };
}

const logoUrl = () => new URL('../logo/kusoof-logo-transparent.png', window.location.href).href;

function statusCell(n) {
  const ds = DELIVERY_STATUS[n.status] || { label: n.status, tone: 'muted' };
  let detail = '';
  if (n.status === 'sent' && n.sentAt) detail = `Sent ${dateTime(n.sentAt, 'en')}`;
  else if (n.status === 'pending' && n.attempts > 0) detail = `Retry ${n.attempts + 1} at ${dateTime(n.nextAttemptAt, 'en')}`;
  else if (n.status === 'skipped') detail = 'Turned off in Settings';
  const err = n.error ? `<small class="muted" style="display:block;max-width:260px;overflow-wrap:anywhere" title="${esc(n.error)}">${esc(n.error.slice(0, 120))}</small>` : '';
  return `${toneBadge(ds.label, ds.tone)}${detail ? `<small class="muted" style="display:block;margin-top:4px">${esc(detail)}</small>` : ''}${err}`;
}

export default {
  id: 'notifications',
  title: 'Email notifications',
  subtitle: 'Order emails sent to customers through Brevo, in each customer’s language.',
  async render(view, { query, refresh }) {
    const all = await listNotifications();
    const type = query.get('type') || '';
    const counts = { '': all.length };
    TEMPLATE_TYPES.forEach((t) => (counts[t] = all.filter((n) => n.type === t).length));
    const by = (s) => all.filter((n) => n.status === s).length;
    const queued = by('pending') + by('sending');
    const arabic = all.filter((n) => n.locale === 'ar').length;

    view.innerHTML = `
      <div class="phase-note" style="margin-bottom:18px">${ai.info()}<p><strong>How emails are sent.</strong> Placing an order or changing its status queues one email in the order’s language (English or Arabic). Brevo sends it within seconds; temporary failures retry automatically (after 1, 5, 15 and 60 minutes). An email never undoes the order change, and each order gets each type at most once.${queued ? ' Emails stay queued until Brevo is configured (docs/SETUP.md).' : ''}</p></div>
      <div class="a-grid" style="margin-bottom:18px">
        <section class="a-card stat span-3"><span class="stat__label">Sent</span><div class="stat__value">${number(by('sent'), 'en')}</div><div class="stat__foot">${toneBadge('Delivered to Brevo', 'ok')}</div></section>
        <section class="a-card stat span-3"><span class="stat__label">Queued</span><div class="stat__value">${number(queued, 'en')}</div><div class="stat__foot">${queued ? toneBadge('Waiting to send', 'warn') : 'Nothing waiting'}</div></section>
        <section class="a-card stat span-3"><span class="stat__label">Failed</span><div class="stat__value">${number(by('failed'), 'en')}</div><div class="stat__foot">${by('failed') ? toneBadge('Needs attention', 'err') : 'None'}</div></section>
        <section class="a-card stat span-3"><span class="stat__label">Arabic / English</span><div class="stat__value">${arabic} / ${all.length - arabic}</div><div class="stat__foot">Language follows the order</div></section>
      </div>

      <div class="toolbar">
        <div class="pills" role="group" aria-label="Filter by type">
          ${['', ...TEMPLATE_TYPES].map((t) => `<button type="button" data-type="${t}" aria-pressed="${type === t}">${t ? esc(EMAIL_TYPE[t].en) : 'All'} <span>${counts[t]}</span></button>`).join('')}
        </div>
        <label class="search"><span class="visually-hidden">Search notifications</span>${ai.search()}<input type="search" placeholder="Email, name or order no." data-search /></label>
      </div>

      <section class="a-card" style="margin-bottom:18px">
        <div class="a-table-wrap">
          <table class="a-table">
            <caption class="visually-hidden">Email notification history</caption>
            <thead><tr><th scope="col">Customer</th><th scope="col">Order no.</th><th scope="col">Type</th><th scope="col">Language</th><th scope="col">Subject</th><th scope="col">Created</th><th scope="col">Delivery</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody data-rows></tbody>
          </table>
        </div>
        <div class="pager"><span data-count></span><button class="link-btn" type="button" data-more hidden>Show more</button></div>
      </section>

      <section class="a-card" aria-labelledby="tpl-title">
        <div class="a-card__head"><div><h2 class="a-card__title" id="tpl-title">Email templates</h2><p class="a-card__sub">The exact HTML the email function sends (sample data), in both languages.</p></div></div>
        <div class="tpl-tabs">
          <div class="pills" role="tablist" aria-label="Template">${TEMPLATE_TYPES.map((t, i) => `<button type="button" role="tab" data-tpl="${t}" aria-selected="${i === 0}" aria-pressed="${i === 0}">${esc(EMAIL_TYPE[t].en)}</button>`).join('')}</div>
          <div class="toolbar__actions">
            <div class="pills" role="group" aria-label="Language">${['en', 'ar'].map((l, i) => `<button type="button" data-tlang="${l}" aria-pressed="${i === 0}">${l === 'en' ? 'English' : 'العربية'}</button>`).join('')}</div>
            <button class="btn btn--outline btn--sm" type="button" data-copy>${ai.copy()} Copy HTML</button>
          </div>
        </div>
        <p class="tpl-subject">Subject: <b data-subject></b></p>
        <iframe class="tpl-frame" title="Email template preview" sandbox="allow-same-origin" data-frame></iframe>
      </section>`;

    /* History */
    const rows = view.querySelector('[data-rows]');
    const search = view.querySelector('[data-search]');
    const countEl = view.querySelector('[data-count]');
    const moreBtn = view.querySelector('[data-more]');
    let currentType = type;
    let limit = 12;
    function paint() {
      const q = search.value.trim().toLowerCase();
      const list = all.filter(
        (n) => (!currentType || n.type === currentType) && (!q || n.customerEmail.toLowerCase().includes(q) || n.customerName.toLowerCase().includes(q) || n.orderId.toLowerCase().includes(q))
      );
      const shown = list.slice(0, limit);
      rows.innerHTML = shown.length
        ? shown
            .map(
              (n) => `
          <tr>
            <td class="cell-main" data-label="Customer">${who(n.customerName, n.customerEmail)}</td>
            <td data-label="Order"><a class="mono link-btn" href="#/orders?open=${encodeURIComponent(n.orderId)}">${esc(n.orderId)}</a></td>
            <td data-label="Type"><span class="s-badge" data-status="${esc(n.type === 'order_confirmation' ? 'preparing' : n.type)}"><i aria-hidden="true"></i>${esc((EMAIL_TYPE[n.type] || { en: n.type }).en)}</span></td>
            <td data-label="Language">${langTag(n.locale)}</td>
            <td data-label="Subject" ${n.locale === 'ar' ? 'dir="rtl" lang="ar" style="text-align:start"' : ''}>${esc(n.subject)}</td>
            <td data-label="Created" class="muted">${esc(dateTime(n.createdAt, 'en'))}</td>
            <td data-label="Delivery">${statusCell(n)}</td>
            <td data-label="">${n.status === 'failed' ? `<button class="btn btn--outline btn--sm" type="button" data-retry="${esc(n.id)}">Retry</button>` : ''}</td>
          </tr>`
            )
            .join('')
        : '<tr><td class="a-table__empty" colspan="8">No emails yet. They appear here when an order is placed or its status changes.</td></tr>';
      countEl.textContent = `${shown.length} of ${list.length} records`;
      moreBtn.hidden = list.length <= limit;
    }
    paint();
    search.addEventListener('input', () => {
      limit = 12;
      paint();
    });
    moreBtn.addEventListener('click', () => {
      limit += 12;
      paint();
    });
    view.querySelectorAll('[data-type]').forEach((b) =>
      b.addEventListener('click', () => {
        currentType = b.dataset.type;
        history.replaceState(null, '', `#/notifications${currentType ? `?type=${currentType}` : ''}`);
        view.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        limit = 12;
        paint();
      })
    );
    rows.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-retry]');
      if (!btn) return;
      btn.classList.add('is-busy');
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
      try {
        await retryNotification(btn.dataset.retry);
        toast('Email queued again');
        refresh();
      } catch (err) {
        btn.classList.remove('is-busy');
        btn.textContent = 'Retry';
        toast(err.code === 'not_retryable' ? 'This email isn’t in a failed state any more.' : 'Could not retry the email.', { tone: 'error' });
      }
    });

    /* Template preview */
    let tpl = TEMPLATE_TYPES[0];
    let tlang = 'en';
    const frame = view.querySelector('[data-frame]');
    const subject = view.querySelector('[data-subject]');
    const current = () => renderEmail({ type: tpl, locale: tlang, data: sampleData(tlang), logoUrl: logoUrl() });
    function paintTemplate() {
      const { subject: s, html } = current();
      subject.textContent = s;
      subject.dir = tlang === 'ar' ? 'rtl' : 'ltr';
      frame.srcdoc = html;
      frame.title = `${EMAIL_TYPE[tpl].en} email template preview (${LANG[tlang]})`;
    }
    view.querySelectorAll('[data-tpl]').forEach((b) =>
      b.addEventListener('click', () => {
        tpl = b.dataset.tpl;
        view.querySelectorAll('[data-tpl]').forEach((x) => {
          x.setAttribute('aria-selected', String(x === b));
          x.setAttribute('aria-pressed', String(x === b));
        });
        paintTemplate();
      })
    );
    view.querySelectorAll('[data-tlang]').forEach((b) =>
      b.addEventListener('click', () => {
        tlang = b.dataset.tlang;
        view.querySelectorAll('[data-tlang]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        paintTemplate();
      })
    );
    view.querySelector('[data-copy]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(current().html);
        toast(`Copied the ${EMAIL_TYPE[tpl].en} (${LANG[tlang]}) email HTML`);
      } catch (err) {
        toast('Clipboard unavailable in this browser', { tone: 'error' });
      }
    });
    paintTemplate();
  },
};

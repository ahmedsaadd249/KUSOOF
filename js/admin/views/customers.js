/* Admin › Customers — list + profile with order history. */
import { esc, countUp } from '../../core/dom.js';
import { date, phone, initials, number } from '../../core/format.js';
import { listCustomers, getCustomer } from '../../services/customers.js';
import { openOrderPanel } from '../order-panel.js';
import { ai } from '../icons.js';
import { LANG, money, statusBadge, toneBadge, langTag, itemsText, who } from '../labels.js';

async function renderList(view, { query }) {
  const customers = (await listCustomers()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  view.innerHTML = `
    <div class="toolbar">
      <p class="a-card__sub">${customers.length} customers · ${customers.filter((c) => c.locale === 'ar').length} prefer Arabic</p>
      <label class="search"><span class="visually-hidden">Search customers</span>${ai.search()}<input type="search" placeholder="Name, email or phone" data-search value="${esc(query.get('q') || '')}" /></label>
    </div>
    <section class="a-card">
      <div class="a-table-wrap">
        <table class="a-table">
          <caption class="visually-hidden">Customers</caption>
          <thead><tr><th scope="col">Customer</th><th scope="col">Phone</th><th scope="col" class="num">Orders</th><th scope="col" class="num">Total spent</th><th scope="col">Language</th><th scope="col">Registered</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody data-rows></tbody>
        </table>
      </div>
    </section>`;
  const rows = view.querySelector('[data-rows]');
  const search = view.querySelector('[data-search]');
  function paint() {
    const q = search.value.trim().toLowerCase();
    const list = customers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || String(c.phone || '').includes(q));
    rows.innerHTML = list.length
      ? list
          .map(
            (c) => `
        <tr>
          <td class="cell-main" data-label="Customer">${who(c.name, c.email)}</td>
          <td data-label="Phone" class="muted">${esc(c.phone ? phone(c.phone) : '—')}</td>
          <td data-label="Orders" class="num">${c.orderCount}</td>
          <td data-label="Total spent" class="num">${esc(money(c.totalSpent))}</td>
          <td data-label="Language">${langTag(c.locale)}</td>
          <td data-label="Registered" class="muted">${esc(date(c.createdAt, 'en'))}</td>
          <td data-label=""><a class="btn btn--outline btn--sm" href="#/customers/${encodeURIComponent(c.id)}" aria-label="View ${esc(c.name)}">View</a></td>
        </tr>`
          )
          .join('')
      : '<tr><td class="a-table__empty" colspan="7">No customers match.</td></tr>';
  }
  paint();
  search.addEventListener('input', paint);
}

async function renderProfile(view, id, { refresh }) {
  const c = await getCustomer(id);
  if (!c) {
    view.innerHTML = `<a class="back-link" href="#/customers">${ai.back()} Customers</a><section class="a-card"><p>Customer not found.</p></section>`;
    return;
  }
  const avg = c.orderCount ? Math.round(c.totalSpent / Math.max(1, c.orders.filter((o) => o.status !== 'cancelled').length)) : 0;
  view.innerHTML = `
    <a class="back-link" href="#/customers">${ai.back()} Customers</a>
    <div class="a-grid">
      <section class="a-card profile-card span-12">
        <div class="profile-banner"></div>
        <div class="profile-body">
          <div class="profile-id">
            <span class="profile-avatar" aria-hidden="true">${esc(initials(c.name))}</span>
            <div>
              <h2 class="profile-name">${esc(c.name)}</h2>
              <div class="profile-meta"><span>${esc(c.email)}</span><span>${esc(c.phone ? phone(c.phone) : 'No phone yet')}</span><span>Registered ${esc(date(c.createdAt, 'en'))}</span></div>
            </div>
          </div>
          <div class="profile-tags">${c.verified ? toneBadge('Email verified', 'ok') : toneBadge('Not verified', 'warn')} ${toneBadge(`Emails in ${LANG[c.locale] || c.locale}`, 'muted')}</div>
        </div>
      </section>
      ${[
        { label: 'Orders', value: c.orderCount, fmt: (v) => number(Math.round(v), 'en') },
        { label: 'Total spent', value: c.totalSpent, fmt: (v) => money(Math.round(v)) },
        { label: 'Average order', value: avg, fmt: (v) => money(Math.round(v)) },
      ]
        .map((k, i) => `<section class="a-card stat span-3"><span class="stat__label">${esc(k.label)}</span><div class="stat__value" data-k="${i}">${esc(k.fmt(k.value))}</div></section>`)
        .join('')}
      <section class="a-card stat span-3"><span class="stat__label">Last order</span><div class="stat__value" style="font-size:1.4rem">${esc(c.lastOrderAt ? date(c.lastOrderAt, 'en') : '—')}</div></section>

      <section class="a-card span-12" aria-labelledby="hist-title">
        <div class="a-card__head"><h2 class="a-card__title" id="hist-title">Order history</h2></div>
        <div class="a-table-wrap">
          <table class="a-table">
            <thead><tr><th scope="col">Order no.</th><th scope="col">Date</th><th scope="col">Products</th><th scope="col" class="num">Total</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              ${
                c.orders.length
                  ? c.orders
                      .map(
                        (o) => `<tr><td class="cell-main" data-label="Order"><span class="mono">${esc(o.id)}</span> ${langTag(o.locale)}</td><td data-label="Date" class="muted">${esc(date(o.createdAt, 'en'))}</td><td data-label="Products" class="items">${esc(itemsText(o.items))}</td><td data-label="Total" class="num">${esc(money(o.total))}</td><td data-label="Status">${statusBadge(o.status)}</td><td data-label=""><button class="btn btn--outline btn--sm" type="button" data-view="${esc(o.id)}">View</button></td></tr>`
                      )
                      .join('')
                  : '<tr><td class="a-table__empty" colspan="6">No orders yet.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
  const k = [c.orderCount, c.totalSpent, avg];
  view.querySelectorAll('[data-k]').forEach((n) => {
    const i = Number(n.dataset.k);
    countUp(n, k[i], { fmt: (v) => (i === 0 ? number(Math.round(v), 'en') : money(Math.round(v))) });
  });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) openOrderPanel(b.dataset.view, { onChange: refresh });
  });
}

export default {
  id: 'customers',
  title: 'Customers',
  subtitle: 'Registered customers, their language and order history.',
  render(view, ctx) {
    return ctx.params[0] ? renderProfile(view, decodeURIComponent(ctx.params[0]), ctx) : renderList(view, ctx);
  },
};

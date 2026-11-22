/* Admin › Orders — filter, search, sort, paginate, open details, update status. */
import { esc } from '../../core/dom.js';
import { date } from '../../core/format.js';
import { listOrders } from '../../services/orders.js';
import { openOrderPanel } from '../order-panel.js';
import { ai } from '../icons.js';
import { STATUS, STATUS_ORDER, PAYMENT, PAYMENT_TONE, money, statusBadge, toneBadge, langTag, itemsText, who } from '../labels.js';

const PAGE = 8;

export default {
  id: 'orders',
  title: 'Orders',
  subtitle: 'Every order, its payment and its status. Status changes email the customer in their language.',
  async render(view, { query, navigate, refresh }) {
    const all = await listOrders();
    const status = query.get('status') || '';
    let sort = { key: 'date', dir: 'desc' };
    let page = 1;

    const counts = { '': all.length };
    STATUS_ORDER.forEach((s) => (counts[s] = all.filter((o) => o.status === s).length));

    view.innerHTML = `
      <div class="toolbar">
        <div class="pills" role="group" aria-label="Filter by status">
          ${['', ...STATUS_ORDER].map((s) => `<button type="button" data-status="${s}" aria-pressed="${status === s}">${s ? esc(STATUS[s].en) : 'All'} <span>${counts[s]}</span></button>`).join('')}
        </div>
        <div class="toolbar__actions">
          <label class="date-filter"><span>From</span><input class="input" type="date" data-from value="${esc(query.get('from') || '')}" /></label>
          <label class="date-filter"><span>To</span><input class="input" type="date" data-to value="${esc(query.get('to') || '')}" /></label>
          <label class="search"><span class="visually-hidden">Search orders</span>${ai.search()}<input type="search" placeholder="Order no., customer or email" data-search value="${esc(query.get('q') || '')}" /></label>
        </div>
      </div>
      <section class="a-card">
        <div class="a-table-wrap">
          <table class="a-table">
            <caption class="visually-hidden">Orders</caption>
            <thead>
              <tr>
                <th scope="col">Order no.</th>
                <th scope="col">Customer</th>
                <th scope="col" aria-sort="descending" data-sort="date"><button type="button">Date ${ai.sort()}</button></th>
                <th scope="col">Products</th>
                <th scope="col" class="num" data-sort="total"><button type="button">Total ${ai.sort()}</button></th>
                <th scope="col">Payment</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody data-rows></tbody>
          </table>
        </div>
        <div class="pager" data-pager></div>
      </section>`;

    const rows = view.querySelector('[data-rows]');
    const pager = view.querySelector('[data-pager]');
    const search = view.querySelector('[data-search]');
    const fromEl = view.querySelector('[data-from]');
    const toEl = view.querySelector('[data-to]');

    function filtered() {
      const q = search.value.trim().toLowerCase();
      const from = fromEl.value ? new Date(`${fromEl.value}T00:00:00`).getTime() : null;
      const to = toEl.value ? new Date(`${toEl.value}T23:59:59.999`).getTime() : null;
      const list = all.filter((o) => {
        const at = new Date(o.createdAt).getTime();
        return (
          (!status || o.status === status) &&
          (from == null || at >= from) &&
          (to == null || at <= to) &&
          (!q || o.id.toLowerCase().includes(q) || o.customer.name.toLowerCase().includes(q) || o.customer.email.toLowerCase().includes(q))
        );
      });
      const dir = sort.dir === 'asc' ? 1 : -1;
      return list.sort((a, b) => (sort.key === 'total' ? (a.total - b.total) * dir : a.createdAt.localeCompare(b.createdAt) * dir));
    }

    function paint() {
      const list = filtered();
      const pages = Math.max(1, Math.ceil(list.length / PAGE));
      page = Math.min(page, pages);
      const slice = list.slice((page - 1) * PAGE, page * PAGE);
      rows.innerHTML = slice.length
        ? slice
            .map(
              (o) => `
          <tr>
            <td class="cell-main" data-label="Order"><span class="mono">${esc(o.id)}</span> ${langTag(o.locale)}</td>
            <td data-label="Customer">${who(o.customer.name, o.customer.email)}</td>
            <td data-label="Date" class="muted">${esc(date(o.createdAt, 'en'))}</td>
            <td data-label="Products" class="items">${esc(itemsText(o.items))}</td>
            <td data-label="Total" class="num">${esc(money(o.total))}</td>
            <td data-label="Payment">${toneBadge(PAYMENT[o.payment.status] || o.payment.status, PAYMENT_TONE[o.payment.status])}</td>
            <td data-label="Status">${statusBadge(o.status)}</td>
            <td data-label=""><button class="btn btn--outline btn--sm" type="button" data-view="${esc(o.id)}" aria-label="View order ${esc(o.id)}">View</button></td>
          </tr>`
            )
            .join('')
        : '<tr><td class="a-table__empty" colspan="8">No orders match.</td></tr>';
      pager.innerHTML = `
        <span>${list.length ? `${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, list.length)} of ${list.length}` : '0 orders'}</span>
        <div class="pager__btns">
          <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">${ai.chevronL()}</button>
          ${Array.from({ length: pages }, (_, i) => `<button type="button" data-page="${i + 1}" ${i + 1 === page ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')}
          <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page">${ai.chevronR()}</button>
        </div>`;
    }
    paint();

    view.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => navigate(`#/orders${b.dataset.status ? `?status=${b.dataset.status}` : ''}`)));
    [search, fromEl, toEl].forEach((input) =>
      input.addEventListener('input', () => {
        page = 1;
        paint();
      })
    );
    view.querySelectorAll('th[data-sort] button').forEach((btn) =>
      btn.addEventListener('click', () => {
        const th = btn.closest('th');
        const key = th.dataset.sort;
        sort = { key, dir: sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc' };
        view.querySelectorAll('th[data-sort]').forEach((x) => x.removeAttribute('aria-sort'));
        th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
        paint();
      })
    );
    pager.addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      page = Number(b.dataset.page);
      paint();
    });
    rows.addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b) openOrderPanel(b.dataset.view, { onChange: refresh });
    });

    // Deep link: #/orders?open=KSF-…
    const open = query.get('open');
    if (open) {
      history.replaceState(null, '', `#/orders${status ? `?status=${status}` : ''}`);
      openOrderPanel(open, { onChange: refresh });
    }
  },
};

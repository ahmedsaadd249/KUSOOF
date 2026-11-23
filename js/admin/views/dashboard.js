/* Admin › Dashboard overview */
import { esc, countUp } from '../../core/dom.js';
import { date, number } from '../../core/format.js';
import { listOrders } from '../../services/orders.js';
import { listProducts, stockState } from '../../services/products.js';
import { listCustomers } from '../../services/customers.js';
import { listNotifications } from '../../services/notifications.js';
import { settingsSync } from '../../services/settings.js';
import { columnChart, segmentedBar, sparkline } from '../charts.js';
import { openOrderPanel } from '../order-panel.js';
import { ai } from '../icons.js';
import { STATUS, STATUS_ORDER, STATUS_COLOR, EMAIL_TYPE, DELIVERY_STATUS, money, statusBadge, toneBadge, langTag, pct } from '../labels.js';

const DAY = 86400000;
const counted = (o) => o.status !== 'cancelled';
const sum = (list) => list.reduce((s, o) => s + o.total, 0);

function inRange(list, from, to) {
  return list.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= from && t < to;
  });
}

function delta(curr, prev, { upIsGood = true } = {}) {
  if (!prev && !curr) return '<span class="delta">—</span>';
  const change = prev ? Math.round(((curr - prev) / prev) * 100) : 100;
  const up = change >= 0;
  const good = up === upIsGood;
  return `<span class="delta ${good ? 'delta--up' : 'delta--down'}">${up ? ai.up() : ai.down()} ${up ? '+' : ''}${change}%</span>`;
}

function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

export default {
  id: 'dashboard',
  title: 'Dashboard',
  async render(view, { navigate, refresh, session }) {
    const [orders, products, customers, notes] = await Promise.all([
      listOrders(),
      listProducts({ includeUnavailable: true }),
      listCustomers(),
      listNotifications(),
    ]);
    const settings = settingsSync();
    const alerts = (settings.notifications || {}).lowStockAlert !== false;
    const now = Date.now();
    const last30 = inRange(orders, now - 30 * DAY, now + DAY);
    const prev30 = inRange(orders, now - 60 * DAY, now - 30 * DAY);
    const revenue30 = sum(last30.filter(counted));
    const revenuePrev = sum(prev30.filter(counted));
    const revenueAll = sum(orders.filter(counted));
    // Cash on delivery: "revenue" = booked orders not cancelled; "collected" = delivered (cash received)
    const collected = sum(orders.filter((o) => o.status === 'delivered'));
    const low = products.filter((p) => stockState(p) === 'low');
    const out = products.filter((p) => stockState(p) === 'out');
    const newCustomers = customers.filter((c) => new Date(c.createdAt).getTime() > now - 30 * DAY).length;

    // 8 weekly buckets (Monday weeks), current week last
    const thisWeek = weekStart(now);
    const weeks = Array.from({ length: 8 }, (_, i) => thisWeek - (7 - i) * 7 * DAY);
    const weekly = weeks.map((ws, i) => {
      const inWeek = inRange(orders, ws, ws + 7 * DAY);
      return {
        label: date(ws, 'en', { day: 'numeric', month: 'short' }),
        sublabel: `Week of ${date(ws, 'en', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        value: sum(inWeek.filter(counted)),
        orders: inWeek.length,
        current: i === 7,
      };
    });

    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const preparing = orders.filter((o) => o.status === 'preparing').length;

    view.innerHTML = `
      <div class="a-grid">
        <section class="a-hero span-8">
          <div>
            <p class="a-hero__eyebrow">${esc(greet)}, ${esc((session && session.name) || 'Admin')}</p>
            <h2 class="a-hero__title">Every detail, <em>in order.</em></h2>
            <div class="a-hero__actions">
              <a class="btn btn--light btn--sm" href="#/orders?status=preparing">Review ${preparing} preparing ${preparing === 1 ? 'order' : 'orders'}</a>
              <a class="btn btn--ghost-light btn--sm" href="#/products?new=1">${ai.plus({ size: 14 })} Add product</a>
            </div>
          </div>
          <div class="a-hero__figure">
            <small>Revenue · last 30 days</small>
            <span class="hero-figure" data-count="${revenue30}" data-money>${esc(money(revenue30))}</span>
            <div>${delta(revenue30, revenuePrev)} <small style="display:inline">vs previous 30 days</small></div>
          </div>
        </section>

        <section class="a-card span-4" aria-labelledby="cal-title">
          <div class="cal__head">
            <h2 class="cal__title" id="cal-title"></h2>
            <div class="cal__nav">
              <button type="button" data-week="-1" aria-label="Previous week">${ai.chevronL()}</button>
              <button type="button" data-week="1" aria-label="Next week">${ai.chevronR()}</button>
            </div>
          </div>
          <div class="cal__days" role="group" aria-label="Orders per day"></div>
          <div class="cal__detail" aria-live="polite"></div>
        </section>

        <div class="span-12" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:18px">
          ${[
            { label: 'Total products', value: products.length, icon: ai.box(), foot: `${products.filter((p) => p.available).length} live in the store`, link: '#/products' },
            { label: 'Total orders', value: orders.length, icon: ai.orders({ size: 17 }), foot: `${delta(last30.length, prev30.length)} last 30 days`, spark: weekly.map((w) => w.orders) },
            { label: 'Total customers', value: customers.length, icon: ai.customers({ size: 17 }), foot: `+${newCustomers} in the last 30 days`, link: '#/customers' },
            { label: 'Total revenue', value: revenueAll, money: true, icon: ai.coin(), foot: `Excludes cancelled · ${money(collected)} collected`, spark: weekly.map((w) => w.value) },
            { label: 'Low stock products', value: low.length, icon: ai.alert(), foot: `≤ ${settings.lowStockThreshold} units`, link: '#/products?filter=low', tone: alerts && low.length ? 'warn' : null },
            { label: 'Out of stock products', value: out.length, icon: ai.alert(), foot: 'Hidden from checkout', link: '#/products?filter=out', tone: alerts && out.length ? 'err' : null },
          ]
            .map(
              (k) => `
            <section class="a-card stat">
              <div class="stat__top"><span class="stat__label">${esc(k.label)}</span><span class="stat__icon" aria-hidden="true">${k.icon}</span></div>
              <div class="stat__value" data-count="${k.value}"${k.money ? ' data-money' : ''}>${esc(k.money ? money(k.value) : number(k.value, 'en'))}</div>
              <div class="stat__foot">
                <span>${k.tone ? toneBadge(k.tone === 'warn' ? 'Needs attention' : 'Restock', k.tone) : k.foot}</span>
                ${k.spark ? sparkline(k.spark) : k.link ? `<a class="stat__link" href="${k.link}">View</a>` : ''}
              </div>
            </section>`
            )
            .join('')}
        </div>

        <section class="a-card span-8" aria-labelledby="rev-title">
          <div class="a-card__head">
            <div><h2 class="a-card__title" id="rev-title">Revenue by week</h2><p class="a-card__sub">Last 8 weeks · EGP · excludes cancelled orders · current week in black</p></div>
          </div>
          <div data-revenue></div>
        </section>

        <section class="a-card span-4" aria-labelledby="st-title">
          <div class="a-card__head"><div><h2 class="a-card__title" id="st-title">Orders by status</h2><p class="a-card__sub">${orders.length} orders · select a status to filter</p></div></div>
          <div data-status></div>
        </section>

        <section class="a-card span-5" aria-labelledby="ro-title">
          <div class="a-card__head"><h2 class="a-card__title" id="ro-title">Recent orders</h2><a class="link-btn" href="#/orders">All orders</a></div>
          <div class="a-list">
            ${orders
              .slice(0, 5)
              .map(
                (o) => `
              <div class="a-list__row">
                <div class="a-list__main">
                  <button class="a-list__title" type="button" data-order="${esc(o.id)}">${esc(o.id)}</button>
                  <p class="a-list__meta">${esc(o.customer.name)} · ${esc(money(o.total))} · ${esc(date(o.createdAt, 'en', { day: 'numeric', month: 'short' }))}</p>
                </div>
                ${statusBadge(o.status)}
              </div>`
              )
              .join('')}
          </div>
        </section>

        <section class="a-card span-3" aria-labelledby="sa-title">
          <div class="a-card__head"><h2 class="a-card__title" id="sa-title">Stock alerts</h2><a class="link-btn" href="#/products">Products</a></div>
          ${
            low.length + out.length
              ? [...out, ...low]
                  .map((p) => {
                    const state = stockState(p);
                    return `
                <div class="stock-row">
                  <div class="stock-row__top"><span>${esc(p.name.en)}</span><b>${p.stock}</b></div>
                  <div class="meter" data-state="${state}"><span style="width:${Math.max(4, pct(p.stock, Math.max(settings.lowStockThreshold * 2, 1)))}%"></span></div>
                  <a class="link-btn" href="#/products?edit=${encodeURIComponent(p.id)}">Update stock</a>
                </div>`;
                  })
                  .join('')
              : `<p class="a-card__sub">All products are above the low-stock threshold (${settings.lowStockThreshold}).</p>`
          }
        </section>

        <section class="a-card span-4" aria-labelledby="nt-title">
          <div class="a-card__head"><h2 class="a-card__title" id="nt-title">Notifications</h2><a class="link-btn" href="#/notifications">History</a></div>
          <div class="tabs-mini" role="tablist" aria-label="Notification type">
            ${['all', 'welcome', 'order_confirmation', 'shipped', 'delivered', 'cancelled'].map((k, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-ntab="${k}">${k === 'all' ? 'All' : k === 'order_confirmation' ? 'Confirmed' : EMAIL_TYPE[k].en}</button>`).join('')}
          </div>
          <div class="a-list" data-notes></div>
        </section>
      </div>`;

    /* Count-ups */
    view.querySelectorAll('[data-count]').forEach((n, i) => {
      const to = Number(n.dataset.count);
      countUp(n, to, { duration: 1.4, delay: 0.15 + i * 0.05, fmt: (v) => (n.hasAttribute('data-money') ? money(Math.round(v)) : number(Math.round(v), 'en')) });
    });

    /* Charts */
    columnChart(view.querySelector('[data-revenue]'), weekly, { format: money, caption: 'Revenue by week, last 8 weeks' });
    segmentedBar(
      view.querySelector('[data-status]'),
      STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].en, labelAr: STATUS[s].ar, value: orders.filter((o) => o.status === s).length, color: STATUS_COLOR[s] })),
      { onSelect: (s) => navigate(`#/orders?status=${s}`) }
    );

    /* Calendar week strip */
    let offset = 0;
    let selected = new Date(now).setHours(0, 0, 0, 0);
    const calTitle = view.querySelector('#cal-title');
    const calDays = view.querySelector('.cal__days');
    const calDetail = view.querySelector('.cal__detail');
    function paintCalendar() {
      const ws = thisWeek + offset * 7 * DAY;
      calTitle.textContent = date(ws, 'en', { month: 'long', year: 'numeric' });
      const today = new Date(now).setHours(0, 0, 0, 0);
      calDays.innerHTML = Array.from({ length: 7 }, (_, i) => {
        const d = ws + i * DAY;
        const n = inRange(orders, d, d + DAY).length;
        return `<button type="button" class="cal__day${d === today ? ' is-today' : ''}${d === selected ? ' is-selected' : ''}" data-day="${d}" aria-pressed="${d === selected}" aria-label="${esc(date(d, 'en', { weekday: 'long', day: 'numeric', month: 'long' }))}: ${n} orders">
          ${esc(date(d, 'en', { weekday: 'short' }))}<strong>${new Date(d).getDate()}</strong><span class="cal__dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(n, 3))}</span></button>`;
      }).join('');
      const dayOrders = inRange(orders, selected, selected + DAY);
      calDetail.innerHTML = dayOrders.length
        ? `<strong>${dayOrders.length} ${dayOrders.length === 1 ? 'order' : 'orders'}</strong> on ${esc(date(selected, 'en', { day: 'numeric', month: 'short' }))} · ${esc(money(sum(dayOrders.filter(counted))))}<br/>${dayOrders.map((o) => `<button class="link-btn" type="button" data-order="${esc(o.id)}">${esc(o.id)}</button>`).join(' ')}`
        : `No orders on ${esc(date(selected, 'en', { day: 'numeric', month: 'short' }))}.`;
    }
    view.querySelectorAll('[data-week]').forEach((b) =>
      b.addEventListener('click', () => {
        offset += Number(b.dataset.week);
        selected = thisWeek + offset * 7 * DAY;
        paintCalendar();
      })
    );
    calDays.addEventListener('click', (e) => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      selected = Number(b.dataset.day);
      paintCalendar();
    });
    paintCalendar();

    /* Notification tabs */
    const notesEl = view.querySelector('[data-notes]');
    function paintNotes(type) {
      const list = notes.filter((n) => type === 'all' || n.type === type).slice(0, 5);
      notesEl.innerHTML = list.length
        ? list
            .map(
              (n) => `
          <div class="a-list__row">
            <div class="a-list__main">
              <p class="a-list__title">${esc(n.subject)}</p>
              <p class="a-list__meta">${[n.customerEmail, n.orderId, date(n.createdAt, 'en', { day: 'numeric', month: 'short' })].filter(Boolean).map(esc).join(' · ')}</p>
            </div>
            ${toneBadge((DELIVERY_STATUS[n.status] || { label: n.status }).label, (DELIVERY_STATUS[n.status] || { tone: 'muted' }).tone)} ${langTag(n.locale)}
          </div>`
            )
            .join('')
        : '<p class="a-card__sub" style="padding:12px 0">No records yet.</p>';
    }
    view.querySelector('.tabs-mini').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ntab]');
      if (!b) return;
      view.querySelectorAll('[data-ntab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      paintNotes(b.dataset.ntab);
    });
    paintNotes('all');

    /* Open orders */
    view.addEventListener('click', (e) => {
      const b = e.target.closest('[data-order]');
      if (b) openOrderPanel(b.dataset.order, { onChange: refresh });
    });
  },
};

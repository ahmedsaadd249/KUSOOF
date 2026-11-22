/* ==========================================================================
   Admin charts (SVG). Follows the dataviz method:
   · columns ≤ 24px, 4px rounded data-end, square at the baseline
   · hairline solid gridlines, clean ticks, selective labels (current + max)
   · per-mark hover/focus tooltip, table view always available
   · single series → no legend box (the card title names it)
   · emphasis form: past weeks in steel, current week in ink
   ========================================================================== */
import { esc, reduceMotion } from '../core/dom.js';

const NS = 'http://www.w3.org/2000/svg';

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

const compact = (n) => (n >= 10000 ? `${Math.round(n / 1000)}K` : n.toLocaleString('en-US'));

function columnPath(x, y, w, base) {
  const h = base - y;
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/**
 * columnChart(el, data, { format, height, caption })
 * data: [{ label, value, sublabel?, current? }]
 */
export function columnChart(el, data, { format = String, height = 230, caption = '' } = {}) {
  el.classList.add('chart');
  el.innerHTML = `
    <div class="chart__plot" style="position:relative"></div>
    <div class="chart-tip" role="status" aria-live="polite"></div>
    <button class="link-btn" type="button" data-table-toggle aria-expanded="false">View as table</button>
    <table class="chart-table" hidden>
      <caption class="visually-hidden">${esc(caption)}</caption>
      <thead><tr><th scope="col">Week</th><th scope="col">Value</th></tr></thead>
      <tbody>${data.map((d) => `<tr><td>${esc(d.sublabel || d.label)}</td><td>${esc(format(d.value))}</td></tr>`).join('')}</tbody>
    </table>`;
  const plot = el.querySelector('.chart__plot');
  const tip = el.querySelector('.chart-tip');
  const toggle = el.querySelector('[data-table-toggle]');
  const table = el.querySelector('table');
  toggle.addEventListener('click', () => {
    const show = table.hidden;
    table.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
    toggle.textContent = show ? 'Hide table' : 'View as table';
  });

  let animated = false;
  function draw() {
    const W = Math.max(280, plot.clientWidth || el.clientWidth || 600);
    const H = height;
    const m = { top: 22, right: 8, bottom: 26, left: 44 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const max = niceMax(Math.max(...data.map((d) => d.value), 1));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
    const band = iw / data.length;
    const bw = Math.min(24, band * 0.55);
    const base = m.top + ih;
    const y = (v) => m.top + ih - (v / max) * ih;
    const maxIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

    let s = `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(caption)}">`;
    s += '<g class="grid">';
    ticks.forEach((tv) => {
      const ty = y(tv).toFixed(1);
      if (tv > 0) s += `<line x1="${m.left}" x2="${W - m.right}" y1="${ty}" y2="${ty}"/>`;
      s += `<text class="tick" x="${m.left - 10}" y="${(+ty + 4).toFixed(1)}" text-anchor="end">${esc(compact(tv))}</text>`;
    });
    s += '</g>';
    s += `<line class="baseline" x1="${m.left}" x2="${W - m.right}" y1="${base}" y2="${base}"/>`;
    data.forEach((d, i) => {
      const cx = m.left + band * i + band / 2;
      const x = cx - bw / 2;
      const top = y(d.value);
      const fill = d.current ? 'var(--ink)' : 'var(--col-past)';
      s += `<rect class="col-hit" x="${(m.left + band * i).toFixed(1)}" y="${m.top}" width="${band.toFixed(1)}" height="${ih}" tabindex="0" data-i="${i}" aria-label="${esc(`${d.sublabel || d.label}: ${format(d.value)}`)}"/>`;
      s += `<path class="col" data-i="${i}" d="${columnPath(x, top, bw, base)}" fill="${fill}"/>`;
      if (d.current || i === maxIndex) s += `<text class="cap-label" x="${cx.toFixed(1)}" y="${(top - 8).toFixed(1)}" text-anchor="middle">${esc(format(d.value))}</text>`;
      s += `<text class="tick" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>`;
    });
    s += '</svg>';
    plot.innerHTML = s;

    const cols = plot.querySelectorAll('.col');
    const show = (i) => {
      const d = data[i];
      const cx = m.left + band * i + band / 2;
      cols.forEach((c) => c.classList.toggle('is-hover', Number(c.dataset.i) === i));
      tip.innerHTML = `<strong>${esc(format(d.value))}</strong>${esc(d.sublabel || d.label)}`;
      const scale = plot.clientWidth / W;
      tip.style.left = `${cx * scale}px`;
      tip.style.top = `${y(d.value) * scale}px`;
      tip.classList.add('is-visible');
    };
    const hide = () => {
      cols.forEach((c) => c.classList.remove('is-hover'));
      tip.classList.remove('is-visible');
    };
    plot.querySelectorAll('.col-hit').forEach((hit) => {
      const i = Number(hit.dataset.i);
      hit.addEventListener('pointerenter', () => show(i));
      hit.addEventListener('focus', () => show(i));
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('blur', hide);
    });

    if (!animated && window.gsap && !reduceMotion) {
      animated = true;
      window.gsap.from(cols, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.9, stagger: 0.05, ease: 'power3.out' });
      window.gsap.from(plot.querySelectorAll('.cap-label'), { opacity: 0, duration: 0.4, delay: 0.7 });
    }
  }

  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(plot);
  return { destroy: () => ro.disconnect() };
}

/**
 * Thin segmented bar + labelled rows (one whole → parts).
 * parts: [{ key, label, labelAr, value, color }]
 */
export function segmentedBar(el, parts, { onSelect } = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  el.innerHTML = `
    <div class="seg" role="img" aria-label="${esc(parts.map((p) => `${p.label} ${p.value}`).join(', '))}">
      ${parts.filter((p) => p.value > 0).map((p) => `<span style="flex:${p.value};background:${p.color}" title="${esc(`${p.label}: ${p.value}`)}"></span>`).join('')}
    </div>
    <div class="seg-list">
      ${parts
        .map(
          (p) => `
        <${onSelect ? 'button type="button"' : 'div'} class="seg-row" data-key="${esc(p.key)}">
          <i style="background:${p.color}" aria-hidden="true"></i>
          <span>${esc(p.label)}${p.labelAr ? `<span class="ar" lang="ar">${esc(p.labelAr)}</span>` : ''}</span>
          <b>${p.value}</b>
          <small>${Math.round((p.value / total) * 100)}%</small>
        </${onSelect ? 'button' : 'div'}>`
        )
        .join('')}
    </div>`;
  if (onSelect) el.querySelectorAll('.seg-row').forEach((row) => row.addEventListener('click', () => onSelect(row.dataset.key)));
  if (window.gsap && !reduceMotion) window.gsap.from(el.querySelectorAll('.seg span'), { scaleX: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' });
}

/** 96×28 sparkline: de-emphasis line, current point in ink with a surface ring. */
export function sparkline(values, { width = 96, height = 28 } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--col-past)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="var(--ink)" stroke="#fff" stroke-width="2"/></svg>`;
}

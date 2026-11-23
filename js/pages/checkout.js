/* ==========================================================================
   Checkout — signed-in customers only. Delivery fee comes from the
   shipping zones in the database (governorate → area); the Google map fills
   the address and suggests the zone, the customer confirms or edits.
   The order is created by the place_order RPC: the server re-reads prices,
   stock and the zone fee, so nothing sent from here can change the total.
   One idempotency key per checkout attempt prevents duplicate orders.
   ========================================================================== */
import { t, loc, locale, applyI18n, esc } from '../core/i18n.js';
import { $, reduceMotion } from '../core/dom.js';
import { bindForm, rules, normalizePhone } from '../core/validate.js';
import { number } from '../core/format.js';
import { toast } from '../core/ui.js';
import { getSession, signOut, updateSession } from '../services/auth.js';
import * as cart from '../services/cart.js';
import { placeOrder, listOrders } from '../services/orders.js';
import { listZones, governorates, zonesFor } from '../services/zones.js';
import { settingsSync } from '../services/settings.js';
import { createMapPicker } from '../components/map-picker.js';
import { summaryItemsHTML, totalsHTML } from '../components/order-summary.js';
import { icons } from '../components/icons.js';
import { initPage, sessionReady } from './common.js';

initPage({ page: 'cart', titleKey: 'meta.checkoutTitle' });

const IDEM_KEY = 'kusoof.checkout.attempt';
const OTHER = 'other';

const root = $('#checkout-root');
let session = null;
let details = null;
let zones = [];
let pin = null;
let lastAddress = null;
let map = null;
let check = null;
let mapAvailable = true;

/* ---------- Delivery zones ---------- */
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟ]/g, '')
    .replace(/\b(governorate|government|gov\.?)\b|محافظة/g, '')
    .replace(/^(al|el)[-\s]/, '')
    .replace(/^ال/, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{L})\1+/gu, '$1') // "Mohandessin" / "Mohandesin"
    .trim();
const same = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return Boolean(x && y) && (x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x))));
};
/** "Maadi" in "Maadi al Khahiri", "المعادي" in "معادي الخبيري" — not "Cairo" in "Downtown Cairo". */
const nameIn = (name, place) => {
  const n = norm(name);
  const p = norm(place);
  return Boolean(n && p) && (n === p || (n.length >= 3 && ` ${p} `.includes(` ${n} `)));
};

function selectedZone() {
  const gov = $('#co-governorate').value;
  const value = $('#co-zone').value;
  if (!gov || !value) return null;
  const { areas, wide } = zonesFor(zones, gov);
  if (value === OTHER) return wide;
  return areas.find((z) => z.id === value) || null;
}

function paintAreas(selected = '') {
  const gov = $('#co-governorate').value;
  const select = $('#co-zone');
  const { areas, wide } = gov ? zonesFor(zones, gov) : { areas: [], wide: null };
  select.innerHTML = `<option value="">${esc(t('checkout.areaPlaceholder'))}</option>${areas
    .map((z) => `<option value="${esc(z.id)}">${esc(loc(z.area))}</option>`)
    .join('')}${wide ? `<option value="${OTHER}">${esc(t('checkout.areaOther'))}</option>` : ''}`;
  select.disabled = !gov;
  select.value = selected && [...select.options].some((o) => o.value === selected) ? selected : '';
  toggleOtherArea();
}

function toggleOtherArea() {
  const other = $('#co-zone').value === OTHER;
  $('#area-other-field').hidden = !other;
}

function paintGovernorates(selected = '') {
  const select = $('#co-governorate');
  select.innerHTML = `<option value="">${esc(t('checkout.governoratePlaceholder'))}</option>${governorates(zones)
    .map((g) => `<option value="${esc(g.en)}">${esc(loc(g))}</option>`)
    .join('')}`;
  select.value = selected && [...select.options].some((o) => o.value === selected) ? selected : '';
}

/** Pre-select governorate / area from what the map returned (customer can change it). */
function matchZone(address) {
  const filled = [];
  if (!address) return filled;
  const gov = governorates(zones).find((g) => same(g.en, address.governorate) || same(g.ar, address.governorate));
  if (!gov) return filled;
  if ($('#co-governorate').value !== gov.en) {
    $('#co-governorate').value = gov.en;
    paintAreas();
  }
  filled.push('#co-governorate');
  const { areas, wide } = zonesFor(zones, gov.en);
  const candidates = address.areaCandidates && address.areaCandidates.length ? address.areaCandidates : [address.area];
  // Most local place name first; a zone matches when its name is (whole words of) that name.
  let area = null;
  for (const c of candidates) {
    area = areas.find((z) => nameIn(z.area.en, c) || nameIn(z.area.ar, c));
    if (area) break;
  }
  if (area) {
    $('#co-zone').value = area.id;
    filled.push('#co-zone');
  } else if (wide) {
    $('#co-zone').value = OTHER;
    filled.push('#co-zone');
    if (setFromMap('#co-area', candidates[0])) filled.push('#co-area');
  }
  toggleOtherArea();
  if (check) {
    check.validateField('governorate');
    check.validateField('zone');
    if (filled.includes('#co-area')) check.validateField('area');
  }
  paintSummary();
  return filled;
}

/* ---------- Summary ---------- */
function paintSummary() {
  const lines = details.lines.filter((l) => l.available);
  const zone = selectedZone();
  $('[data-summary-items]').innerHTML = summaryItemsHTML(
    lines.map((l) => ({ name: l.product.name, qty: l.qty, price: l.unitPrice, image: l.product.images[0] && (l.product.images[0].light || l.product.images[0].src) }))
  );
  $('[data-summary-totals]').innerHTML = totalsHTML({
    subtotal: details.subtotal,
    delivery: zone ? zone.fee : t('checkout.selectArea'),
    total: details.subtotal + (zone ? zone.fee : 0),
  });
}

/* ---------- Map readout ---------- */
function paintReadout() {
  const box = $('#map-readout');
  if (!mapAvailable) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (!pin) {
    box.innerHTML = `<p class="map-readout__empty">${esc(t('map.noPin'))}</p>`;
    return;
  }
  const a = lastAddress || {};
  box.innerHTML = `
    <div>
      <p class="map-readout__label">${esc(t('map.selected'))}</p>
      <p class="map-readout__address">${esc(a.formatted || '—')}</p>
      <p class="map-readout__coords">${esc(t('map.coords'))}: ${esc(number(pin.lat, 'en', { minimumFractionDigits: 6 }))}, ${esc(number(pin.lng, 'en', { minimumFractionDigits: 6 }))}</p>
      ${filledNote ? `<p class="map-readout__note">${esc(filledNote)}</p>` : ''}
    </div>
    ${a.street || a.governorate ? `<button class="btn btn--outline btn--sm" type="button" data-use-address>${icons.pin({ size: 14 })} ${esc(t('map.use'))}</button>` : ''}`;
}

/* Every new pin (click, drag, search, my location) fills the address fields
   from the map; the customer can still edit them. Fields the map has no value
   for keep what the customer typed. */
const FIELD_LABEL = {
  '#co-governorate': 'checkout.governorate',
  '#co-zone': 'checkout.area',
  '#co-area': 'checkout.area',
  '#co-street': 'checkout.street',
  '#co-building': 'checkout.building',
};
let filledNote = '';
const mapValues = {}; // what the map last wrote into each text field

/** Write the map's value; if the map has none, clear only text the map wrote itself. */
function setFromMap(sel, value) {
  const el = $(sel);
  if (value) {
    el.value = value;
    mapValues[sel] = value;
  } else if (mapValues[sel] && el.value === mapValues[sel]) {
    el.value = '';
    delete mapValues[sel];
  } else return false;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return Boolean(value);
}

function flash(sel) {
  const el = $(sel);
  el.classList.remove('is-autofilled');
  void el.offsetWidth; // restart the animation
  el.classList.add('is-autofilled');
}

function useAddress({ announce = false } = {}) {
  if (!lastAddress) return;
  const filled = matchZone(lastAddress);
  [
    ['#co-street', lastAddress.street],
    ['#co-building', lastAddress.building],
  ].forEach(([sel, value]) => {
    if (setFromMap(sel, value)) filled.push(sel);
  });
  filled.forEach(flash);
  const names = [...new Set(filled.map((sel) => t(FIELD_LABEL[sel])))];
  const notes = [];
  if (names.length) notes.push(t('map.filled', { fields: new Intl.ListFormat(locale, { type: 'conjunction' }).format(names) }));
  if (!$('#co-apartment').value.trim()) notes.push(t('map.addApartment'));
  filledNote = notes.join(' ');
  paintReadout();
  if (announce) toast(t('map.used'));
}

/* ---------- Errors from the server ---------- */
const FIELD_FOR = {
  customer_name: 'fullName',
  phone: 'phone',
  street: 'street',
  building_number: 'building',
  apartment_number: 'apartment',
  area: 'area',
  location: 'pin',
};

async function handleOrderError(err) {
  switch (err.code) {
    case 'insufficient_stock': {
      const d = typeof err.detail === 'object' ? err.detail : {};
      const product = details.lines.find((l) => l.product && (l.product.uuid === d.product_id || l.product.slug === d.slug));
      toast(t('checkout.stockError', { name: product ? loc(product.product.name) : d.name || '', count: d.available ?? 0 }), { tone: 'error', duration: 6000 });
      details = await cart.cartDetails();
      paintSummary();
      break;
    }
    case 'product_unavailable':
      toast(t('checkout.unavailableError'), { tone: 'error', duration: 6000 });
      details = await cart.cartDetails();
      paintSummary();
      break;
    case 'invalid_zone':
      zones = await listZones();
      paintGovernorates($('#co-governorate').value);
      paintAreas();
      check.setError('zone', 'errors.zone');
      break;
    case 'outside_egypt':
      check.setError('pin', 'errors.outsideEgypt');
      break;
    case 'validation':
      if (FIELD_FOR[err.detail]) check.setError(FIELD_FOR[err.detail], `errors.${FIELD_FOR[err.detail] === 'phone' ? 'phone' : FIELD_FOR[err.detail] === 'pin' ? 'pin' : 'required'}`);
      else toast(t('common.errorGeneric'), { tone: 'error' });
      break;
    case 'delivery_disabled':
      toast(t('checkout.deliveryOff'), { tone: 'error', duration: 6000 });
      break;
    case 'empty_cart':
      window.location.href = 'cart.html';
      break;
    case 'not_authenticated':
      window.location.replace('account.html?next=checkout.html');
      break;
    case 'network':
      toast(t('errors.network'), { tone: 'error' });
      break;
    default:
      toast(t('common.errorGeneric'), { tone: 'error' });
  }
}

/* ---------- Page ---------- */
async function main() {
  session = (await sessionReady) || getSession();
  if (!session) {
    window.location.replace('account.html?next=checkout.html');
    return;
  }

  try {
    [details, zones] = await Promise.all([cart.cartDetails(), listZones()]);
  } catch (err) {
    root.removeAttribute('aria-busy');
    root.innerHTML = `<div class="empty-state checkout-empty"><p class="empty-state__title">${esc(t('common.errorGeneric'))}</p><button class="btn btn--outline" type="button" onclick="location.reload()">${esc(t('common.retry'))}</button></div>`;
    return;
  }
  root.removeAttribute('aria-busy');

  if (!details.lines.some((l) => l.available)) {
    root.innerHTML = `
      <div class="empty-state checkout-empty">
        <span class="glass-icon" aria-hidden="true">${icons.bag({ size: 28 })}</span>
        <p class="empty-state__title">${esc(t('checkout.emptyCart'))}</p>
        <a class="btn btn--solid" href="products.html">${esc(t('cart.continue'))} ${icons.arrow()}</a>
      </div>`;
    return;
  }

  root.appendChild($('#checkout-template').content.cloneNode(true));
  applyI18n(root);
  const form = $('#checkout-form');

  if (settingsSync().delivery && settingsSync().delivery.enabled === false) {
    toast(t('checkout.deliveryOff'), { tone: 'error', duration: 8000 });
  }

  // Prefill from the profile and the customer's last order (if any)
  $('#co-name').value = session.name || '';
  $('#co-email').value = session.email;
  if (session.phone) $('#co-phone').value = normalizePhone(session.phone);
  paintGovernorates();
  paintAreas();
  let previous = null;
  try {
    previous = (await listOrders({ limit: 1 }))[0] || null;
  } catch (e) {
    previous = null;
  }
  if (previous) {
    const a = previous.address;
    if (!$('#co-phone').value) $('#co-phone').value = normalizePhone(previous.customer.phone || '');
    const zone = zones.find((z) => z.id === a.zoneId);
    if (zone) {
      paintGovernorates(zone.governorate.en);
      paintAreas(zone.area ? zone.id : OTHER);
      if (!zone.area) $('#co-area').value = a.area.en || '';
    }
    $('#co-street').value = a.street || '';
    $('#co-building').value = a.building || '';
    $('#co-apartment').value = a.apartment || '';
    if (a.lat != null && a.lng != null) {
      pin = { lat: a.lat, lng: a.lng };
      lastAddress = { formatted: a.formatted || '' };
    }
  }

  /* Map */
  map = createMapPicker($('#map'), {
    pin,
    onChange: ({ lat, lng, address }) => {
      pin = { lat, lng };
      lastAddress = address;
      useAddress();
      if (check) check.validateField('pin');
      $('#pin-field').classList.remove('is-invalid');
    },
    onUnavailable: () => {
      mapAvailable = false;
      paintReadout();
      if (check) check.validateField('pin');
    },
  });
  mapAvailable = map.available;
  paintReadout();
  $('#map-readout').addEventListener('click', (e) => {
    if (e.target.closest('[data-use-address]')) useAddress({ announce: true });
  });

  $('#co-governorate').addEventListener('change', () => {
    paintAreas();
    paintSummary();
  });
  $('#co-zone').addEventListener('change', () => {
    toggleOtherArea();
    paintSummary();
    if (check) check.validateField('zone');
  });

  $('[data-signout]').addEventListener('click', async () => {
    await signOut();
    window.location.href = 'account.html?next=checkout.html';
  });

  paintSummary();

  /* Validation + submit */
  const submitBtn = $('.summary button[type="submit"]');
  const submitLabel = $('.btn__label', submitBtn);
  check = bindForm(
    form,
    {
      fullName: [rules.required, rules.fullName],
      phone: [rules.required, rules.phoneEG],
      country: [rules.select],
      governorate: [rules.select],
      zone: [rules.select],
      area: {
        rules: [(v) => ($('#co-zone').value !== OTHER || String(v || '').trim() ? true : 'errors.required')],
        get: () => $('#co-area').value,
        target: $('#area-other-field'),
        focus: () => $('#co-area').focus(),
      },
      street: [rules.required],
      building: [rules.required],
      apartment: [rules.required],
      pin: {
        // The pin is required whenever the map is available
        rules: [(v) => (v || !mapAvailable ? true : 'errors.pin')],
        get: () => pin,
        target: $('#pin-field'),
        focus: () => {
          $('#pin-field').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
          setTimeout(() => (map.getPin() ? map.focusMap() : map.focusSearch()), 400);
        },
      },
    },
    {
      translate: (key, params) => (key === 'errors.summary' ? t('checkout.errorsTitle', params) : t(key, params)),
      summary: $('.form-summary', form),
      onSubmit: async (v) => {
        const zone = selectedZone();
        if (!zone) {
          check.setError('zone', 'errors.zone');
          return;
        }
        submitBtn.classList.add('is-busy');
        submitBtn.setAttribute('aria-disabled', 'true');
        submitLabel.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(t('checkout.placing'))}`;
        // Same key for retries of this attempt → the server never creates two orders
        let key = sessionStorage.getItem(IDEM_KEY);
        if (!key) {
          key = crypto.randomUUID();
          sessionStorage.setItem(IDEM_KEY, key);
        }
        try {
          const order = await placeOrder({
            customer: { name: v.fullName.trim(), phone: `+20${normalizePhone(v.phone)}` },
            address: {
              zoneId: zone.id,
              area: zone.area ? '' : $('#co-area').value.trim(),
              street: v.street.trim(),
              building: v.building.trim(),
              apartment: v.apartment.trim(),
              instructions: $('#co-instructions').value.trim(),
              lat: pin ? pin.lat : null,
              lng: pin ? pin.lng : null,
              formatted: lastAddress ? lastAddress.formatted || '' : '',
            },
            items: details.lines.filter((l) => l.available).map((l) => ({ uuid: l.product.uuid, qty: l.qty })),
            locale,
            idempotencyKey: key,
          });
          sessionStorage.removeItem(IDEM_KEY);
          cart.clear();
          updateSession({ name: v.fullName.trim(), phone: `+20${normalizePhone(v.phone)}` });
          window.location.href = `order-confirmation.html?order=${encodeURIComponent(order.id)}`;
        } catch (err) {
          submitBtn.classList.remove('is-busy');
          submitBtn.removeAttribute('aria-disabled');
          submitLabel.textContent = t('checkout.place');
          // The order was rejected (nothing was created): a corrected attempt gets a new key
          if (err.code !== 'network') sessionStorage.removeItem(IDEM_KEY);
          await handleOrderError(err);
        }
      },
    }
  );

  // Phone: accept Arabic-Indic digits and keep a tidy 10 1234 5678 format
  $('#co-phone').addEventListener('blur', () => {
    const d = normalizePhone($('#co-phone').value);
    if (/^1[0125]\d{8}$/.test(d)) $('#co-phone').value = `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  });

  if (window.gsap && !reduceMotion) {
    window.gsap.from('.co-section, .summary', { autoAlpha: 0, y: 18, duration: 0.8, stagger: 0.07, ease: 'power3.out', clearProps: 'all' });
  }

  // Keep the summary right if the cart changes in another tab
  cart.onCartChange(async () => {
    details = await cart.cartDetails();
    paintSummary();
  });
}

main();

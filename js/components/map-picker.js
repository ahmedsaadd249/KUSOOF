/* ==========================================================================
   Map picker — Leaflet + OpenStreetMap tiles, addresses from OpenStreetMap's
   Nominatim (no API key). Same layout as before: search with results on top,
   zoom / recenter / my-location buttons, a draggable pin.

     createMapPicker(el, { pin, onChange, onUnavailable, readonly })
       → { available, ready, setPin, getPin, panTo, focusSearch, focusMap }

   onChange({ lat, lng, address }) after every click / drag / search /
   geolocation, where address = { formatted, country, governorate, area,
   areaCandidates[], street } (in the page language).
   Delivery is restricted to Egypt: the map is bounded to Egypt, search is
   limited to Egypt, and pins outside Egypt are rejected.

   Nominatim's usage policy: at most one request per second, no
   search-as-you-type (search runs on Enter), results cached. The browser
   sends the site's origin as Referer, which identifies the store.
   ========================================================================== */
import { t, locale, esc } from '../core/i18n.js';
import { toast } from '../core/ui.js';
import { icons } from './icons.js';

const CAIRO = { lat: 30.0444, lng: 31.2357 };
export const EGYPT_BOUNDS = { north: 31.8, south: 21.7, west: 24.6, east: 37.1 };
export const insideEgypt = (lat, lng) =>
  lat >= EGYPT_BOUNDS.south && lat <= EGYPT_BOUNDS.north && lng >= EGYPT_BOUNDS.west && lng <= EGYPT_BOUNDS.east;

const LEAFLET = {
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  cssIntegrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
  js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  jsIntegrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
};
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const GAP_MS = 1100; // Nominatim: max 1 request / second

let uid = 0;
let loading = null;

/** Load Leaflet (CSS + JS) once. */
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET.css;
    link.integrity = LEAFLET.cssIntegrity;
    link.crossOrigin = '';
    document.head.appendChild(link);
    const s = document.createElement('script');
    s.src = LEAFLET.js;
    s.integrity = LEAFLET.jsIntegrity;
    s.crossOrigin = '';
    s.onload = () => (window.L ? resolve(window.L) : reject(new Error('leaflet_missing')));
    s.onerror = () => {
      loading = null;
      reject(new Error('leaflet_load_failed'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/* ---------- Nominatim ---------- */
const cache = new Map();
let nextSlot = 0;

async function nominatim(path, params) {
  const url = new URL(NOMINATIM + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const key = url.toString();
  if (cache.has(key)) return cache.get(key);
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(key, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`nominatim_${res.status}`);
  const data = await res.json();
  cache.set(key, data);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return data;
}

// Address parts that can name a delivery area, most local first.
const AREA_KEYS = ['neighbourhood', 'suburb', 'quarter', 'residential', 'city_district', 'district', 'borough', 'hamlet', 'village', 'town', 'city'];

// ISO 3166-2 code → the governorate's English name as stored in shipping_zones.
// OpenStreetMap's own English names vary ("Aj Jiza", "Al Qalyubiya"), the code doesn't.
const GOVERNORATES = {
  'EG-ALX': 'Alexandria', 'EG-ASN': 'Aswan', 'EG-AST': 'Asyut', 'EG-BA': 'Red Sea', 'EG-BH': 'Beheira',
  'EG-BNS': 'Beni Suef', 'EG-C': 'Cairo', 'EG-DK': 'Dakahlia', 'EG-DT': 'Damietta', 'EG-FYM': 'Faiyum',
  'EG-GH': 'Gharbia', 'EG-GZ': 'Giza', 'EG-IS': 'Ismailia', 'EG-JS': 'South Sinai', 'EG-KB': 'Qalyubia',
  'EG-KFS': 'Kafr El Sheikh', 'EG-KN': 'Qena', 'EG-LX': 'Luxor', 'EG-MN': 'Minya', 'EG-MNF': 'Monufia',
  'EG-MT': 'Matrouh', 'EG-PTS': 'Port Said', 'EG-SHG': 'Sohag', 'EG-SHR': 'Sharqia', 'EG-SIN': 'North Sinai',
  'EG-SUZ': 'Suez', 'EG-WAD': 'New Valley',
};

/** A Nominatim result → the address shape the checkout uses. */
export function parseAddress(place = {}) {
  const a = place.address || {};
  const road = a.road || a.pedestrian || a.footway || '';
  const number = String(a.house_number || '').trim();
  const candidates = [...new Set(AREA_KEYS.map((k) => String(a[k] || '').trim()).filter(Boolean))];
  const formatted = String(place.display_name || '');
  const sep = locale === 'ar' ? '، ' : ', ';
  return {
    name: [road && number ? `${road} ${number}` : road, candidates[0]].filter(Boolean).join(sep) || formatted.split(',')[0].trim(),
    formatted,
    country: String(a.country_code || '').toUpperCase(),
    governorate: GOVERNORATES[a['ISO3166-2-lvl4']] || a.state || a.province || a.region || a.city || '',
    area: candidates[0] || '',
    areaCandidates: candidates,
    street: [number, road].filter(Boolean).join(' '),
  };
}

const reverseGeocode = async (lat, lng) => {
  const data = await nominatim('/reverse', {
    format: 'jsonv2',
    lat: lat.toFixed(6),
    lon: lng.toFixed(6),
    zoom: 18,
    addressdetails: 1,
    'accept-language': locale,
  });
  return data && !data.error ? parseAddress(data) : parseAddress({});
};

const searchPlaces = async (q) => {
  const data = await nominatim('/search', {
    format: 'jsonv2',
    q,
    countrycodes: 'eg',
    limit: 6,
    addressdetails: 1,
    'accept-language': locale,
  });
  return (Array.isArray(data) ? data : []).map((p) => ({ lat: Number(p.lat), lng: Number(p.lon), address: parseAddress(p) }));
};

function pinHTML() {
  return `<div class="map-pin"><svg width="30" height="40" viewBox="-15 -36 30 40" aria-hidden="true">
      <ellipse class="map-pin__shadow" cx="0" cy="0" rx="7" ry="2.6"/>
      <path class="map-pin__body" d="M0 0c-1.6-6-11-10.5-11-19.5a11 11 0 0 1 22 0c0 9-9.4 13.5-11 19.5z"/>
      <circle class="map-pin__dot" cx="0" cy="-19.5" r="4"/>
    </svg></div>`;
}

export function createMapPicker(root, { pin = null, onChange, onUnavailable, readonly = false } = {}) {
  const id = `map${++uid}`;
  root.classList.add('map-picker');
  let pinLL = pin && pin.lat != null && pin.lng != null ? { lat: Number(pin.lat), lng: Number(pin.lng) } : null;
  let available = true;

  function showSetup(kind) {
    available = false;
    const title = kind === 'error' ? t('map.errorTitle') : t('map.noPinTitle');
    const body = kind === 'error' ? (readonly ? t('map.errorReadonly') : t('map.errorBody')) : t('map.noPinBody');
    const frame = root.querySelector('.map-picker__frame') || root;
    const box = `<div class="map-picker__setup" role="note">
        <span class="map-picker__setup-icon" aria-hidden="true">${icons.pin({ size: 18 })}</span>
        <div><strong>${esc(title)}</strong><p>${esc(body)}</p></div>
      </div>`;
    if (frame === root) root.innerHTML = box;
    else {
      frame.classList.add('is-setup');
      frame.innerHTML = box;
    }
    const search = root.querySelector('.map-picker__search');
    if (search) search.hidden = true;
    const hint = root.querySelector('.map-picker__hint');
    if (hint) hint.hidden = true;
    if (onUnavailable) onUnavailable(kind);
  }

  root.innerHTML = `
    ${
      readonly
        ? ''
        : `<div class="map-picker__search">
            <span class="map-picker__search-icon" aria-hidden="true">${icons.search({ size: 18 })}</span>
            <input class="input map-picker__input" type="search" role="combobox" autocomplete="off" enterkeyhint="search"
              aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list"
              aria-label="${esc(t('map.searchLabel'))}" placeholder="${esc(t('map.search'))}" />
            <ul class="map-picker__list" id="${id}-list" role="listbox" hidden></ul>
          </div>`
    }
    <div class="map-picker__frame" data-lenis-prevent>
      <div class="map-picker__canvas" aria-label="${esc(t('map.region'))}"></div>
      ${
        readonly
          ? ''
          : `<div class="map-picker__controls">
              <button class="map-picker__btn" type="button" data-zoom="1" aria-label="${esc(t('map.zoomIn'))}">${icons.plus({ size: 16 })}</button>
              <button class="map-picker__btn" type="button" data-zoom="-1" aria-label="${esc(t('map.zoomOut'))}">${icons.minus({ size: 16 })}</button>
              <button class="map-picker__btn" type="button" data-recenter aria-label="${esc(t('map.recenter'))}">${icons.target({ size: 16 })}</button>
              <button class="map-picker__btn" type="button" data-locate aria-label="${esc(t('map.myLocation'))}">${icons.pin({ size: 16 })}</button>
            </div>`
      }
    </div>
    <p class="map-picker__hint" id="${id}-hint">${esc(readonly ? '' : t('checkout.locationHint'))}</p>`;

  const api = {
    get available() {
      return available;
    },
    ready: Promise.resolve(false),
    setPin() {},
    getPin: () => (pinLL ? { lat: +pinLL.lat.toFixed(6), lng: +pinLL.lng.toFixed(6) } : null),
    panTo() {},
    focusSearch: () => root.querySelector('.map-picker__input')?.focus(),
    focusMap: () => root.querySelector('.map-picker__canvas')?.focus(),
  };

  if (readonly && !pinLL) {
    showSetup('nopin');
    return api;
  }

  api.ready = (async () => {
    let L;
    try {
      L = await loadLeaflet();
    } catch (e) {
      showSetup('error');
      return false;
    }
    const canvas = root.querySelector('.map-picker__canvas');
    const bounds = L.latLngBounds([EGYPT_BOUNDS.south, EGYPT_BOUNDS.west], [EGYPT_BOUNDS.north, EGYPT_BOUNDS.east]);
    const map = L.map(canvas, {
      center: pinLL || CAIRO,
      zoom: pinLL ? 16 : 11,
      minZoom: 5,
      maxBounds: bounds.pad(0.15),
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      keyboard: !readonly,
      dragging: true,
    });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    // The box can get its final size after the map starts; keep the map in step.
    new ResizeObserver(() => map.invalidateSize()).observe(canvas);

    const marker = L.marker(pinLL || CAIRO, {
      icon: L.divIcon({ className: 'map-pin-icon', html: pinHTML(), iconSize: [30, 40], iconAnchor: [15, 40] }),
      draggable: !readonly,
      keyboard: !readonly,
      title: t('map.pin'),
      alt: t('map.pin'),
      autoPan: true,
    });
    if (pinLL) marker.addTo(map);

    function placeMarker(lat, lng) {
      pinLL = { lat, lng };
      marker.setLatLng(pinLL);
      if (!map.hasLayer(marker)) marker.addTo(map);
    }

    let commitNo = 0;
    async function commit(lat, lng, { known } = {}) {
      if (!insideEgypt(lat, lng)) {
        toast(t('errors.outsideEgypt'), { tone: 'error' });
        if (pinLL) marker.setLatLng(pinLL);
        return;
      }
      placeMarker(lat, lng);
      const no = ++commitNo;
      let address = known || null;
      if (!address) {
        try {
          address = await reverseGeocode(lat, lng);
        } catch (e) {
          address = parseAddress({});
        }
      }
      if (no !== commitNo) return; // the pin moved again meanwhile
      if (address.country && address.country !== 'EG') {
        toast(t('errors.outsideEgypt'), { tone: 'error' });
        return;
      }
      if (onChange) onChange({ lat: +lat.toFixed(6), lng: +lng.toFixed(6), address });
    }

    api.setPin = (lat, lng) => {
      placeMarker(lat, lng);
      map.panTo([lat, lng]);
    };
    api.panTo = (lat, lng, zoom) => {
      if (zoom) map.setView([lat, lng], zoom);
      else map.panTo([lat, lng]);
    };

    if (readonly) return true;

    // Don't hijack page scrolling: wheel zoom works once the customer touches the map.
    map.once('mousedown touchstart focus', () => map.scrollWheelZoom.enable());
    map.on('click', (e) => commit(e.latlng.lat, e.latlng.lng));
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      commit(p.lat, p.lng);
    });

    const controls = root.querySelector('.map-picker__controls');
    L.DomEvent.disableClickPropagation(controls);
    controls.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.zoom) map.setZoom(map.getZoom() + Number(btn.dataset.zoom));
      else if ('recenter' in btn.dataset) map.setView(pinLL || CAIRO, pinLL ? 16 : 11);
      else if ('locate' in btn.dataset) {
        if (!navigator.geolocation) return toast(t('map.locationError'), { tone: 'error' });
        btn.classList.add('is-busy');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btn.classList.remove('is-busy');
            map.setView([pos.coords.latitude, pos.coords.longitude], 17);
            commit(pos.coords.latitude, pos.coords.longitude);
          },
          () => {
            btn.classList.remove('is-busy');
            toast(t('map.locationError'), { tone: 'error' });
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      }
    });

    /* ---------- Search (on Enter: Nominatim doesn't allow search-as-you-type) ---------- */
    const input = root.querySelector('.map-picker__input');
    const list = root.querySelector('.map-picker__list');
    let results = [];
    let active = -1;
    let searchNo = 0;

    function closeList() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function paintList(message) {
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      list.innerHTML = results.length
        ? results
            .map(
              (r, i) => `
          <li class="map-picker__option${i === active ? ' is-active' : ''}" role="option" id="${id}-opt-${i}" aria-selected="${i === active}" data-i="${i}">
            <span class="map-picker__option-icon" aria-hidden="true">${icons.pin({ size: 16 })}</span>
            <span><strong>${esc(r.address.name)}</strong><small>${esc(r.address.formatted)}</small></span>
          </li>`
            )
            .join('')
        : `<li class="map-picker__empty" role="option" aria-disabled="true">${esc(message || t('map.noResults'))}</li>`;
      if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-opt-${active}`);
      else input.removeAttribute('aria-activedescendant');
    }
    async function search() {
      const q = input.value.trim();
      if (q.length < 2) return closeList();
      const no = ++searchNo;
      results = [];
      paintList(t('map.searching'));
      try {
        const found = await searchPlaces(q);
        if (no !== searchNo) return;
        results = found.filter((r) => insideEgypt(r.lat, r.lng));
        active = results.length ? 0 : -1;
        paintList();
      } catch (e) {
        if (no !== searchNo) return;
        results = [];
        paintList(t('map.searchUnavailable'));
      }
    }
    function choose(r) {
      input.value = r.address.name;
      closeList();
      map.setView([r.lat, r.lng], 17);
      commit(r.lat, r.lng, { known: r.address });
    }
    input.addEventListener('input', () => {
      searchNo++;
      results = [];
      closeList();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && results.length && !list.hidden) {
        e.preventDefault();
        active = (active + 1) % results.length;
        paintList();
      } else if (e.key === 'ArrowUp' && results.length && !list.hidden) {
        e.preventDefault();
        active = (active - 1 + results.length) % results.length;
        paintList();
      } else if (e.key === 'Enter') {
        e.preventDefault(); // never submit the checkout form from here
        if (!list.hidden && results[active]) choose(results[active]);
        else search();
      } else if (e.key === 'Escape') closeList();
    });
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-i]');
      if (opt) choose(results[Number(opt.dataset.i)]);
    });
    input.addEventListener('blur', () => setTimeout(closeList, 120));
    return true;
  })();

  return api;
}

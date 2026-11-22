/* ==========================================================================
   Map picker — Google Maps (Maps JavaScript API, Places API (New),
   Geocoding API), same layout as before: search with suggestions on top,
   zoom / recenter / my-location buttons, a draggable pin.

     createMapPicker(el, { pin, onChange, onUnavailable, readonly })
       → { available, ready, setPin, getPin, panTo, focusSearch, focusMap }

   onChange({ lat, lng, address }) after every click / drag / search /
   geolocation, where address = { formatted, country, governorate, area,
   areaCandidates[], street } (in the page language).
   Delivery is restricted to Egypt: the map is bounded to Egypt, search is
   limited to Egypt, and pins outside Egypt are rejected.
   Without GOOGLE_MAPS_API_KEY (js/env.public.js) a setup message is shown
   instead of a map — never a fake map.
   ========================================================================== */
import { t, locale, esc } from '../core/i18n.js';
import { toast } from '../core/ui.js';
import { env } from '../lib/supabase.js';
import { icons } from './icons.js';

const CAIRO = { lat: 30.0444, lng: 31.2357 };
export const EGYPT_BOUNDS = { north: 31.8, south: 21.7, west: 24.6, east: 37.1 };
export const insideEgypt = (lat, lng) =>
  lat >= EGYPT_BOUNDS.south && lat <= EGYPT_BOUNDS.north && lng >= EGYPT_BOUNDS.west && lng <= EGYPT_BOUNDS.east;

let uid = 0;
let loading = null;
let authFailed = false;
const authListeners = new Set();

/** Load the Maps JS API once (async loader + importLibrary). */
function loadGoogleMaps() {
  if (window.google && window.google.maps && window.google.maps.importLibrary) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const cb = `__kusoofMapsReady${Date.now()}`;
    window[cb] = () => {
      delete window[cb];
      resolve(window.google.maps);
    };
    // Called by Google when the key is invalid / not allowed for this site
    window.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((fn) => fn());
    };
    const params = new URLSearchParams({
      key: env.googleMapsApiKey,
      v: 'weekly',
      loading: 'async',
      language: locale,
      region: 'EG',
      callback: cb,
    });
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('maps_load_failed'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const nameOf = (c) => (c ? c.long_name || c.longText || '' : '');
const shortOf = (c) => (c ? c.short_name || c.shortText || '' : '');

/** Geocoder results and Places (New) both give address components; normalise them. */
export function parseAddress(components = [], formatted = '') {
  const get = (type) => components.find((c) => (c.types || []).includes(type));
  const candidates = [
    'neighborhood',
    'sublocality_level_1',
    'sublocality_level_2',
    'sublocality',
    'administrative_area_level_3',
    'administrative_area_level_2',
    'locality',
  ]
    .map((type) => nameOf(get(type)))
    .filter(Boolean);
  const route = nameOf(get('route'));
  const number = nameOf(get('street_number'));
  return {
    formatted,
    country: shortOf(get('country')),
    governorate: nameOf(get('administrative_area_level_1')),
    area: candidates[0] || '',
    areaCandidates: [...new Set(candidates)],
    street: [number, route].filter(Boolean).join(' '),
  };
}

function pinNode() {
  const node = document.createElement('div');
  node.className = 'map-pin';
  node.innerHTML = `<svg width="30" height="40" viewBox="-15 -36 30 40" aria-hidden="true">
      <ellipse class="map-pin__shadow" cx="0" cy="0" rx="7" ry="2.6"/>
      <path class="map-pin__body" d="M0 0c-1.6-6-11-10.5-11-19.5a11 11 0 0 1 22 0c0 9-9.4 13.5-11 19.5z"/>
      <circle class="map-pin__dot" cx="0" cy="-19.5" r="4"/>
    </svg>`;
  return node;
}

export function createMapPicker(root, { pin = null, onChange, onUnavailable, readonly = false } = {}) {
  const id = `map${++uid}`;
  root.classList.add('map-picker');
  let pinLL = pin && pin.lat != null && pin.lng != null ? { lat: Number(pin.lat), lng: Number(pin.lng) } : null;
  let available = Boolean(env.googleMapsApiKey);

  function showSetup(kind) {
    available = false;
    const title = kind === 'error' ? t('map.errorTitle') : t('map.setupTitle');
    const body = kind === 'error' ? t('map.errorBody') : readonly ? t('map.setupReadonly') : t('map.setupBody');
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
            <input class="input map-picker__input" type="text" role="combobox" autocomplete="off"
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

  if (!available) {
    console.warn('KUSOOF: GOOGLE_MAPS_API_KEY is not set — the map shows a setup message (docs/SETUP.md › Google Maps).');
    showSetup('setup');
    return api;
  }
  if (readonly && !pinLL) {
    showSetup('nopin');
    root.querySelector('.map-picker__setup strong').textContent = t('map.noPinTitle');
    root.querySelector('.map-picker__setup p').textContent = t('map.noPinBody');
    return api;
  }

  authListeners.add(() => showSetup('error'));

  api.ready = (async () => {
    let maps;
    try {
      maps = await loadGoogleMaps();
    } catch (e) {
      showSetup('error');
      return false;
    }
    if (authFailed) {
      showSetup('error');
      return false;
    }
    const [{ Map }, { AdvancedMarkerElement }, { Geocoder }] = await Promise.all([
      maps.importLibrary('maps'),
      maps.importLibrary('marker'),
      maps.importLibrary('geocoding'),
    ]);
    const canvas = root.querySelector('.map-picker__canvas');
    const map = new Map(canvas, {
      center: pinLL || CAIRO,
      zoom: pinLL ? 16 : 11,
      mapId: env.googleMapsMapId || 'DEMO_MAP_ID',
      disableDefaultUI: true,
      clickableIcons: false,
      keyboardShortcuts: !readonly,
      gestureHandling: readonly ? 'cooperative' : 'greedy',
      restriction: { latLngBounds: EGYPT_BOUNDS, strictBounds: false },
    });
    const marker = new AdvancedMarkerElement({
      map: pinLL ? map : null,
      position: pinLL,
      gmpDraggable: !readonly,
      content: pinNode(),
      title: t('map.pin'),
    });
    const geocoder = new Geocoder();
    const posOf = (p) => ({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng });

    function placeMarker(lat, lng) {
      pinLL = { lat, lng };
      marker.position = pinLL;
      marker.map = map;
    }

    async function commit(lat, lng, { known } = {}) {
      if (!insideEgypt(lat, lng)) {
        toast(t('errors.outsideEgypt'), { tone: 'error' });
        if (pinLL) marker.position = pinLL;
        return;
      }
      placeMarker(lat, lng);
      let address = known || null;
      if (!address) {
        try {
          const { results } = await geocoder.geocode({ location: { lat, lng }, language: locale, region: 'EG' });
          const best = results && results[0];
          address = best ? parseAddress(best.address_components, best.formatted_address) : parseAddress([], '');
        } catch (e) {
          address = parseAddress([], '');
        }
      }
      if (address.country && address.country !== 'EG') {
        toast(t('errors.outsideEgypt'), { tone: 'error' });
        return;
      }
      if (onChange) onChange({ lat: +lat.toFixed(6), lng: +lng.toFixed(6), address });
    }

    api.setPin = (lat, lng) => {
      placeMarker(lat, lng);
      map.panTo({ lat, lng });
    };
    api.panTo = (lat, lng, zoom) => {
      map.panTo({ lat, lng });
      if (zoom) map.setZoom(zoom);
    };

    if (readonly) return true;

    map.addListener('click', (e) => commit(e.latLng.lat(), e.latLng.lng()));
    marker.addListener('dragend', () => {
      const p = posOf(marker.position);
      commit(p.lat, p.lng);
    });

    root.querySelector('.map-picker__controls').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.zoom) map.setZoom(map.getZoom() + Number(btn.dataset.zoom));
      else if ('recenter' in btn.dataset) {
        map.panTo(pinLL || CAIRO);
        map.setZoom(pinLL ? 16 : 11);
      } else if ('locate' in btn.dataset) {
        if (!navigator.geolocation) return toast(t('map.locationError'), { tone: 'error' });
        btn.classList.add('is-busy');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btn.classList.remove('is-busy');
            map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            map.setZoom(17);
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

    /* ---------- Search: Places API (New) autocomplete in our own list ---------- */
    let placesLib = null;
    try {
      placesLib = await maps.importLibrary('places');
    } catch (e) {
      placesLib = null;
    }
    const input = root.querySelector('.map-picker__input');
    const list = root.querySelector('.map-picker__list');
    let results = [];
    let active = -1;
    let timer = 0;
    let token = placesLib ? new placesLib.AutocompleteSessionToken() : null;

    function closeList() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function paintList(message) {
      if (!input.value.trim()) return closeList();
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      list.innerHTML = results.length
        ? results
            .map((s, i) => {
              const p = s.placePrediction;
              const main = p.mainText ? p.mainText.text : p.text.text;
              const sub = p.secondaryText ? p.secondaryText.text : '';
              return `
          <li class="map-picker__option${i === active ? ' is-active' : ''}" role="option" id="${id}-opt-${i}" aria-selected="${i === active}" data-i="${i}">
            <span class="map-picker__option-icon" aria-hidden="true">${icons.pin({ size: 16 })}</span>
            <span><strong>${esc(main)}</strong><small>${esc(sub)}</small></span>
          </li>`;
            })
            .join('')
        : `<li class="map-picker__empty" role="option" aria-disabled="true">${esc(message || t('map.noResults'))}</li>`;
      if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-opt-${active}`);
      else input.removeAttribute('aria-activedescendant');
    }
    async function search(q) {
      if (!placesLib) {
        results = [];
        return paintList(t('map.searchUnavailable'));
      }
      try {
        const c = map.getCenter();
        const res = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: token,
          includedRegionCodes: ['eg'],
          language: locale,
          region: 'eg',
          locationBias: c ? { center: { lat: c.lat(), lng: c.lng() }, radius: 50000 } : undefined,
        });
        if (input.value.trim() !== q) return; // a newer query is on its way
        results = (res.suggestions || []).filter((s) => s.placePrediction).slice(0, 6);
        active = results.length ? 0 : -1;
        paintList();
      } catch (e) {
        results = [];
        paintList(t('map.searchUnavailable'));
      }
    }
    async function choose(s) {
      const p = s.placePrediction;
      input.value = p.text.text;
      closeList();
      try {
        const place = p.toPlace();
        await place.fetchFields({ fields: ['location', 'formattedAddress', 'addressComponents', 'displayName'] });
        token = new placesLib.AutocompleteSessionToken(); // a session ends with a place selection
        const loc = place.location;
        const lat = loc.lat();
        const lng = loc.lng();
        map.panTo({ lat, lng });
        map.setZoom(16);
        const address = parseAddress(place.addressComponents || [], place.formattedAddress || '');
        await commit(lat, lng, { known: address });
      } catch (e) {
        toast(t('map.searchUnavailable'), { tone: 'error' });
      }
    }
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) return closeList();
      timer = setTimeout(() => search(q), 220);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && results.length) {
        e.preventDefault();
        active = (active + 1) % results.length;
        paintList();
      } else if (e.key === 'ArrowUp' && results.length) {
        e.preventDefault();
        active = (active - 1 + results.length) % results.length;
        paintList();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[active]) choose(results[active]);
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

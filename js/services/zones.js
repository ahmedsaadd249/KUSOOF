/* ==========================================================================
   Shipping zones — delivery fees per governorate / area (Supabase).
   Visitors read active zones (RLS); the admin manages all of them.
   A zone with no area covers the whole governorate ("Other area").
   The fee charged is always read again by place_order on the server.
   ========================================================================== */
import { sb, run, ServiceError, watchTable } from './api.js';

export function mapZone(r) {
  return {
    id: r.id,
    governorate: { en: r.governorate, ar: r.governorate_ar || r.governorate },
    area: r.area ? { en: r.area, ar: r.area_ar || r.area } : null,
    fee: Number(r.delivery_fee),
    active: r.is_active,
    createdAt: r.created_at,
  };
}

export async function listZones({ includeInactive = false } = {}) {
  let q = sb().from('shipping_zones').select('*').order('governorate').order('area', { nullsFirst: true });
  if (!includeInactive) q = q.eq('is_active', true);
  return (await run(q)).map(mapZone);
}

/** Distinct governorates (English name is the key), in display order. */
export function governorates(zones) {
  const seen = new Map();
  zones.forEach((z) => {
    if (!seen.has(z.governorate.en)) seen.set(z.governorate.en, z.governorate);
  });
  return [...seen.values()];
}

/** Areas of one governorate (+ the governorate-wide zone, if any). */
export function zonesFor(zones, governorateEn) {
  const list = zones.filter((z) => z.governorate.en === governorateEn);
  return { areas: list.filter((z) => z.area), wide: list.find((z) => !z.area) || null };
}

export const minFee = (zones) => (zones.length ? Math.min(...zones.map((z) => z.fee)) : null);

/* ---------- Admin ---------- */
function toRow(input) {
  const row = {};
  if (input.governorate) {
    row.governorate = String(input.governorate.en || '').trim();
    row.governorate_ar = String(input.governorate.ar || '').trim();
  }
  if ('area' in input) {
    const en = input.area ? String(input.area.en || '').trim() : '';
    row.area = en || null;
    row.area_ar = en ? String(input.area.ar || '').trim() : null;
  }
  if ('fee' in input) row.delivery_fee = Math.max(0, Math.round(Number(input.fee) * 100) / 100 || 0);
  if ('active' in input) row.is_active = Boolean(input.active);
  return row;
}

export async function createZone(input) {
  const row = toRow(input);
  if (!row.governorate) throw new ServiceError('validation', { field: 'governorate' });
  return mapZone(await run(sb().from('shipping_zones').insert(row).select('*').single()));
}

export async function updateZone(id, input) {
  return mapZone(await run(sb().from('shipping_zones').update(toRow(input)).eq('id', id).select('*').single()));
}

export async function deleteZone(id) {
  await run(sb().from('shipping_zones').delete().eq('id', id));
}

export const watchZones = (fn) => watchTable('shipping_zones', fn);

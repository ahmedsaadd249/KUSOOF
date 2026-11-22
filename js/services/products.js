/* ==========================================================================
   Products service — Supabase tables products + product_images, images in
   the Storage bucket "product-images".
   Storefront: RLS returns only available products to visitors.
   Admin: full CRUD (RLS: is_admin()). The original product photos ship with
   the site (static_path); new uploads go to Storage (storage_path).
   Pages get the same product shape as before, keyed by slug:
     { id: slug, uuid, name:{en,ar}, category:{en,ar}, price, stock,
       available, images:[{ id, src, light, w, h, label, alt }], … }
   ========================================================================== */
import { IMAGE_TYPES, IMAGE_MAX_BYTES, LOW_STOCK_DEFAULT } from '../config.js';
import { sb, run, ServiceError, watchTable } from './api.js';
import { settingsSync } from './settings.js';

const BUCKET = 'product-images';
const SELECT = '*, product_images(*)';

export const CATEGORIES = {
  sunglasses: { en: 'Sunglasses', ar: 'نظارات شمسية' },
  eyeglasses: { en: 'Eyeglasses', ar: 'نظارات طبية' },
};

const threshold = () => {
  const n = Number(settingsSync().lowStockThreshold);
  return Number.isFinite(n) ? n : LOW_STOCK_DEFAULT;
};

/** 'in' | 'low' | 'out' — the product's own threshold, else the store default. */
export function stockState(product, limit) {
  const stock = Number(product.stock) || 0;
  const lim = limit ?? (product.lowStockThreshold ?? threshold());
  if (stock <= 0) return 'out';
  if (stock <= lim) return 'low';
  return 'in';
}

/** Public URL of an image stored in the bucket. */
export function storageUrl(path) {
  return sb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Order-item image snapshots: "sb:<path>" = Storage, otherwise a site path. */
export function snapshotImageUrl(value) {
  if (!value) return '';
  return value.startsWith('sb:') ? storageUrl(value.slice(3)) : value;
}

const paras = (text) =>
  String(text || '')
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

function mapImage(img, productName) {
  const src = img.storage_path ? storageUrl(img.storage_path) : img.static_path;
  return {
    id: img.id,
    storagePath: img.storage_path || null,
    src,
    light: img.storage_path ? src : img.mobile_path || img.static_path,
    w: img.width || 1600,
    h: img.height || 1200,
    label: { en: img.label_en || 'Product view', ar: img.label_ar || 'صورة المنتج' },
    alt: { en: img.alt_en || productName.en, ar: img.alt_ar || productName.ar },
  };
}

export function mapProduct(row) {
  const content = row.content || {};
  const name = { en: row.name, ar: row.name_ar || row.name };
  const description = { en: paras(row.description), ar: paras(row.description_ar) };
  return {
    id: row.slug,
    uuid: row.id,
    slug: row.slug,
    index: content.index || String(row.sort_order || 0).padStart(2, '0'),
    price: Number(row.price),
    stock: row.stock_quantity,
    lowStockThreshold: row.low_stock_threshold,
    available: row.is_available,
    name,
    categoryKey: row.category,
    category: CATEGORIES[row.category] || CATEGORIES.eyeglasses,
    short: {
      en: row.short_description || description.en[0] || '',
      ar: row.short_description_ar || description.ar[0] || '',
    },
    description,
    images: (row.product_images || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)))
      .map((img) => mapImage(img, name)),
    specs: Array.isArray(content.specs) ? content.specs : [],
    details: content.details && content.details.en ? content.details : { en: [], ar: [] },
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProducts({ includeUnavailable = false } = {}) {
  const rows = await run(sb().from('products').select(SELECT).order('sort_order').order('created_at'));
  const list = (rows || []).map(mapProduct);
  return includeUnavailable ? list : list.filter((p) => p.available);
}

/** By slug (or uuid). Returns null when missing or hidden. */
export async function getProduct(id, { includeUnavailable = false } = {}) {
  if (!id) return null;
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const row = await run(sb().from('products').select(SELECT).eq(isUuid ? 'id' : 'slug', id).maybeSingle());
  if (!row) return null;
  const p = mapProduct(row);
  return !includeUnavailable && !p.available ? null : p;
}

/* ---------- Admin ---------- */

export function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'product'
  );
}

function toRow(input) {
  const row = {};
  if (input.name) {
    row.name = String(input.name.en || '').trim();
    row.name_ar = String(input.name.ar || '').trim();
  }
  if (input.categoryKey) row.category = CATEGORIES[input.categoryKey] ? input.categoryKey : 'eyeglasses';
  if (input.description) {
    const en = paras(input.description.en);
    const ar = paras(input.description.ar);
    row.description = en.join('\n\n');
    row.description_ar = ar.join('\n\n');
    row.short_description = en[0] || '';
    row.short_description_ar = ar[0] || '';
  }
  if ('price' in input) row.price = Math.max(0, Math.round(Number(input.price) * 100) / 100 || 0);
  if ('stock' in input) row.stock_quantity = Math.max(0, Math.round(Number(input.stock) || 0));
  if ('available' in input) row.is_available = Boolean(input.available);
  if ('lowStockThreshold' in input) {
    const v = input.lowStockThreshold;
    row.low_stock_threshold = v === '' || v == null ? null : Math.max(0, Math.round(Number(v) || 0));
  }
  return row;
}

/** Check a file before upload (the bucket enforces the same rules server-side). */
export function validateImageFile(file) {
  if (!file || !IMAGE_TYPES.includes(file.type)) throw new ServiceError('imageType');
  if (file.size > IMAGE_MAX_BYTES) throw new ServiceError('imageSize');
}

/**
 * Upload images (File/Blob) for a product and create their rows.
 * images: [{ blob, width, height }]
 */
export async function addProductImages(productUuid, images, { name } = {}) {
  const existing = await run(sb().from('product_images').select('sort_order').eq('product_id', productUuid));
  let order = Math.max(-1, ...(existing || []).map((r) => r.sort_order)) + 1;
  for (const img of images) {
    validateImageFile(img.blob);
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[img.blob.type];
    const path = `${productUuid}/${crypto.randomUUID()}.${ext}`;
    await run(sb().storage.from(BUCKET).upload(path, img.blob, { contentType: img.blob.type, cacheControl: '31536000', upsert: false }), 'upload');
    try {
      await run(
        sb().from('product_images').insert({
          product_id: productUuid,
          storage_path: path,
          width: img.width || null,
          height: img.height || null,
          label_en: 'Product view',
          label_ar: 'صورة المنتج',
          alt_en: name ? name.en : '',
          alt_ar: name ? name.ar : '',
          sort_order: order++,
        })
      );
    } catch (e) {
      await sb().storage.from(BUCKET).remove([path]); // don't leave an orphaned file
      throw e;
    }
  }
}

export async function deleteProductImage(image) {
  if (image.storagePath) await run(sb().storage.from(BUCKET).remove([image.storagePath]), 'upload');
  await run(sb().from('product_images').delete().eq('id', image.id));
}

export async function createProduct(input) {
  const row = toRow(input);
  if (!row.name) throw new ServiceError('validation', { field: 'name' });
  let slug = slugify(row.name);
  const taken = await run(sb().from('products').select('slug').like('slug', `${slug}%`));
  const used = new Set((taken || []).map((r) => r.slug));
  for (let i = 2; used.has(slug); i++) slug = `${slugify(row.name)}-${i}`;
  const last = await run(sb().from('products').select('sort_order').order('sort_order', { ascending: false }).limit(1));
  const sortOrder = ((last && last[0] && last[0].sort_order) || 0) + 1;
  const created = await run(
    sb()
      .from('products')
      .insert({ ...row, slug, sort_order: sortOrder, content: { index: String(sortOrder).padStart(2, '0') } })
      .select('id')
      .single()
  );
  if (input.images && input.images.length) await addProductImages(created.id, input.images, { name: input.name });
  return getProduct(created.id, { includeUnavailable: true });
}

export async function updateProduct(id, input) {
  const current = await getProduct(id, { includeUnavailable: true });
  if (!current) throw new ServiceError('not_found');
  const row = toRow(input);
  if (Object.keys(row).length) await run(sb().from('products').update(row).eq('id', current.uuid));
  if (input.images && input.images.length) await addProductImages(current.uuid, input.images, { name: input.name || current.name });
  return getProduct(current.uuid, { includeUnavailable: true });
}

export async function deleteProduct(id) {
  const current = await getProduct(id, { includeUnavailable: true });
  if (!current) return false;
  const paths = current.images.filter((i) => i.storagePath).map((i) => i.storagePath);
  await run(sb().from('products').delete().eq('id', current.uuid));
  if (paths.length) await sb().storage.from(BUCKET).remove(paths);
  return true;
}

export const watchProducts = (fn) => watchTable('products', fn);

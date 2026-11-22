/* Admin › Products — grid, filters, stock overview, add / edit / delete. */
import { esc, el, reduceMotion } from '../../core/dom.js';
import { bindForm, rules } from '../../core/validate.js';
import { openPanel, confirmDialog, toast } from '../../core/ui.js';
import { listProducts, stockState, createProduct, updateProduct, deleteProduct, deleteProductImage, validateImageFile } from '../../services/products.js';
import { IMAGE_MAX_BYTES } from '../../config.js';
import { settingsSync } from '../../services/settings.js';
import { ai } from '../icons.js';
import { CATEGORIES, money, asset, toneBadge, pct } from '../labels.js';

const STATE_LABEL = { in: 'In stock', low: 'Low stock', out: 'Out of stock' };
const STATE_TONE = { in: 'ok', low: 'warn', out: 'err' };
const MSG = {
  'errors.required': 'This field is required.',
  'errors.price': 'Enter a price of 0 or more.',
  'errors.stock': 'Enter a whole number of 0 or more.',
  'errors.summary': 'Please fix the highlighted fields.',
};
const translate = (k) => MSG[k] || k;

/** Check the file, then resize it (max 1600px) to a WebP (or JPEG) Blob for upload. */
async function readImage(file) {
  validateImageFile(file); // type (JPG/PNG/WebP/AVIF) and size (≤ 5 MB) — the bucket enforces the same
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const max = 1600;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FEFEFE';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    return { blob, width: canvas.width, height: canvas.height, preview: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function categoryKey(p) {
  return (p && p.categoryKey) || 'eyeglasses';
}

function productForm(p, onSaved) {
  const isNew = !p;
  const form = el(`
    <form class="form-stack" novalidate>
      <p class="form-summary" role="alert" hidden></p>
      <div class="field">
        <span class="field__label">Product images</span>
        <div class="img-manager" data-images></div>
        <div class="dropzone" data-dropzone>
          <div class="dropzone__preview" aria-hidden="true">${ai.image()}</div>
          <div>
            <p><strong>Drop images</strong> or choose files. JPG, PNG, WebP or AVIF, up to ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)} MB each. They’re resized to 1600px and uploaded to Supabase Storage when you save. The first image is the main one.</p>
            <div class="dropzone__actions">
              <label class="btn btn--outline btn--sm" for="pf-image">${ai.upload({ size: 15 })} Choose images</label>
            </div>
            <input id="pf-image" type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple />
          </div>
        </div>
      </div>
      <div class="lang-fields">
        <div class="field"><label class="field__label" for="pf-name-en">Name (English)</label><input class="input" id="pf-name-en" name="nameEn" value="${esc(p ? p.name.en : '')}" aria-describedby="nameEn-error" /><p class="field__error" id="nameEn-error" hidden></p></div>
        <div class="field"><label class="field__label" for="pf-name-ar">Name (Arabic)</label><input class="input" id="pf-name-ar" name="nameAr" dir="rtl" lang="ar" value="${esc(p ? p.name.ar : '')}" aria-describedby="nameAr-error" /><p class="field__error" id="nameAr-error" hidden></p></div>
      </div>
      <div class="form-grid">
        <div class="field"><label class="field__label" for="pf-category">Category</label>
          <select class="select" id="pf-category" name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}"${categoryKey(p) === k ? ' selected' : ''}>${esc(v.en)} · ${esc(v.ar)}</option>`).join('')}</select>
        </div>
        <div class="field"><label class="field__label" for="pf-price">Price (EGP)</label><input class="input" id="pf-price" name="price" type="number" min="0" step="1" inputmode="numeric" value="${p ? p.price : ''}" aria-describedby="price-error" /><p class="field__error" id="price-error" hidden></p></div>
        <div class="field"><label class="field__label" for="pf-stock">Available stock (units)</label><input class="input" id="pf-stock" name="stock" type="number" min="0" step="1" inputmode="numeric" value="${p ? p.stock : ''}" aria-describedby="stock-error" /><p class="field__error" id="stock-error" hidden></p></div>
        <div class="field"><span class="field__label">Availability</span>
          <label class="switch" style="min-height:44px"><input type="checkbox" name="available" ${!p || p.available ? 'checked' : ''} /><span class="switch__track"></span><span class="switch__text">Visible in the store</span></label>
        </div>
      </div>
      <div class="lang-fields">
        <div class="field"><label class="field__label" for="pf-desc-en">Description (English)</label><textarea class="textarea" id="pf-desc-en" name="descEn" rows="5">${esc(p ? p.description.en.join('\n\n') : '')}</textarea></div>
        <div class="field"><label class="field__label" for="pf-desc-ar">Description (Arabic)</label><textarea class="textarea" id="pf-desc-ar" name="descAr" rows="5" dir="rtl" lang="ar">${esc(p ? p.description.ar.join('\n\n') : '')}</textarea></div>
      </div>
      <p class="a-card__sub">Separate paragraphs with a blank line. The first paragraph is used as the short description on product cards.</p>
    </form>`);

  const footer = el(`<div style="display:flex;gap:10px;justify-content:flex-end;width:100%"><button class="btn btn--outline btn--sm" type="button" data-cancel>Cancel</button><button class="btn btn--solid btn--sm" type="submit">${isNew ? 'Add product' : 'Save changes'}</button></div>`);
  const panel = openPanel({ title: isNew ? 'Add product' : 'Edit product', subtitle: isNew ? 'New products appear in the store when visible and in stock.' : p.name.en, body: form, footer, width: 640 });
  footer.querySelector('[data-cancel]').addEventListener('click', panel.close);
  const saveBtn = footer.querySelector('[type="submit"]');
  saveBtn.addEventListener('click', () => form.requestSubmit());

  /* Images: existing ones (delete) + new ones (uploaded on save) */
  const existing = p ? p.images.slice() : [];
  const queued = []; // { blob, width, height, preview }
  const imagesEl = form.querySelector('[data-images]');
  const input = form.querySelector('#pf-image');
  const zone = form.querySelector('[data-dropzone]');
  function paintImages() {
    const tiles = [
      ...existing.map((img, i) => `<figure class="img-tile">${i === 0 ? '<span class="img-tile__main">Main</span>' : ''}<img src="${esc(asset(img.light || img.src))}" alt="" /><button type="button" class="img-tile__remove" data-remove-existing="${esc(img.id)}" aria-label="Delete image ${i + 1}">${ai.trash()}</button></figure>`),
      ...queued.map((q, i) => `<figure class="img-tile is-new">${existing.length + i === 0 ? '<span class="img-tile__main">Main</span>' : '<span class="img-tile__main">New</span>'}<img src="${esc(q.preview)}" alt="" /><button type="button" class="img-tile__remove" data-remove-queued="${i}" aria-label="Remove new image ${i + 1}">${ai.trash()}</button></figure>`),
    ];
    imagesEl.innerHTML = tiles.length ? tiles.join('') : '<p class="muted" style="font-size:13px">No images yet.</p>';
  }
  paintImages();
  async function take(files) {
    for (const file of files) {
      try {
        queued.push(await readImage(file));
      } catch (err) {
        toast(err.code === 'imageSize' ? `“${file.name}” is larger than ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)} MB.` : `“${file.name}” isn’t a JPG, PNG, WebP or AVIF image.`, { tone: 'error' });
      }
    }
    input.value = '';
    paintImages();
  }
  input.addEventListener('change', () => input.files.length && take([...input.files]));
  ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('is-over')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) take([...e.dataTransfer.files]);
  });
  imagesEl.addEventListener('click', async (e) => {
    const q = e.target.closest('[data-remove-queued]');
    const x = e.target.closest('[data-remove-existing]');
    if (q) {
      const [removed] = queued.splice(Number(q.dataset.removeQueued), 1);
      URL.revokeObjectURL(removed.preview);
      paintImages();
    } else if (x) {
      const img = existing.find((i) => i.id === x.dataset.removeExisting);
      const ok = await confirmDialog({ title: 'Delete this image?', message: img.storagePath ? 'It is removed from the product and from storage. This can’t be undone.' : 'It is removed from the product (the original photo file stays with the website).', confirmLabel: 'Delete', tone: 'danger' });
      if (!ok) return;
      try {
        await deleteProductImage(img);
        existing.splice(existing.indexOf(img), 1);
        paintImages();
        toast('Image deleted');
        onSaved();
      } catch (err) {
        toast('Could not delete the image.', { tone: 'error' });
      }
    }
  });

  bindForm(
    form,
    {
      nameEn: [rules.required],
      nameAr: [rules.required],
      price: [rules.required, (v) => (Number(v) >= 0 ? true : 'errors.price')],
      stock: [rules.required, (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? true : 'errors.stock')],
    },
    {
      translate,
      summary: form.querySelector('.form-summary'),
      onSubmit: async (v) => {
        saveBtn.classList.add('is-busy');
        saveBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving';
        const payload = {
          name: { en: v.nameEn.trim(), ar: v.nameAr.trim() },
          categoryKey: form.elements.category.value,
          price: Number(v.price),
          stock: Number(v.stock),
          available: form.elements.available.checked,
          description: { en: form.elements.descEn.value, ar: form.elements.descAr.value },
          images: queued.map((q) => ({ blob: q.blob, width: q.width, height: q.height })),
        };
        try {
          const saved = isNew ? await createProduct(payload) : await updateProduct(p.id, payload);
          panel.close();
          toast(isNew ? `Added “${saved.name.en}”` : `Saved “${saved.name.en}”`);
          onSaved();
        } catch (err) {
          saveBtn.classList.remove('is-busy');
          saveBtn.textContent = isNew ? 'Add product' : 'Save changes';
          toast(err.code === 'upload' ? 'The product was saved but an image failed to upload. Try adding it again.' : err.code === 'imageType' || err.code === 'imageSize' ? 'One of the images isn’t allowed (type or size).' : 'Could not save the product.', { tone: 'error' });
          if (err.code === 'upload') onSaved();
        }
      },
    }
  );
}

export default {
  id: 'products',
  title: 'Products',
  subtitle: 'Manage the collection, prices, stock and availability.',
  async render(view, { query, navigate, refresh }) {
    const products = await listProducts({ includeUnavailable: true });
    const threshold = settingsSync().lowStockThreshold;
    const filter = query.get('filter') || 'all';
    const counts = { all: products.length, in: 0, low: 0, out: 0 };
    products.forEach((p) => counts[stockState(p)]++);
    const totalUnits = products.reduce((s, p) => s + (Number(p.stock) || 0), 0);
    const maxStock = Math.max(20, ...products.map((p) => p.stock));

    view.innerHTML = `
      <div class="toolbar">
        <div class="pills" role="group" aria-label="Filter by stock">
          ${['all', 'in', 'low', 'out'].map((k) => `<button type="button" data-filter="${k}" aria-pressed="${filter === k}">${k === 'all' ? 'All' : STATE_LABEL[k]} <span>${counts[k]}</span></button>`).join('')}
        </div>
        <div class="toolbar__actions">
          <label class="search"><span class="visually-hidden">Search products</span>${ai.search()}<input type="search" placeholder="Search products" data-search value="${esc(query.get('q') || '')}" /></label>
          <button class="btn btn--solid btn--sm" type="button" data-add>${ai.plus({ size: 14 })} Add product</button>
        </div>
      </div>
      <div class="p-layout">
        <div class="p-grid" data-grid></div>
        <aside class="a-card side-panel" aria-labelledby="so-title">
          <div class="a-card__head"><div><h2 class="a-card__title" id="so-title">Stock overview</h2><p class="a-card__sub">Low stock at ≤ ${threshold} units (Settings)</p></div></div>
          ${products
            .map((p) => {
              const st = stockState(p);
              return `<div class="stock-row"><div class="stock-row__top"><span>${esc(p.name.en)}</span><b>${p.stock}</b></div><div class="meter" data-state="${st}"><span style="width:${Math.max(p.stock ? 4 : 0, pct(p.stock, maxStock))}%"></span></div>${toneBadge(STATE_LABEL[st], STATE_TONE[st])}</div>`;
            })
            .join('')}
          <div class="side-total"><strong>${totalUnits}</strong> units across ${products.length} ${products.length === 1 ? 'product' : 'products'}</div>
        </aside>
      </div>`;

    const grid = view.querySelector('[data-grid]');
    const search = view.querySelector('[data-search]');

    function paint() {
      const q = search.value.trim().toLowerCase();
      const list = products.filter((p) => (filter === 'all' || stockState(p) === filter) && (!q || p.name.en.toLowerCase().includes(q) || p.name.ar.includes(q)));
      grid.innerHTML =
        list
          .map((p) => {
            const st = stockState(p);
            const img = p.images[0];
            return `
          <article class="p-card" data-id="${esc(p.id)}">
            <div class="p-card__media">
              ${img ? `<img src="${esc(asset(img.light || img.src))}" alt="" loading="lazy" />` : `<span style="display:grid;place-items:center;height:100%;color:var(--ink-35)">${ai.image()}</span>`}
              ${toneBadge(STATE_LABEL[st], STATE_TONE[st])}
            </div>
            <div class="p-card__body">
              <h3 class="p-card__name">${esc(p.name.en)}</h3>
              <p class="p-card__ar" lang="ar">${esc(p.name.ar)}</p>
              <div class="p-card__meta"><b>${esc(money(p.price))}</b><span class="muted">${p.stock} in stock</span></div>
              <div class="p-card__foot">
                <label class="switch switch--sm"><input type="checkbox" data-available ${p.available ? 'checked' : ''} aria-label="Visible in the store: ${esc(p.name.en)}" /><span class="switch__track"></span><span class="switch__text">${p.available ? 'Visible' : 'Hidden'}</span></label>
                <div class="p-card__actions">
                  <a class="icon-btn icon-btn--sm" href="../product.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" aria-label="View ${esc(p.name.en)} in the store">${ai.eye()}</a>
                  <button class="icon-btn icon-btn--sm" type="button" data-edit aria-label="Edit ${esc(p.name.en)}">${ai.edit()}</button>
                  <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete aria-label="Delete ${esc(p.name.en)}">${ai.trash()}</button>
                </div>
              </div>
            </div>
          </article>`;
          })
          .join('') +
        (filter === 'all' && !q ? `<button class="p-add" type="button" data-add><span>${ai.plus({ size: 22 })}Add product</span></button>` : '') +
        (!list.length && (filter !== 'all' || q) ? '<p class="a-card__sub">No products match this filter.</p>' : '');
      if (window.gsap && !reduceMotion) window.gsap.from(grid.children, { autoAlpha: 0, y: 14, duration: 0.5, stagger: 0.05, ease: 'power2.out', clearProps: 'all' });
    }
    paint();

    view.querySelectorAll('[data-filter]').forEach((b) =>
      b.addEventListener('click', () => navigate(`#/products${b.dataset.filter === 'all' ? '' : `?filter=${b.dataset.filter}`}`))
    );
    search.addEventListener('input', paint);

    view.addEventListener('click', async (e) => {
      if (e.target.closest('[data-add]')) return productForm(null, refresh);
      const card = e.target.closest('.p-card');
      if (!card) return;
      const p = products.find((x) => x.id === card.dataset.id);
      if (e.target.closest('[data-edit]')) productForm(p, refresh);
      if (e.target.closest('[data-delete]')) {
        const ok = await confirmDialog({ title: `Delete “${p.name.en}”?`, message: 'It disappears from the store and from this list, and its uploaded images are deleted. Past orders keep their copy of the name and price. This can’t be undone.', confirmLabel: 'Delete', tone: 'danger' });
        if (!ok) return;
        await deleteProduct(p.id);
        toast(`Deleted “${p.name.en}”`);
        refresh();
      }
    });
    view.addEventListener('change', async (e) => {
      const toggle = e.target.closest('[data-available]');
      if (!toggle) return;
      const card = toggle.closest('.p-card');
      const p = products.find((x) => x.id === card.dataset.id);
      await updateProduct(p.id, { available: toggle.checked });
      toast(`${p.name.en} is now ${toggle.checked ? 'visible in' : 'hidden from'} the store`);
      refresh();
    });

    // Deep links (#/products?new=1, ?edit=id) open the form once, then leave the URL clean
    const editId = query.get('edit');
    if (query.get('new') || editId) {
      history.replaceState(null, '', `#/products${filter === 'all' ? '' : `?filter=${filter}`}`);
      if (query.get('new')) productForm(null, refresh);
      const p = editId && products.find((x) => x.id === editId);
      if (p) productForm(p, refresh);
    }
  },
};

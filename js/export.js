// SVG / PNG / ZIP export and the download buttons
function svgString(sized = false, src = out) {
  const clone = src.cloneNode(true);
  clone.setAttribute('xmlns', SVG_NS);
  // Exported files can't see the page's fonts, so embed OCR-B when it's used
  if (OCRB_FACE && clone.querySelector('text') && $('font').value === 'OCR-B') {
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = OCRB_FACE;
    clone.prepend(style);
  }
  return new XMLSerializer().serializeToString(sized ? fitSvg(clone) : clone);
}

// Target image size in mm (either side may be blank = auto)
// Size units: mm, or px = CSS px (1/96 inch, same unit as the display options)
const MM_PER_PX = 25.4 / 96;
const isPx = () => $('sizeUnit').value === 'px';
const pxToUnit = px => isPx() ? px : px * MM_PER_PX;
const mmToUnit = mm => isPx() ? mm / MM_PER_PX : mm;
const fmtSize = v => isPx() ? String(Math.round(v)) : v.toFixed(1);

function targetMm() {
  const k = isPx() ? MM_PER_PX : 1;
  return { w: (+$('imgW').value || 0) * k, h: (+$('imgH').value || 0) * k };
}

// Wrap the barcode in an outer SVG of the requested mm size, scaled to fit and centered
function fitSvg(inner) {
  const t = targetMm();
  if (!t.w && !t.h) return inner;
  const [, , vw, vh] = inner.getAttribute('viewBox').split(/\s+/).map(Number);
  const W = t.w || t.h * vw / vh, H = t.h || t.w * vh / vw;
  const s = Math.min(W / vw, H / vh);
  const outer = newSvg();
  outer.setAttribute('xmlns', SVG_NS);
  outer.setAttribute('width', W + 'mm');
  outer.setAttribute('height', H + 'mm');
  outer.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const bg = opts().background;
  if (bg !== 'transparent') outer.innerHTML = `<rect width="100%" height="100%" fill="${bg}"/>`;
  inner.setAttribute('x', (W - vw * s) / 2);
  inner.setAttribute('y', (H - vh * s) / 2);
  inner.setAttribute('width', vw * s);
  inner.setAttribute('height', vh * s);
  outer.appendChild(inner);
  return outer;
}

// PNG at the chosen DPI. One CSS px = 1/96 inch; the narrowest bar (or QR cell)
// is rounded to whole printer dots so every bar prints at the same width.
function moduleSize() {
  return opts().format === 'QR' ? (+$('cellSize').value || 8) : (+$('barWidth').value || 2);
}

async function renderCanvas(k, value, svgEl) {
  const o = opts();
  if (o.format === 'QR') return svgToCanvas(k, svgEl);
  // 1D: redraw at printer resolution instead of stretching the SVG
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, barcodeOpts(o, k));
  return canvas;
}

// PNG of one item (default: the one shown). svgEl must already hold that item.
async function toPngBlob(value = lines()[cur], svgEl = out) {
  const dpi = +$('dpi').value || 300, mod = moduleSize();
  let dots = Math.max(1, Math.round(mod * dpi / 96)); // printer dots per bar/cell
  const renderAt = k => renderCanvas(k, value, svgEl);
  let canvas = await renderAt(dots / mod);

  const t = targetMm();
  if (t.w || t.h) {
    // Largest whole-dot bar width that fits the requested size. Allow 5% over, since
    // rounding bars down to whole dots can otherwise shrink them well below target
    // (e.g. GS1 0.33 mm at 300 DPI = 3.9 dots: 4 dots is +3%, 3 dots is −23%).
    const tw = Math.round(t.w / 25.4 * dpi), th = Math.round(t.h / 25.4 * dpi);
    const fits = c => (!tw || c.width <= tw * 1.05) && (!th || c.height <= th * 1.05);
    // The size grows almost linearly with the dots per bar: jump straight to the
    // estimate, then the steps below only fine-tune by a dot or two
    const est = Math.max(1, Math.min(200, Math.floor(Math.min(
      tw ? tw * 1.05 / (canvas.width / dots) : Infinity,
      th ? th * 1.05 / (canvas.height / dots) : Infinity))));
    if (est !== dots) canvas = await renderAt((dots = est) / mod);
    if (fits(canvas)) {
      for (let next; dots < 200 && fits(next = await renderAt((dots + 1) / mod)); dots++) canvas = next;
    } else {
      while (!fits(canvas)) {
        if (dots === 1) throw new Error('圖片尺寸太小，條碼放不下');
        canvas = await renderAt(--dots / mod);
      }
    }
    canvas = padCanvas(canvas, Math.max(tw, canvas.width), Math.max(th, canvas.height));
  }

  const blob = await new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('PNG 轉換失敗')), 'image/png'));
  return withDpi(blob, dpi);
}

// Center the barcode on a canvas of the exact target size
function padCanvas(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const bg = opts().background;
  if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(src, Math.floor((w - src.width) / 2), Math.floor((h - src.height) / 2));
  return c;
}

function svgToCanvas(scale, svgEl = out) {
  return new Promise((resolve, reject) => {
    // JsBarcode writes width/height as "123px", so parse rather than coerce
    const w = parseFloat(svgEl.getAttribute('width')), h = parseFloat(svgEl.getAttribute('height'));
    if (!w || !h) return reject(new Error('條碼尺寸無效'));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => reject(new Error('圖片載入失敗'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString(false, svgEl));
  });
}

// Insert a pHYs chunk after IHDR so other apps know the print size
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
async function withDpi(blob, dpi) {
  const png = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 8 + 25; // after PNG signature + IHDR chunk
  return new Blob([png.subarray(0, at), chunk, png.subarray(at)], { type: 'image/png' });
}

// File name from the barcode content: keep letters/digits of any language (e.g.
// Chinese), replace the rest with _
const fileBase = v => (v || '').replace(/[^\p{L}\p{N}.-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'barcode';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// With 2+ items the main buttons download everything as one ZIP;
// the download icon above the preview saves just the shown item
async function downloadAs(ext, one = false) {
  if (!one && lines().length > 1) return downloadZip(ext);
  const blob = ext === 'svg' ? new Blob([svgString(true)], { type: 'image/svg+xml' }) : await toPngBlob();
  const name = fileBase(lines()[cur]) + '.' + ext;
  download(blob, name);
  flash(one ? dlOneBtn : $(ext === 'svg' ? 'dlSvg' : 'dlPng'), '已下載', true, `已下載 ${name}`);
}

// Mascot beside the progress bar: scanning while packing, holding the label when done
const showZipPom = done => { $('zipPomLoading').hidden = done; $('zipPomDone').hidden = !done; };
let zipDoneTimer;
async function downloadZip(ext, list = lines(), btn = $(ext === 'svg' ? 'dlSvg' : 'dlPng')) {
  const o = opts(), zip = new JSZip(), used = new Map();
  let ok = false;
  busy = true;
  syncButtons();
  clearTimeout(zipDoneTimer);
  showZipPom(false);
  const progress = (done, label) => {
    $('zipProgress').hidden = false;
    $('zipLabel').textContent = label;
    $('zipCount').textContent = `${done} / ${list.length}`;
    $('zipBar').style.width = `${Math.round(done / list.length * 100)}%`;
  };
  // One file: SVG text, or PNG. 1D PNGs are drawn straight onto a canvas, so they only
  // need the (cached) validity check, not an SVG.
  const file = async v => {
    if (ext === 'png' && o.format !== 'QR') {
      const r = checkItem(v, o);
      if (r.error) throw new Error(r.error);
      return toPngBlob(v, null);
    }
    const svg = newSvg();
    draw(svg, v, o);
    return ext === 'svg' ? svgString(true, svg) : toPngBlob(v, svg);
  };
  try {
    const BATCH = 6; // PNGs encode in parallel, a few at a time
    for (let i = 0; i < list.length; i += BATCH) {
      progress(i, `打包 ${ext.toUpperCase()} 中`);
      const part = list.slice(i, i + BATCH);
      const data = await Promise.all(part.map(file));
      part.forEach((v, j) => {
        // Unique names: repeated content gets _2, _3, …
        const base = fileBase(v), n = (used.get(base) || 0) + 1;
        used.set(base, n);
        zip.file((n > 1 ? `${base}_${n}` : base) + '.' + ext, data[j]);
      });
      await new Promise(r => setTimeout(r)); // keep the page responsive
    }
    progress(list.length, '壓縮中…');
    download(await zip.generateAsync({ type: 'blob' }), `barcodes-${list.length}.zip`);
    ok = true;
  } finally {
    if (!ok) $('zipProgress').hidden = true;
    busy = false;
    syncButtons();
  }
  if (!ok) return;
  flash(btn, '已下載', true, `已下載 ${list.length} 筆 ${ext.toUpperCase()}（ZIP）`);
  // The mascot holds up the finished label for a moment, then the bar goes away
  showZipPom(true);
  $('zipLabel').textContent = '完成';
  clearTimeout(zipDoneTimer);
  zipDoneTimer = setTimeout(() => { $('zipProgress').hidden = true; showZipPom(false); }, 2200);
}

const fail = btn => e => flash(btn, '失敗', false, e.message || String(e));
// Main buttons, the single-item menu and the whole-set selection, for SVG and PNG
const dlOneBtn = $('dlOneWrap').querySelector('button');
const pickedList = () => { const l = lines(); return [...picked].sort((a, b) => a - b).map(i => l[i]); };
['svg', 'png'].forEach(ext => {
  const E = ext === 'svg' ? 'Svg' : 'Png';
  $('dl' + E).onclick = () => downloadAs(ext).catch(fail($('dl' + E)));
  $('dlOne' + E).onclick = () => downloadAs(ext, true).catch(fail(dlOneBtn));
  $('sel' + E).onclick = () => downloadZip(ext, pickedList(), $('sel' + E)).catch(fail($('sel' + E)));
});
// DPI menu: purpose + expected pixel size, built when opened (size depends on current options)
// (same menu in the single view and the whole-set view; both write #dpi)
document.querySelectorAll('.dpi-btn').forEach(btn => btn.addEventListener('show.bs.dropdown', () => {
  const menu = btn.nextElementSibling;
  menu.innerHTML = '<li><h6 class="dropdown-header">PNG 解析度</h6></li>';
  [...$('dpi').options].forEach(opt => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dropdown-item d-flex align-items-center gap-3' + (opt.selected ? ' active' : '');
    b.dataset.dpi = opt.value;
    b.innerHTML = `<span><span class="fw-semibold">${opt.value} DPI</span> · ${opt.textContent}</span>`
      + `<span class="ms-auto small ${opt.selected ? '' : 'text-body-secondary'}">${pngSizeText(+opt.value)}</span>`;
    const li = document.createElement('li');
    li.append(b);
    menu.append(li);
  });
}));
document.querySelectorAll('.dpi-menu').forEach(m => m.addEventListener('click', e => {
  const b = e.target.closest('[data-dpi]');
  if (!b) return;
  $('dpi').value = b.dataset.dpi;
  $('dpi').dispatchEvent(new Event('input'));
}));
$('copyPng').onclick = async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPngBlob() })]);
    flash($('copyPng'), '已複製', true, '已複製圖片');
  } catch (e) {
    flash($('copyPng'), '失敗', false, '瀏覽器不支援複製圖片：' + e.message);
  }
};

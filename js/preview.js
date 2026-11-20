// Input parsing, drawing and the preview (single and whole-set view)
let valid = false;
let cur = 0; // index of the line shown in preview
// GS1 General Specifications (via GS1 Sweden size guide): recommended
// X-dimension (mm) and bar height (mm) per symbol. `margin` is the
// symmetric side margin (in modules) that meets the minimum quiet zones, given the
// blank modules JsBarcode already reserves for the outside digits (measured):
//   EAN-13: 12 blank on the left; needs 11 left / 7 right  -> margin 7
//   UPC-A:  8 blank each side;   needs 9 each side         -> margin 1
//   EAN-8:  none;                needs 7 each side         -> margin 7
//   ITF-14: none;                needs 10 each side        -> margin 10
// (ITF-14 bearer bars are not drawn by JsBarcode)
// xMin / hMin: smallest X-dimension and bar height in the same table (UPC-A is not listed)
const GS1 = {
  EAN13: { x: 0.33,  barH: 22.85, margin: 7,  xMin: 0.264, hMin: 18.28 },
  UPC:   { x: 0.33,  barH: 22.85, margin: 1 },
  EAN8:  { x: 0.33,  barH: 18.23, margin: 7,  xMin: 0.264, hMin: 14.58 },
  ITF14: { x: 0.495, barH: 31.75, margin: 10, xMin: 0.495, hMin: 31.75 }
};
// Size check for other 1D codes: X at least 2 printer dots at the chosen DPI (so every bar prints
// evenly) and never under 0.127 mm (5 mil, the finest common hand-held scanners read), text glyphs
// ≥ 2 mm high (GS1 HRI guideline), bars ≥ 5 mm and ≥ 15% of the symbol length
// (ISO/IEC 15417 recommendation for hand-held scanning)
const minX = () => Math.max(2 * 25.4 / (+$('dpi').value || 300), .127);
const MIN_TEXT = 2, MIN_PT = 8, MIN_BAR = 5;   // text: glyphs ≥ 2 mm high (GS1) and ≥ 8 pt

function opts() {
  return {
    format: $('format').value,
    lineColor: $('lineColor').value,
    background: $('transparent').checked ? 'transparent' : $('background').value
  };
}

const MAX_ITEMS = 1000;

// Whole text box is one 1D barcode but has line breaks (fix: join the lines)
const needsJoin = () => !$('modeBatch').checked && !$('multiLine').checked
  && $('format').value !== 'QR' && $('value').value.trim().includes('\n');

// Items come from the active mode: textarea lines, or the serial-number batch
function parse() {
  if ($('modeBatch').checked) return batch();
  if (!$('multiLine').checked) { // whole textarea is one barcode (line breaks kept: QR can hold them)
    const v = $('value').value.replace(/\r/g, '').trim();
    return { list: v ? [v] : [], error: '' };
  }
  const list = $('value').value.split('\n').map(s => s.trim()).filter(Boolean);
  return list.length > MAX_ITEMS
    ? { list: list.slice(0, MAX_ITEMS), error: `超過 ${MAX_ITEMS} 筆，只處理前 ${MAX_ITEMS} 筆` }
    : { list, error: '' };
}

// Serial-number batch: prefix + number + suffix. Digits keep the width typed in
// 起 (01 -> 01, 02 …; 1 -> 1, 2 …); no padding is added beyond what was typed.
function batch() {
  const s = $('bStart').value.trim(), e = $('bEnd').value.trim();
  if (!s && !e) return { list: [], error: '' };
  if (!/^\d+$/.test(s) || !/^\d+$/.test(e)) return { list: [], error: '起始值和結束值都要是數字' };
  const st = $('bStep').value.trim();
  if (st && !/^[1-9]\d*$/.test(st)) return { list: [], error: '增量要是 1 以上的整數' };
  const start = +s, end = +e, step = +st || 1;
  if (end < start) return { list: [], error: '結束值不可小於起始值' };
  if (Math.floor((end - start) / step) + 1 > MAX_ITEMS) return { list: [], error: `一次最多 ${MAX_ITEMS} 筆` };
  const list = [];
  for (let n = start; n <= end; n += step)
    list.push($('bPrefix').value + String(n).padStart(s.length, '0') + $('bSuffix').value);
  return { list, error: '' };
}

// The list as of the last render (render runs on every input change)
let curList = [];
const lines = () => curList;

// Textarea line (1-based) for each item in text mode, so errors can point at lines
function itemLines() {
  if ($('modeBatch').checked || !$('multiLine').checked) return null;
  const nums = [];
  $('value').value.split('\n').forEach((l, i) => { if (l.trim()) nums.push(i + 1); });
  return nums;
}

// "第 3、5 行有錯誤 [跳到第 3 行]" under the textarea
let lineErrFirst = 0;
function showLineErrors(bad) {
  const nums = itemLines();
  // Only one item: the preview already shows its error, no line to point at
  const lines_ = nums && nums.length > 1 ? bad.map(i => nums[i]).filter(Boolean) : [];
  $('lineErr').hidden = !lines_.length;
  if (!lines_.length) return;
  lineErrFirst = lines_[0];
  $('lineErrText').textContent = `第 ${lines_.slice(0, 5).join('、')}${lines_.length > 5 ? '…' : ''} 行有錯誤`;
  $('lineErrGo').setAttribute('aria-label', `前往第 ${lineErrFirst} 行`);
}

// Live serial preview, color-coded: prefix (blue) / number / suffix (green)
function batchPreview(list) {
  const count = list.length;
  const pre = $('bPrefix').value, suf = $('bSuffix').value;
  const s = $('bStart').value.trim(), e = $('bEnd').value.trim();
  const el = $('bPreview');
  el.replaceChildren();
  if (!pre && !s && !suf) return; // nothing typed yet: leave empty
  const span = (text, cls) => Object.assign(document.createElement('span'), { textContent: text, className: cls });
  const item = num => [span(pre, 'text-primary fw-semibold'), span(num, 'text-body fw-semibold'), span(suf, 'text-success fw-semibold')];
  // Left: first … last (with a step it may stop before the end value)
  const left = span('', 'text-truncate');
  left.append(...item(s));
  if (count > 1) left.append(' … ', ...item(String(+s + (count - 1) * (+$('bStep').value || 1)).padStart(s.length, '0')));
  el.append(left);
  // Right: count + copy the list into the text box to edit single items
  if (count) el.append(span(`共 ${count} 筆`, 'ms-auto text-nowrap text-body-secondary'), Object.assign(document.createElement('button'), {
    type: 'button', id: 'toText', className: 'btn btn-sm btn-outline-secondary btn-quiet text-nowrap py-0 px-2', textContent: '轉為自訂內容' }));
}

function draw(svg, value, o) {
  const msg = checkValue(o.format, value);
  if (msg) throw new Error(msg);
  o.format === 'QR' ? renderQR(svg, value, o) : render1D(svg, value, o);
}

function renderQR(out, value, o) {
  const qr = qrcode(0, $('ecLevel').value);
  qr.addData(unescape(encodeURIComponent(value)), 'Byte'); // UTF-8
  qr.make();
  const n = qr.getModuleCount();
  const cell = mmPx('cellSize', 1);
  const m = +$('qrMargin').value || 0;
  const size = (n + m * 2) * cell;
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) d += `M${(c + m) * cell},${(r + m) * cell}h${cell}v${cell}h-${cell}z`;
  out.setAttribute('width', size);
  out.setAttribute('height', size);
  out.setAttribute('viewBox', `0 0 ${size} ${size}`);
  out.innerHTML =
    (o.background === 'transparent' ? '' : `<rect width="100%" height="100%" fill="${o.background}"/>`) +
    `<path d="${d}" fill="${o.lineColor}" shape-rendering="crispEdges"/>`;
}

// Side margin (px) of a 1D code for bar width x (px): as typed in mm, or left blank for the quiet
// zone the format needs, in bar widths (GS1 codes per their spec, others 10, as Code 128 requires)
const QUIET = 10;
const autoMargin = (o, x) => ((GS1[o.format] || {}).margin ?? QUIET) * x;
const sideMargin = (o, x) => $('marginAuto').checked ? autoMargin(o, x) : mmPx('marginX');
// Font size (px) for bar width x (px): as typed, or automatic: in step with the bar width (10 pt at
// 0.33 mm, the GS1 standard size), not below the size whose glyphs are MIN_TEXT mm high, and never
// wider than the bars (wider text makes JsBarcode widen the image and centre the bars in it, which
// leaves blank space at the sides; then the size check flags the small text instead). The size is
// worked out for the item shown. GS1 codes place their digits by themselves, so no width limit
const fontPx = x => {
  if (!$('fontAuto').checked) return ptPx('fontSize');
  const fmt = opts().format, text = lines()[cur] || '0123456789';
  const m = textMetrics(text), size = Math.max(x / PX_PER_MM / .33 * 10 * PX_PER_PT,
    MIN_TEXT * PX_PER_MM / m.height * 1.01, MIN_PT * PX_PER_PT);
  return GS1[fmt] ? size : Math.min(size, modulesOf(fmt, text) * x / m.width * .999);
};
// Glyph height and text width per px of font size, in the chosen font
function textMetrics(text) {
  glyphCtx.font = `100px ${$('font').value === 'OCR-B' ? '"OCR-B"' : $('font').value}`;
  const m = glyphCtx.measureText(text);
  return { height: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 100, width: m.width / 100,
    ascent: m.actualBoundingBoxAscent / 100 };
}
// Text margin (px) for bar width x, so the gap from the bars to the top of the glyphs is the 與條碼間距
// set: JsBarcode puts the baseline one font size below the margin, and the glyphs only reach
// part of that height (caps and digits leave the top of the em box empty)
const textMarginPx = x => {
  const size = fontPx(x);
  return mmPx('textGap') - size * (1 - textMetrics(lines()[cur] || '0123456789').ascent);
};
// Number of modules (narrowest bar widths) in a 1D code, without margins or text
const modulesCache = new Map();
function modulesOf(fmt, text) {
  const key = fmt + '|' + text;
  if (!modulesCache.has(key)) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    let ok = true;
    JsBarcode(svg, text, { format: fmt, width: 1, height: 1, margin: 0, displayValue: false, valid: v => { ok = v; } });
    if (modulesCache.size > 2000) modulesCache.clear();
    modulesCache.set(key, ok ? parseFloat(svg.getAttribute('width')) : Infinity);
  }
  return modulesCache.get(key);
}

// Output size → the one setting that makes it: a width becomes the bar width (QR: cell size), a
// height the bar height; everything else stays as set. Returns the field and its new value (mm),
// or null when the value can't be drawn. Sizes are in CSS px.
function sizeFor(o, value, side, target) {
  if (o.format === 'QR') {
    const cells = parseFloat(out.getAttribute('width')) / mmPx('cellSize', 1);   // square
    return { id: 'cellSize', mm: target / cells / PX_PER_MM };
  }
  let ok = true;
  const measure = (bx, bh) => drawFine(document.createElementNS(SVG_NS, 'svg'), value,
    { ...baseOpts(o, bx), width: bx, height: bh, displayValue: true, valid: v => { ok = v; } });
  const x = mmPx('barWidth', 0.33), h = mmPx('height', 8);
  measure(x, h);
  if (!ok) return null;
  if (side === 'w') {
    // The width always grows with the bar width (modules, automatic margins and text), though not
    // linearly (automatic text stops at its minimum size): bisect between a too-small and a
    // too-large bar width until the width is within about 0.01 mm
    let lo = 0, hi = x;
    while (measure(hi, h)[0] < target && hi < 1e4) { lo = hi; hi *= 2; }
    while (hi - lo > .00005 * PX_PER_MM) {
      const mid = (lo + hi) / 2;
      measure(mid, h)[0] < target ? lo = mid : hi = mid;
    }
    return { id: 'barWidth', mm: lo / PX_PER_MM };   // the largest bar width that still fits
  }
  const [, total] = measure(x, h);
  return { id: 'height', mm: (target - (total - h)) / PX_PER_MM };
}

// JsBarcode options other than the bar size (exact mm sizes, before any rounding); an automatic
// side margin or font size depends on the bar width x (px)
function baseOpts(o, x) {
  return {
    format: o.format, font: $('font').value, fontSize: fontPx(x), textMargin: textMarginPx(x),
    margin: 0, marginTop: mmPx('marginY'), marginBottom: mmPx('marginY'),
    marginLeft: sideMargin(o, x), marginRight: sideMargin(o, x)
  };
}

// JsBarcode options; k scales every size so PNG export lands on whole printer dots
function barcodeOpts(o, k) {
  // On screen (k = 1) keep exact mm sizes; for PNG round to whole printer dots
  const r = v => k === 1 ? v : Math.round(v * k);
  const bars = { x: mmPx('barWidth', 0.33), h: mmPx('height', 8) };
  return {
    format: o.format,
    width: r(bars.x),
    height: r(bars.h),
    font: $('font').value,
    fontSize: r(fontPx(bars.x)),
    textMargin: r(textMarginPx(bars.x)),   // gap between the bars and the text
    margin: 0, // JsBarcode falls back to `margin` when a side is 0, so 0 must mean 0
    marginTop: r(mmPx('marginY')),
    marginBottom: r(mmPx('marginY')),
    marginLeft: r(sideMargin(o, bars.x)),
    marginRight: r(sideMargin(o, bars.x)),
    displayValue: true,
    lineColor: o.lineColor,
    background: o.background
  };
}

// JsBarcode rounds the barcode area up to whole px (≈0.26 mm), so 1D codes are drawn FINE times
// larger and shown at the real size through the viewBox: sizes then land within ≈0.03 mm
const FINE = 10;
const fineOpts = opts => Object.fromEntries(Object.entries(opts).map(([k, v]) =>
  [k, ['width', 'height', 'fontSize', 'textMargin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight'].includes(k) ? v * FINE : v]));
// Draw a 1D code into svg at FINE resolution; width/height attributes are the real size (CSS px)
function drawFine(svg, value, opts) {
  svg.innerHTML = '';
  svg.removeAttribute('viewBox');
  JsBarcode(svg, value, fineOpts(opts));
  const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);   // also lets the SVG scale down to fit a label
  svg.setAttribute('width', w / FINE);
  svg.setAttribute('height', h / FINE);
  return [w / FINE, h / FINE];
}

function render1D(out, value, o) {
  let ok = true;
  // Thumbnails (o.thumb) skip the printed text; it would be too small to read
  drawFine(out, value, { ...barcodeOpts(o, 1), displayValue: !o.thumb, valid: v => { ok = v; } });
  if (!ok) throw new Error(`內容不符合 ${NAMES[o.format]} 格式`);
}

// Validation result per value: { w, h } or { error }. Kept until a drawing option
// changes, so typing in one line only draws that line.
const checks = new Map();
let checksKey = '';
const DRAW_IDS = ['format', 'lineColor', 'background', 'transparent', 'barWidth', 'height', 'font',
                  'fontSize', 'fontAuto', 'textGap', 'marginY', 'marginX', 'marginAuto', 'ecLevel', 'cellSize', 'qrMargin'];
function syncChecks() {
  const key = DRAW_IDS.map(id => isToggle($(id)) ? $(id).checked : $(id).value).join('|');
  if (key !== checksKey) { checks.clear(); checksKey = key; }
}
let checkSvg = null;
function checkItem(v, o) {
  if (!checks.has(v)) {
    checkSvg = checkSvg || newSvg();
    try {
      draw(checkSvg, v, o);
      checks.set(v, { w: parseFloat(checkSvg.getAttribute('width')) || 0, h: parseFloat(checkSvg.getAttribute('height')) || 0 });
    } catch (e) { checks.set(v, { error: e.message || String(e) }); }
  }
  return checks.get(v);
}

// Whole-set preview: thumbnails of up to GRID_MAX items; click one to open it
const GRID_MAX = 200;
let gridKey = ''; // list + drawing options the grid was built for
// Thumbnails are added in batches of GRID_MAX as the user scrolls down
function renderGrid(list, o, badTotal = 0) {
  const grid = $('gridView');
  // Summary next to the view toggle (counts every item, not just the loaded ones)
  $('gridSummary').textContent = `共 ${list.length} 筆` + (badTotal ? `，${badTotal} 筆無法產生` : '');
  // Same list and options: keep the tiles, just mark the current and picked ones
  const key = checksKey + '\n' + list.join('\n');
  if (key === gridKey && grid.children.length) {
    grid.querySelectorAll('.grid-cell').forEach(c => {
      const i = +c.querySelector('.grid-item').dataset.i;
      c.querySelector('.grid-item').classList.toggle('current', i === cur);
      c.classList.toggle('picked', picked.has(i));
      c.querySelector('.grid-pick').checked = picked.has(i);
    });
    return;
  }
  gridKey = key;
  grid.replaceChildren();
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text || '' });
  let shown = 0;
  const sentinel = el('div', 'grid-span small text-body-secondary text-center py-2');
  const addBatch = () => {
    list.slice(shown, shown + GRID_MAX).forEach((v, j) => addItem(v, shown + j));
    shown = Math.min(list.length, shown + GRID_MAX);
    sentinel.textContent = shown < list.length ? `載入中… ${shown} / ${list.length}` : '';
    grid.appendChild(sentinel); // keep it last
  };
  const addItem = (v, i) => {
    const item = Object.assign(el('button', 'grid-item d-flex flex-column gap-1 p-2 rounded-3 text-center'), { type: 'button' });
    item.dataset.i = i;
    if (i === cur) item.classList.add('current');
    // Top row: number, plus a short error tag
    const head = el('div', 'grid-head d-flex justify-content-between small lh-1 text-body-secondary');
    head.appendChild(el('span', '', i + 1));
    // Fixed-height thumbnail (the barcode's own small text is omitted)
    const thumb = el('div', 'grid-thumb d-flex align-items-center justify-content-center p-1 rounded');
    try {
      thumb.appendChild(fluidSvg(v, { ...o, thumb: true }));
    } catch (e) {
      item.classList.add('bad');
      item.title = e.message || String(e); // full reason on hover
      head.appendChild(el('span', 'text-danger', '無法產生'));
      thumb.appendChild(Object.assign(el('i', 'bi bi-exclamation-triangle'), { ariaHidden: 'true' }));
    }
    item.append(head, thumb, Object.assign(el('div', 'grid-label font-monospace small text-truncate', v), { title: v }));
    // Tile + its pick checkbox (outside the button, so clicking it doesn't open the item)
    const cellEl = el('div', 'grid-cell position-relative' + (picked.has(i) ? ' picked' : ''));
    const pick = Object.assign(document.createElement('input'), {
      type: 'checkbox', className: 'form-check-input grid-pick', checked: picked.has(i) });
    pick.dataset.i = i;
    pick.setAttribute('aria-label', `選取第 ${i + 1} 筆`);
    // Label around the checkbox = larger click area in the tile corner
    const hit = el('label', 'grid-pick-hit position-absolute top-0 start-0 z-1 d-flex align-items-center justify-content-center');
    hit.append(pick);
    cellEl.append(hit, item);
    grid.insertBefore(cellEl, sentinel.parentNode ? sentinel : null);
  };
  addBatch();
  // Load the next batch when scrolled near the bottom of the grid
  grid.onscroll = () => {
    if (shown < list.length && grid.scrollTop + grid.clientHeight > grid.scrollHeight - 300) addBatch();
  };
}

// Errors: the shown item's reason (with a hint and the one-click fix) inside the
// canvas; errors in other items as a notice with a jump button.
let errMsg = '', others = [];
function setErrors(msg, otherIdx) { errMsg = msg || ''; others = otherIdx; paintErrors(); }

function paintErrors() {
  const hasMsg = !!errMsg, hasOthers = others.length > 0;
  // The reason shows inside the (empty) canvas; it is only visible in the error state

  // Reason first, explanation second (split at the first full-width comma)
  const cut = errMsg.indexOf('，');
  $('error').textContent = cut > 0 ? errMsg.slice(0, cut) : errMsg;
  $('errHint').textContent = cut > 0 ? errMsg.slice(cut + 1) : '';
  $('error').hidden = !hasMsg;
  $('errHint').hidden = !$('errHint').textContent;

  // One-click fix when unsupported characters can be removed
  const fix = hasMsg && fixFor($('format').value);
  const ids = fixIds();
  const join = hasMsg && needsJoin();
  const fixable = join || (!!fix && ids.some(id => fix.apply($(id).value) !== $(id).value));
  $('fixRow').hidden = !fixable;
  if (join) $('fixLabel').textContent = '合併成一行';
  else if (fixable) {
    // Name exactly what the fix will do (CODE39 may only need uppercasing)
    let label = fix.label;
    if ($('format').value === 'CODE39') {
      const text = ids.map(id => $(id).value).join('');
      const lower = /[a-z]/.test(text), bad = [...text].some(BAD_CHAR.CODE39);
      label = lower && bad ? '轉大寫並移除' : lower ? '轉成大寫' : '移除不支援字元';
    }
    $('fixLabel').textContent = label;
  }

  // Other items with errors: compact notice at the right of the top row
  // (d-none, not hidden: Bootstrap d-flex is !important and would win over [hidden])
  document.querySelectorAll('.other-err').forEach(el => el.classList.toggle('d-none', !hasOthers));
  if (hasOthers) {
    // Short wording: consecutive numbers become ranges (2–6); many groups → just a count
    const groups = [];
    others.forEach(i => {
      const g = groups[groups.length - 1];
      g && g[1] === i - 1 ? (g[1] = i) : groups.push([i, i]);
    });
    const which = groups.length <= 3
      ? '第 ' + groups.map(([a, b]) => a === b ? a + 1 : `${a + 1}–${b + 1}`).join('、') + ' 筆'
      : `${others.length} 筆`;
    const text = hasMsg ? `另外${which}也有錯誤` : `${which}有錯誤，無法列印或下載全部`;
    document.querySelectorAll('.other-err-text').forEach(el => el.textContent = text);
  }
  $('topBar').classList.toggle('invisible', $('viewBar').hidden && !hasOthers);
}

// 2+ items: main buttons download all as a ZIP (needs every item valid),
// plus a small link to download only the shown item
function updateDownloadAll(list) {
  const multi = list.length > 1;
  $('dlOneWrap').hidden = !multi;
  $('dlOneNum').textContent = cur + 1;
  $('dlOneDpi').textContent = pngSizeText(); // expected PNG size at the chosen DPI
  // 2+ items: "全部" on the button; count and ZIP in the tooltip (no extra line)
  [['dlSvg', 'SVG'], ['dlPng', 'PNG']].forEach(([id, t]) => {
    $(id).querySelector('.lbl').textContent = (multi ? '全部 ' : '') + t;
    $(id).title = multi ? `下載 ${list.length} 筆，ZIP 壓縮檔` : '';
  });
  document.querySelectorAll('.dpi-label').forEach(l => l.textContent = $('dpi').value + ' DPI');
}

// Preview size: automatically as large as fits the preview area (display only;
// downloads keep the real size). The barcode never scrolls; FILL of the width at most,
// capped at MAX_ZOOM so short barcodes don't become huge.
const MAX_ZOOM = 2;
const FILL = 0.82; // share of the free width / height the barcode may take

// Space left for the barcode inside the canvas box (height is Infinity on phones, where the
// page scrolls; at least 60px when the window is very short)
function availSpace() {
  const area = $('previewArea');
  const gap = 16, pad = 32 + 2; // canvas padding + rounding slack
  // Room taken by the ‹ › buttons beside the barcode
  // (phones: they sit on the "n / N" line instead, see CSS)
  const side = window.innerWidth < 576 ? 0 : ($('prev').offsetWidth + 8) * 2;
  const availW = area.clientWidth - pad - side;
  if (window.innerWidth < 992) return { availW, availH: Infinity };
  const others = [...area.children]
    .filter(c => c.id !== 'previewBox' && !c.hidden && c.offsetParent)
    .reduce((sum, c) => sum + c.offsetHeight + gap, 0);
  // Toolbar above and the "n / N" line below the canvas (grid gap + nav margin)
  const tools = $('previewTools').offsetHeight + 4 + $('nav').offsetHeight + 16;
  const availH = area.clientHeight - others - tools - pad;
  return { availW, availH: Math.max(availH, 60) };
}

// Expected PNG pixel size, same rules as toPngBlob (whole printer dots per bar)
function pngSizeText(dpi = +$('dpi').value || 300) {
  const w = parseFloat(out.getAttribute('width')), h = parseFloat(out.getAttribute('height'));
  if (!valid || !w || !h) return '';
  const mod = moduleSize();
  const k = Math.max(1, Math.round(mod * dpi / 96)) / mod;
  return `${Math.round(w * k)} × ${Math.round(h * k)}`;
}

// Size the last valid barcode was shown at, so an item with an error keeps the
// same canvas size instead of shrinking to a small empty box
let lastShown = null;

// Natural sizes of the valid items in the set (from validation, duplicates removed)
let setDims = null;

// Each barcode is zoomed to fit on its own (FILL of the width, all of the height,
// at most MAX_ZOOM), so a long item doesn't make the short ones small. The 0.01 floor is only a
// safety net: even an extreme size shrinks to fit rather than pushing the buttons out of the card
const fitZoom = (w, h, A) => Math.max(0.01, Math.min(MAX_ZOOM, A.availW * FILL / w, A.availH * FILL / h));
// The canvas box is the largest of those shown sizes, so it keeps one size (and the
// ‹ › stay put) while switching items
function setBox(A) {
  if (!setDims) return null;
  let w = 0, h = 0;
  setDims.forEach(d => { const z = fitZoom(d.w, d.h, A); w = Math.max(w, d.w * z); h = Math.max(h, d.h * z); });
  return { w, h };
}

// Size the canvas box (the ‹ › beside it are laid out by CSS grid)
function applyZoom() {
  const wrap = $('canvasWrap');
  out.style.width = out.style.height = '';
  out.classList.remove('zoomed');
  wrap.style.width = wrap.style.height = wrap.style.minHeight = '';
  const A = availSpace(), box = setBox(A);
  const w = parseFloat(out.getAttribute('width')), h = parseFloat(out.getAttribute('height'));
  if (!valid || !w || !h) {
    if (wrap.classList.contains('is-empty')) {
      // Same box as the valid items of the set (even when the first item is the bad one);
      // with nothing valid yet, a typical barcode-sized box (CSS keeps the message fitting)
      if (box) lastShown = box;
      if (!lastShown) lastShown = { w: Math.min(A.availW, 360), h: Math.min(A.availH, 180) };
      const s = Math.min(1, A.availW / lastShown.w, A.availH / lastShown.h);
      wrap.style.width = `${lastShown.w * s + 32}px`; // + canvas padding
      wrap.style.minHeight = `${lastShown.h * s + 32}px`; // grows if the message needs more room
    }
    return;
  }
  const z = fitZoom(w, h, A);
  out.style.width = `${w * z}px`;
  out.style.height = `${h * z}px`;
  out.classList.add('zoomed'); // the computed size wins over max-width: 100%
  if (box) {
    wrap.style.width = `${Math.max(box.w, w * z) + 32}px`; // + canvas padding
    wrap.style.height = `${Math.max(box.h, h * z) + 32}px`;
  }
  lastShown = box || { w: w * z, h: h * z };
}

// Picked items in the whole-set view (cleared when the list changes)
let picked = new Set(), pickedKey = '', lastBad = new Set();
function syncPicked(list) {
  const key = list.join('\n');
  if (key !== pickedKey) { picked = new Set(); pickedKey = key; }
}
function paintGridBar(list) {
  const n = picked.size, anyBad = [...picked].some(i => lastBad.has(i));
  $('selCount').textContent = n ? `已選 ${n} 筆` + (anyBad ? '，含錯誤，請先修正' : '') : '勾選要下載或列印的條碼';
  $('selAll').textContent = n && n === list.length ? '取消全選' : '全選';
  syncButtons();
}

// Every enabled/disabled state of the output buttons, from one place.
// setState: item count, any item invalid, validation still pending, input error.
let setState = { count: 0, anyBad: false, pending: false, error: false };
let busy = false; // a ZIP is being built
function syncButtons() {
  const { count, anyBad, pending, error } = setState;
  const blocked = pending || anyBad || error; // the whole set can't be exported or printed
  ['dlSvg', 'dlPng'].forEach(id => $(id).disabled = busy || !valid || (count > 1 && blocked));
  ['dlOneSvg', 'dlOnePng', 'copyPng'].forEach(id => $(id).disabled = !valid);
  $('print').disabled = !count || blocked;
  const n = picked.size, pickedBad = [...picked].some(i => lastBad.has(i));
  ['selSvg', 'selPng'].forEach(id => $(id).disabled = busy || !n || pickedBad);
  $('selPrint').disabled = !n || pickedBad;
}

// Light colors (near white) would vanish into the white field: their picker gets an outline
const isLight = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return .299 * r + .587 * g + .114 * b > 225;
};

let validateTimer;

function render() {
  const o = opts();
  const isQR = o.format === 'QR';
  document.querySelector('.only-1d').hidden = isQR;
  document.querySelector('.only-qr').hidden = !isQR;
  $('formatHint').textContent = HINTS[o.format] || '';
  applyInputHints(o.format);
  $('fontHint').hidden = $('font').value !== 'OCR-B';
  $('background').disabled = $('transparent').checked;
  // Nothing to clear: disable 清空內容
  $('clear').disabled = !CONTENT_IDS.some(id => $(id).value.trim());
  // Hex fields mirror the color pickers (left alone while being typed in)
  COLOR_PAIRS.forEach(([c, h]) => {
    if (document.activeElement !== $(h)) $(h).value = $(c).value;
    $(c).classList.toggle('is-light', isLight($(c).value)); // outline light colors only
  });
  $('backgroundHex').disabled = $('transparent').checked;

  const isBatch = $('modeBatch').checked;
  $('paneText').hidden = isBatch;
  $('paneBatch').hidden = !isBatch;

  let { list, error } = parse();
  curList = list;
  cur = Math.max(0, Math.min(cur, list.length - 1));
  batchPreview(list);
  // Item count under the text box (text mode)
  $('lineCount').textContent = !isBatch && list.length > 1 ? `共 ${list.length} 筆` : '';

  // Single vs whole-set view (only offered when there are 2+ items)
  const multi = list.length >= 2;
  // Back to 0–1 item: forget the whole-set view, so typing a 2nd item starts in single view
  if (!multi) $('viewOne').checked = true;
  const gridMode = multi && $('viewAll').checked;
  $('viewBar').hidden = !multi;
  $('previewArea').classList.toggle('d-none', gridMode);
  $('gridView').hidden = !gridMode;
  $('gridBar').classList.toggle('d-none', !gridMode);
  syncPicked(list);
  if (gridMode) paintGridBar(list);
  if (!gridMode) { $('gridView').replaceChildren(); $('gridSummary').textContent = ''; gridKey = ''; }

  // Preview the current line; its error shows right away
  valid = false;
  out.innerHTML = '';
  let curError = '';
  if (list.length) {
    try { draw(out, list[cur], o); valid = true; }
    catch (e) { out.innerHTML = ''; curError = e.message || String(e); } // position is shown by ‹ n/N ›
  }
  if (!valid) { out.removeAttribute('width'); out.removeAttribute('height'); }

  // Three states: empty (no content yet), error (the shown item can't be drawn),
  // or normal. Error keeps the (empty) canvas but hides copy/print and downloads.
  const empty = !list.length && !error;
  const errState = !empty && !valid;
  $('empty').hidden = !empty;

  $('previewBox').hidden = empty;
  // copy/print need a valid barcode; invisible (not removed) so the canvas doesn't jump up
  $('previewTools').classList.toggle('invisible', errState);
  // Download buttons stay in place in the error state (syncButtons disables them)
  $('downloads').hidden = empty;
  $('canvasWrap').classList.toggle('is-empty', errState);
  // The top row always keeps its height (just invisible with one item), so the
  // preview size is the same whether or not the single/all toggle is shown
  $('topBar').classList.toggle('invisible', $('viewBar').hidden && !others.length);

  // Validate every item. The shown item's own error is red; errors in other
  // items only appear as a notice (they block printing the whole set).
  // Results are cached per value, so only new or changed lines are drawn; when many
  // lines are new (e.g. a big paste), checking waits until typing pauses.
  clearTimeout(validateTimer);
  syncChecks();
  updateDownloadAll(list);
  const validate = later => {
    const bad = [];
    if (!error) {
      const dims = new Map();
      list.forEach((v, i) => {
        const r = checkItem(v, o);
        if (r.error) bad.push(i);
        else if (r.w && r.h) dims.set(r.w + 'x' + r.h, r);
      });
      setDims = list.length > 1 && dims.size ? [...dims.values()] : null;
    }
    lastBad = new Set(bad);
    setState = { count: list.length, anyBad: bad.length > 0, pending: false, error: !!error };
    setErrors(error || curError, bad.filter(i => i !== cur));
    showLineErrors(bad);
    syncButtons();
    if (gridMode) { renderGrid(list, o, bad.length); paintGridBar(list); }
    else if (later) applyZoom(); // (in render, applyZoom runs at the end anyway)
  };
  const uncached = error ? 0 : list.filter(v => !checks.has(v)).length;
  if (uncached <= 50) validate();
  else {
    setState = { count: list.length, anyBad: false, pending: true, error: false };
    setErrors(curError, []);
    syncButtons();
    validateTimer = setTimeout(() => validate(true), 300);
  }

  // Output size in the chosen unit (mm, or px = 1/96 inch): always the real size (not while the
  // field is being typed in; leaving it converts the typed size, see main.js)
  const unit = $('sizeUnit').value;
  document.querySelectorAll('.unit-label').forEach(el => el.textContent = unit);
  const pw = parseFloat(out.getAttribute('width')), ph = parseFloat(out.getAttribute('height'));
  // Automatic font size / side margin: the field shows the value in use (and can't be typed in)
  const bx = mmPx('barWidth', 0.33);
  ['fontSize', 'marginX'].forEach(id => $(id).disabled = $(id === 'fontSize' ? 'fontAuto' : 'marginAuto').checked);
  if (valid && o.format !== 'QR') {
    if ($('fontAuto').checked) $('fontSize').value = +(fontPx(bx) / PX_PER_PT).toFixed(1);
    if ($('marginAuto').checked) $('marginX').value = +(autoMargin(o, bx) / PX_PER_MM).toFixed(2);
  }  [['imgW', pw], ['imgH', ph]].forEach(([id, px]) => {
    if (document.activeElement !== $(id)) $(id).value = valid ? fmtSize(pxToUnit(px)) : '';
  });
  sizeCheck(o, pw);
  const g = GS1[o.format];
  $('gs1Btn').hidden = !g;
  if (g) {
    // Tooltip lists the values the button will apply for this format
    const tip = `套用 GS1 標準：\n• 線寬 ${g.x} mm\n• 條碼高度 ${g.barH} mm\n• 左右邊距 自動`;
    const t = window.bootstrap && bootstrap.Tooltip.getInstance($('gs1Btn'));
    t ? t.setContent({ '.tooltip-inner': tip }) : $('gs1Btn').title = tip;
  }

  // With one item the counter and ‹ › stay in place but invisible, so the preview
  // keeps the same size when a second item is added
  $('nav').classList.toggle('invisible', list.length < 2);
  ['prev', 'next'].forEach(id => $(id).classList.toggle('invisible', list.length < 2));
  // "/" and the total as separate parts, so the gap between them is set in CSS
  $('pos').replaceChildren('/', Object.assign(document.createElement('span'), { className: 'pos-total', textContent: list.length }));
  if (document.activeElement !== $('posInput')) $('posInput').value = cur + 1;
  $('posInput').max = list.length;
  $('prev').disabled = cur === 0;
  $('next').disabled = cur >= list.length - 1;
  // Last, once the messages and buttons above/below the canvas are in place
  applyZoom();
  save();
}

// Printed font size (pt; JsBarcode may cap it for EAN/UPC) and the smallest size whose
// glyphs are still MIN_TEXT mm high (glyph height / font size differs per font), at least MIN_PT
const glyphCtx = document.createElement('canvas').getContext('2d');
function textSize() {
  const t = [...out.querySelectorAll('text')];
  if (!t.length) return null;
  const drawn = parseFloat(t[0].style.fontSize);   // at FINE resolution
  glyphCtx.font = t[0].style.font;
  const m = glyphCtx.measureText(t.map(e => e.textContent).join(''));
  const ratio = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / drawn;
  return { pt: drawn / FINE / PX_PER_PT, minPt: Math.max(MIN_PT, MIN_TEXT * PX_PER_MM / ratio / PX_PER_PT) };
}

// Under the output size: the printed sizes, with a warning for anything below the recommended minimum
function sizeCheck(o, pw) {
  const box = $('sizeCheck');
  box.hidden = !valid || o.format === 'QR';
  if (box.hidden) return;
  const g = GS1[o.format] || {};
  const bx = mmPx('barWidth', 0.33), x = bx / PX_PER_MM, barH = mmPx('height', 8) / PX_PER_MM;
  const len = (pw - 2 * sideMargin(o, bx)) / PX_PER_MM; // bars only, without quiet zones
  // Named like the options above, with the smallest recommended value of each and a one-click fix
  // that sets it (rounded up to the field's step); the output size follows
  const ts = textSize();
  const up = (v, step) => Math.ceil(v / step - 1e-9) * step;
  const items = [
    { name: '線寬', unit: 'mm', v: x, min: () => g.xMin || minX(),
      fix: m => { $('barWidth').value = +up(m, .01).toFixed(2); } },
    { name: '高度', unit: 'mm', v: barH, min: () => g.hMin || Math.max(MIN_BAR, len * 0.15),
      fix: m => { $('height').value = +up(m, .01).toFixed(2); } },
    // (a fixed size: the automatic one already keeps to the minimum)
    ts && { name: '字級', unit: 'pt', v: ts.pt, min: () => ts.minPt,
      fix: m => { $('fontAuto').checked = false; $('fontSize').value = up(m, .5); } }
  ].filter(Boolean);
  const isBad = i => i.v < i.min() - 1e-6;
  const fix = v => +v.toFixed(2);
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text || '' });
  box.replaceChildren(...items.map(i => {
    const bad = isBad(i);
    const col = el('div', 'col-4'), cell = el('div', 'size-cell' + (bad ? ' bad' : ''));
    const val = el('div', 'size-val', `${fix(i.v)} ${i.unit} `);
    val.appendChild(Object.assign(el('i', bad ? 'bi bi-exclamation-triangle-fill' : 'bi bi-check-circle-fill text-success'),
      { ariaLabel: bad ? '低於建議' : '符合建議' }));
    cell.append(el('div', 'text-body-secondary', i.name), val, el('div', 'size-min', `建議 ≥ ${fix(i.min())}`));
    if (bad) {
      const btn = el('button', 'btn btn-sm btn-outline-danger py-0 mt-1', '修正');
      btn.type = 'button';
      btn.onclick = () => { i.fix(i.min()); render(); };
      cell.appendChild(btn);
    }
    col.appendChild(cell);
    return col;
  }));
}

function go(step) {
  const n = lines().length;
  if (n < 2) return;
  cur = Math.max(0, Math.min(cur + step, n - 1));
  render();
}

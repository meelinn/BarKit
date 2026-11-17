// Input parsing, drawing and the preview (single and whole-set view)
let valid = false;
let cur = 0; // index of the line shown in preview
// GS1 General Specifications, 100% magnification (via GS1 Sweden size guide):
// X-dimension 0.330 mm and nominal bar height per symbol. `margin` is the
// symmetric side margin (in modules) that meets the minimum quiet zones, given the
// blank modules JsBarcode already reserves for the outside digits (measured):
//   EAN-13: 12 blank on the left; needs 11 left / 7 right  -> margin 7
//   UPC-A:  8 blank each side;   needs 9 each side         -> margin 1
//   EAN-8:  none;                needs 7 each side         -> margin 7
const GS1_X = 0.33;
const GS1 = {
  EAN13: { barH: 22.85, margin: 7 },
  UPC:   { barH: 22.85, margin: 1 },
  EAN8:  { barH: 18.23, margin: 7 }
};
let sizeSide = 'imgW'; // output-size input the user typed; the other is derived

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
  const cell = +$('cellSize').value || 8;
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

// JsBarcode options; k scales every size so PNG export lands on whole printer dots
function barcodeOpts(o, k) {
  const r = v => Math.round(v * k);
  return {
    format: o.format,
    width: r(+$('barWidth').value || 2),
    height: r(+$('height').value || 100),
    font: $('font').value,
    fontSize: r(+$('fontSize').value || 20),
    textMargin: r(2),
    marginTop: r(+$('marginY').value),
    marginBottom: r(+$('marginY').value),
    marginLeft: r(+$('marginX').value),
    marginRight: r(+$('marginX').value),
    displayValue: true,
    lineColor: o.lineColor,
    background: o.background
  };
}

function render1D(out, value, o) {
  out.innerHTML = '';
  out.removeAttribute('viewBox');
  let ok = true;
  // Thumbnails (o.thumb) skip the printed text; it would be too small to read
  JsBarcode(out, value, { ...barcodeOpts(o, 1), displayValue: !o.thumb, valid: v => { ok = v; } });
  if (!ok) throw new Error(`內容不符合 ${NAMES[o.format]} 格式`);
  // viewBox lets the SVG scale down to fit a label
  out.setAttribute('viewBox', `0 0 ${parseFloat(out.getAttribute('width'))} ${parseFloat(out.getAttribute('height'))}`);
}

// Validation result per value: { w, h } or { error }. Kept until a drawing option
// changes, so typing in one line only draws that line.
const checks = new Map();
let checksKey = '';
const DRAW_IDS = ['format', 'lineColor', 'background', 'transparent', 'barWidth', 'height', 'font',
                  'fontSize', 'marginY', 'marginX', 'ecLevel', 'cellSize', 'qrMargin'];
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
  const sentinel = el('div', 'small text-body-secondary text-center py-2');
  sentinel.style.gridColumn = '1 / -1';
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
const MAX_ZOOM = 2.5;
const FILL = 0.9; // share of the free width the barcode may take

// Space left for the barcode inside the canvas box (height is Infinity on phones,
// or when the window is too short to measure a sensible height)
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
  return { availW, availH: availH < 60 ? Infinity : availH };
}

// Expected PNG pixel size, same rules as toPngBlob (whole printer dots per bar;
// a target size, when set, defines the canvas)
function pngSizeText(dpi = +$('dpi').value || 300) {
  const w = parseFloat(out.getAttribute('width')), h = parseFloat(out.getAttribute('height'));
  if (!valid || !w || !h) return '';
  const mod = moduleSize();
  const k = Math.max(1, Math.round(mod * dpi / 96)) / mod;
  const t = targetMm();
  let pw = Math.round(w * k), ph = Math.round(h * k);
  if (t.w || t.h) {
    pw = Math.round((t.w || t.h * w / h) / 25.4 * dpi);
    ph = Math.round((t.h || t.w * h / w) / 25.4 * dpi);
  }
  return `${pw} × ${ph}`;
}

// Size the last valid barcode was shown at, so an item with an error keeps the
// same canvas size instead of shrinking to a small empty box
let lastShown = null;

// Natural sizes of the valid items in the set (from validation, duplicates removed)
let setDims = null;

// Each barcode is zoomed to fit on its own (FILL of the width, all of the height,
// at most MAX_ZOOM), so a long item doesn't make the short ones small
const fitZoom = (w, h, A) => Math.max(0.1, Math.min(MAX_ZOOM, A.availW * FILL / w, A.availH / h));
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
  out.style.width = out.style.height = out.style.maxWidth = '';
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
  out.style.maxWidth = 'none';
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
  // In the error state the buttons are invisible but keep their space, so the
  // canvas stays where it was
  $('downloads').hidden = empty;
  $('downloads').classList.toggle('invisible', errState);
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

  // Output size in the chosen unit (mm, or px = 1/96 inch): default size as
  // placeholder; the side the user typed stays fixed, the other follows the aspect ratio
  const unit = $('sizeUnit').value;
  document.querySelectorAll('.unit-label').forEach(el => el.textContent = unit);
  const pw = parseFloat(out.getAttribute('width')), ph = parseFloat(out.getAttribute('height'));
  $('imgW').placeholder = valid ? fmtSize(pxToUnit(pw)) : '依內容';
  $('imgH').placeholder = valid ? fmtSize(pxToUnit(ph)) : '依內容';
  if (!+$(sizeSide).value) { $('imgW').value = $('imgH').value = ''; }
  else if (valid) {
    const v = +$(sizeSide).value;
    $(sizeSide === 'imgW' ? 'imgH' : 'imgW').value =
      fmtSize(sizeSide === 'imgW' ? v * ph / pw : v * pw / ph);
  }
  $('sizeClear').hidden = !$('imgW').value;
  $('gs1Btn').hidden = !GS1[o.format];

  // With one item the counter and ‹ › stay in place but invisible, so the preview
  // keeps the same size when a second item is added
  $('nav').classList.toggle('invisible', list.length < 2);
  ['prev', 'next'].forEach(id => $(id).classList.toggle('invisible', list.length < 2));
  $('pos').textContent = `/ ${list.length}`;
  if (document.activeElement !== $('posInput')) $('posInput').value = cur + 1;
  $('posInput').max = list.length;
  $('prev').disabled = cur === 0;
  $('next').disabled = cur >= list.length - 1;
  // Last, once the messages and buttons above/below the canvas are in place
  applyZoom();
  save();
}

function go(step) {
  const n = lines().length;
  if (n < 2) return;
  cur = Math.max(0, Math.min(cur + step, n - 1));
  render();
}

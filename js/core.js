// Shared helpers and the list of saved fields
const $ = id => document.getElementById(id);
const out = $('out');
// Display options are entered in mm / pt; drawing works in CSS px (1/96 inch)
const PX_PER_MM = 96 / 25.4, PX_PER_PT = 96 / 72;
const mmPx = (id, d = 0) => (+$(id).value || d) * PX_PER_MM;
const ptPx = (id, d = 0) => (+$(id).value || d) * PX_PER_PT;

// OCR-B font from fonts/ocrb.js (base64, so it works over file:// too)
const OCRB_FACE = window.OCRB_BASE64
  ? `@font-face{font-family:"OCR-B";src:url(data:font/otf;base64,${window.OCRB_BASE64}) format("opentype")}`
  : '';
if (OCRB_FACE) document.head.appendChild(Object.assign(document.createElement('style'), { textContent: OCRB_FACE }));
// Content inputs (both modes) and display options (「恢復預設」 resets these)
const CONTENT_IDS = ['value', 'bPrefix', 'bSuffix', 'bStart', 'bEnd', 'bStep'];
const DISPLAY_FIELDS = ['barWidth', 'height', 'font', 'fontSize', 'marginY', 'marginX',
                        'ecLevel', 'cellSize', 'qrMargin', 'lineColor', 'background', 'transparent',
                        'sizeUnit', 'imgW', 'imgH'];
// Everything remembered between visits
const fields = ['format', 'modeText', 'modeBatch', 'multiLine', ...CONTENT_IDS, ...DISPLAY_FIELDS, 'dpi',
                'printOffX', 'printOffY', 'printLayout', 'printStart', 'printCols', 'printRows', 'viewOne', 'viewAll'];
const isToggle = el => el.type === 'checkbox' || el.type === 'radio';

const SVG_NS = 'http://www.w3.org/2000/svg';
const newSvg = () => document.createElementNS(SVG_NS, 'svg');
// Drawn barcode without fixed width/height, so it scales to its box (thumbnails, labels)
const fluidSvg = (v, o) => {
  const svg = newSvg();
  draw(svg, v, o);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  return svg;
};
// Inputs a one-click fix edits, and color picker ↔ hex pairs
const fixIds = () => $('modeBatch').checked ? ['bPrefix', 'bSuffix'] : ['value'];
const COLOR_PAIRS = [['lineColor', 'lineColorHex'], ['background', 'backgroundHex']];
// Show item i in single view
const openItem = i => { cur = i; $('viewOne').checked = true; render(); };

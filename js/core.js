// Shared helpers and the list of saved fields
const $ = id => document.getElementById(id);
const out = $('out');
// Display options are entered in mm / pt; drawing works in CSS px (1/96 inch)
const PX_PER_MM = 96 / 25.4, PX_PER_PT = 96 / 72;
const mmPx = (id, d = 0) => (+$(id).value || d) * PX_PER_MM;
const ptPx = (id, d = 0) => (+$(id).value || d) * PX_PER_PT;

// Fonts shipped with the site (fonts/*.js, base64, so they also work over file:// and inside
// exported SVGs): family → its @font-face rule
const EMBEDDED_FONTS = {};
const fontFace = (family, base64, type, format) =>
  `@font-face{font-family:"${family}";src:url(data:font/${type};base64,${base64}) format("${format}")}`;
if (window.OCRB_BASE64) EMBEDDED_FONTS['OCR-B'] = fontFace('OCR-B', window.OCRB_BASE64, 'otf', 'opentype');
if (window.OPENSANS_BASE64) EMBEDDED_FONTS['Open Sans'] = fontFace('Open Sans', window.OPENSANS_BASE64, 'woff2', 'woff2');
document.head.appendChild(Object.assign(document.createElement('style'),
  { textContent: Object.values(EMBEDDED_FONTS).join('') }));
// The embedded face the chosen font uses, if any
const embeddedFace = () =>
  Object.entries(EMBEDDED_FONTS).find(([family]) => $('font').value.includes(family))?.[1] || '';
// Content inputs (both modes) and display options (「恢復預設」 resets these)
const CONTENT_IDS = ['value', 'bPrefix', 'bSuffix', 'bStart', 'bEnd', 'bStep'];
const DISPLAY_FIELDS = ['barWidth', 'height', 'font', 'fontSize', 'fontAuto', 'textGap', 'marginY', 'marginX', 'marginAuto', 'sizeLock',
                        'ecLevel', 'cellSize', 'qrMargin', 'lineColor', 'background', 'transparent',
                        'sizeUnit'];
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

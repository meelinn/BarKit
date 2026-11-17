// Barcode formats: validation rules, hints, one-click fixes
// One pattern for every format: what can be typed; GS1 formats also say the
// check digit is optional (it is calculated automatically)
// GS1 numeric formats: digits before the check digit (the check digit is optional)
const DATA_LEN = { EAN13: 12, EAN8: 7, UPC: 11, ITF14: 13 };
const HINTS = { CODE39: '可用 A–Z、0–9、空格，以及 - . $ / + %' };
for (const [f, n] of Object.entries(DATA_LEN)) HINTS[f] = `${n} 位數字，第 ${n + 1} 位檢查碼可不填，會自動算出`;

// Display names, matching the format select
const NAMES = Object.fromEntries([...$('format').options].map(op => [op.value, op.text]));

// GS1 mod-10 check digit: weights 3,1,3,… from the rightmost data digit
function gs1CheckDigit(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += +data[data.length - 1 - i] * (i % 2 ? 1 : 3);
  return (10 - sum % 10) % 10;
}

// Specific reason a value can't be encoded, or '' if it looks fine
function checkValue(format, v) {
  const n = DATA_LEN[format], name = NAMES[format];
  // Line breaks (whole text box as one barcode): only QR can hold them
  if (format !== 'QR' && v.includes('\n')) return '條碼不能換行，要分成多筆請勾選「每行一筆」';
  // Unsupported characters first, naming them
  const bad = BAD_CHAR[format] && [...v].filter(BAD_CHAR[format]);
  if (bad && bad.length) {
    if (n) return `${name} 只能是數字，${quoteChars(bad)}不是數字`;
    if (format === 'CODE128') return `CODE128 不支援${quoteChars(bad)}，只能用英文、數字和鍵盤上的符號`;
    return `CODE39 不支援${quoteChars(bad)}，${HINTS.CODE39.replace('可用', '只能用')}`;
  }
  if (format === 'CODE39' && /[a-z]/.test(v)) return `CODE39 只能用大寫英文，請把${quoteChars(v.match(/[a-z]/g))}改成大寫`;
  if (n) {
    if (v.length < n) return `${name} 要 ${n} 位數字，還少 ${n - v.length} 位`;
    if (v.length > n + 1) return `${name} 最多 ${n + 1} 位數字，多了 ${v.length - n - 1} 位`;
    if (v.length === n + 1) {
      const c = gs1CheckDigit(v.slice(0, n));
      if (+v[n] !== c) return `檢查碼錯誤：最後一位應為 ${c}，目前是 ${v[n]}`;
    }
  }
  return '';
}

// Per-format input behaviour: example placeholders and mobile keyboard
const INPUT = {
  CODE128: { text: '例如 ABC-12345', prefix: 'ABC-' },
  CODE39:  { text: '例如 ABC-123', prefix: 'ABC-' },
  EAN13:   { text: '例如 471234567890', prefix: '47123456' },
  EAN8:    { text: '例如 4712345', prefix: '471' },
  UPC:     { text: '例如 01234567890', prefix: '0123456' },
  ITF14:   { text: '例如 1471234567890', prefix: '147123456' },
  QR:      { text: '例如 https://example.com', prefix: 'ITEM-' }
};

// Characters a format can't encode. Input is never changed silently: these are
// reported in the error, and the user can apply FIX with one click.
const CODE39_OK = /[0-9A-Z\-. $/+%]/;
const BAD_CHAR = {
  CODE128: ch => ch.charCodeAt(0) > 126 || ch.charCodeAt(0) < 32,
  CODE39:  ch => !CODE39_OK.test(ch.toUpperCase())
};
for (const f in DATA_LEN) BAD_CHAR[f] = ch => !/\d/.test(ch); // GS1 formats: digits only
const quoteChars = chars => [...new Set(chars)].slice(0, 5).map(c => c === ' ' ? '「空格」' : `「${c}」`).join('');

// One-click fix for the current format, or null if nothing can be fixed automatically
function fixFor(format) {
  const bad = BAD_CHAR[format];
  if (!bad) return null;
  const upper = format === 'CODE39';
  return {
    label: upper ? '轉大寫並移除' : '移除不支援字元',
    apply: s => [...(upper ? s.toUpperCase() : s)].filter(ch => ch === '\n' || !bad(ch)).join('')
  };
}

// Placeholders and mobile keyboard follow the selected format
function applyInputHints(format) {
  const cfg = INPUT[format] || INPUT.CODE128;
  $('value').placeholder = cfg.text;
  $('bPrefix').placeholder = `如 ${cfg.prefix}`;
  ['value', 'bPrefix', 'bSuffix'].forEach(id => $(id).inputMode = DATA_LEN[format] ? 'numeric' : 'text');
}

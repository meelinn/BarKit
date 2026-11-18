// Remember settings between visits
const KEY = 'barcode-maker-settings';
// Saved once typing pauses (the text box may hold 1000 lines); also right away
// when the page is hidden or closed, so nothing is lost
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
function saveNow() {
  clearTimeout(saveTimer);
  try {
    const data = { v: 6 };
    fields.forEach(id => data[id] = isToggle($(id)) ? $(id).checked : $(id).value);
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
// Settings saved before v2 hold sizes in px: convert to mm / pt
function migratePx(data) {
  const conv = (id, k, digits) => {
    if (data[id] !== undefined && data[id] !== '' && isFinite(data[id])) data[id] = String(+(data[id] * k).toFixed(digits));
  };
  ['barWidth', 'height', 'marginY', 'marginX', 'cellSize'].forEach(id => conv(id, 1 / PX_PER_MM, 2));
  conv('fontSize', 1 / PX_PER_PT, 1);
}
// Before v4 the side margin was always filled in (v3: in bar widths, older: mm). A margin of 10 bar
// widths was the old default, so it becomes the new automatic one (blank); v3 values go back to mm
function migrateMargin(data) {
  const x = +data.barWidth || 0.33, ok = v => v !== undefined && v !== '' && isFinite(v);
  if (data.v === 3) ['marginX', 'marginY'].forEach(id => { if (ok(data[id])) data[id] = String(+(data[id] * x).toFixed(2)); });
  if (ok(data.marginX) && Math.abs(data.marginX - 10 * x) < .01) data.marginX = '';
}
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY)) || {};
    if (!data.v) migratePx(data);
    if (!(data.v >= 4)) migrateMargin(data);
    // Before v5 the font size was always filled in; the old default 10 pt becomes automatic (blank)
    if (!(data.v >= 5) && +data.fontSize === 10) data.fontSize = '';
    // Before v6 a blank font size / side margin meant automatic; now that's a separate switch
    if (!(data.v >= 6)) [['fontSize', 'fontAuto'], ['marginX', 'marginAuto']].forEach(([id, auto]) => {
      if (!(id in data)) return;
      data[auto] = data[id] === '';
      if (data[id] === '') delete data[id];
    });
    fields.forEach(id => {
      if (!(id in data)) return;
      const el = $(id);
      // Skip saved values that are no longer an option, so the default stays selected
      if (el.tagName === 'SELECT' && ![...el.options].some(op => op.value === data[id])) return;
      isToggle(el) ? (el.checked = data[id]) : (el.value = data[id]);
    });
  } catch {}
}

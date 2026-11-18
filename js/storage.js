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
// Settings saved before v6 (v2: margins in mm, no 自動 switches): a side margin of 10 bar widths
// or a 10 pt font size was the old default, so it becomes automatic
function migrateAuto(data) {
  const x = +data.barWidth || 0.33;
  if ('marginX' in data) data.marginAuto = data.marginX === '' || Math.abs(data.marginX - 10 * x) < .01;
  if ('fontSize' in data) data.fontAuto = data.fontSize === '' || +data.fontSize === 10;
  ['marginX', 'fontSize'].forEach(id => { if (data[id] === '') delete data[id]; });
}
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY)) || {};
    if (!data.v) migratePx(data);
    if (!(data.v >= 6)) migrateAuto(data);
    fields.forEach(id => {
      if (!(id in data)) return;
      const el = $(id);
      // Skip saved values that are no longer an option, so the default stays selected
      if (el.tagName === 'SELECT' && ![...el.options].some(op => op.value === data[id])) return;
      isToggle(el) ? (el.checked = data[id]) : (el.value = data[id]);
    });
  } catch {}
}

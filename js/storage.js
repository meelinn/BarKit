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
    const data = {};
    fields.forEach(id => data[id] = isToggle($(id)) ? $(id).checked : $(id).value);
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY)) || {};
    fields.forEach(id => {
      if (!(id in data)) return;
      const el = $(id);
      // Skip saved values that are no longer an option, so the default stays selected
      if (el.tagName === 'SELECT' && ![...el.options].some(op => op.value === data[id])) return;
      isToggle(el) ? (el.checked = data[id]) : (el.value = data[id]);
    });
  } catch {}
}

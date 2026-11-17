// UI wiring and start-up (loaded last)
// Bootstrap tooltips for icon buttons (title attribute = tooltip text)
// Hover tips only where there is a mouse (on touch screens a tap would leave them stuck open)
if (window.bootstrap && matchMedia('(hover: hover)').matches) document.querySelectorAll('.tip').forEach(el => new bootstrap.Tooltip(el, { trigger: 'hover' }));

// Feedback on the button that was pressed: for ~2 s it shows ✓ (or ✕ on failure)
// and a short word; icon-only buttons just swap their icon. Screen readers get the
// message through a hidden live region. No pop-up in the corner.
// The button keeps its normal content in .flash-lbl (still updated while hidden) and
// shows the feedback in .flash-msg; nothing has to be restored afterwards.
function flash(btn, text, ok = true, detail = '') {
  if (!btn) return;
  $('srStatus').textContent = detail || text;
  let lbl = btn.querySelector(':scope > .flash-lbl'), msg = btn.querySelector(':scope > .flash-msg');
  if (!msg) {
    lbl = Object.assign(document.createElement('span'), { className: 'flash-lbl' });
    lbl.append(...btn.childNodes);
    msg = Object.assign(document.createElement('span'), { className: 'flash-msg', hidden: true });
    btn.append(lbl, msg);
  }
  const iconOnly = !lbl.textContent.trim();
  msg.innerHTML = `<i class="bi ${ok ? 'bi-check-lg' : 'bi-x-lg'}${iconOnly ? '' : ' me-1'}"></i>`;
  if (!iconOnly) msg.append(text);
  lbl.hidden = true;
  msg.hidden = false;
  btn.classList.toggle('text-success', ok && iconOnly);
  btn.classList.toggle('text-danger', !ok);
  if (detail) {
    if (btn._title === undefined) btn._title = btn.getAttribute('title');
    btn.title = detail;
  }
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => {
    lbl.hidden = false;
    msg.hidden = true;
    btn.classList.remove('text-success', 'text-danger');
    if (btn._title !== undefined) {
      btn._title ? (btn.title = btn._title) : btn.removeAttribute('title');
      delete btn._title;
    }
  }, 2000);
}
// Clear content only (both input modes); display options stay
$('clearConfirm').onclick = () => {
  CONTENT_IDS.forEach(id => $(id).value = '');
  cur = 0;
  render();
};
// Switching unit converts the typed size (registered before render, which fills the other side)
$('sizeUnit').addEventListener('input', () => {
  const v = +$(sizeSide).value;
  if (v) $(sizeSide).value = fmtSize(isPx() ? v / MM_PER_PX : v * MM_PER_PX);
});

$('sizeClear').onclick = () => {
  $('imgW').value = $('imgH').value = '';
  render();
};

// Reset every display option (incl. output size) to the defaults written in the HTML
$('resetDisplay').onclick = () => {
  DISPLAY_FIELDS.forEach(id => {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = el.defaultChecked;
    else if (el.tagName === 'SELECT')
      el.value = ([...el.options].find(op => op.defaultSelected) || el.options[0]).value;
    else el.value = el.defaultValue;
  });
  sizeSide = 'imgW';
  render();
};

// GS1 100% size: narrowest bar 0.33 mm, nominal bar height, quiet zones per spec.
// Margins/height are set in px relative to the line width, then the output width is
// chosen so one line-width px becomes exactly 0.33 mm.
$('gs1Btn').onclick = () => {
  const g = GS1[opts().format];
  if (!g) return;
  const bw = +$('barWidth').value || 2;
  $('height').value = Math.round(g.barH / GS1_X * bw);
  $('marginX').value = g.margin * bw;
  render();
  const w = parseFloat(out.getAttribute('width'));
  if (!w) return;
  $('imgW').value = isPx() ? fmtSize(mmToUnit(w / bw * GS1_X)) : (w / bw * GS1_X).toFixed(2);
  sizeSide = 'imgW';
  render();
  const u = $('sizeUnit').value;
  flash($('gs1Btn'), '已套用', true, `已套用 GS1 標準：條碼高度 ${$('height').value} px、左右邊距 ${$('marginX').value} px、` +
        `輸出 ${$('imgW').value} × ${$('imgH').value} ${u}`);
};

// Jump to the first other item with an error
document.querySelectorAll('.other-err-go').forEach(b => b.onclick = () => {
  if (others.length) openItem(others[0]);
});

// One-click fix: remove (or uppercase) unsupported characters. With one item per line only
// the item on screen is fixed (each bad line on its own); otherwise the whole input
$('fixBtn').onclick = () => {
  if (needsJoin()) {
    $('value').value = $('value').value.split('\n').map(s => s.trim()).join('');
    return render();
  }
  const fix = fixFor($('format').value);
  if (!fix) return;
  if ($('modeText').checked && $('multiLine').checked) {
    const rows = $('value').value.split('\n');
    let n = -1;
    const row = rows.findIndex(s => s.trim() && ++n === cur); // the cur-th non-empty line
    if (row < 0) return;
    rows[row] = fix.apply(rows[row]);
    $('value').value = rows.join('\n');
  } else {
    fixIds().forEach(id => { $(id).value = fix.apply($(id).value); });
  }
  render();
};

// Jump to a bad line: select it in the textarea and show that item
$('lineErrGo').onclick = () => {
  const ta = $('value'), all = ta.value.split('\n');
  const start = all.slice(0, lineErrFirst - 1).join('\n').length + (lineErrFirst > 1 ? 1 : 0);
  ta.focus();
  ta.setSelectionRange(start, start + all[lineErrFirst - 1].length);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 24;
  ta.scrollTop = Math.max(0, (lineErrFirst - 2) * lh);
  const idx = itemLines().indexOf(lineErrFirst);
  if (idx >= 0) openItem(idx);
};

// Arrow keys move between thumbnails in the whole-set view
$('gridView').addEventListener('keydown', e => {
  const items = [...$('gridView').querySelectorAll('.grid-item')];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  const cols = Math.max(1, Math.round($('gridView').clientWidth / items[0].offsetWidth));
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (!step) return;
  e.preventDefault();
  items[Math.max(0, Math.min(items.length - 1, i + step))].focus();
});

// Picking items in the whole-set view
$('gridView').addEventListener('change', e => {
  const pick = e.target.closest('.grid-pick');
  if (!pick) return;
  const i = +pick.dataset.i;
  pick.checked ? picked.add(i) : picked.delete(i);
  pick.closest('.grid-cell').classList.toggle('picked', pick.checked);
  paintGridBar(lines());
});
$('selAll').onclick = () => {
  const list = lines(), all = picked.size === list.length;
  picked = all ? new Set() : new Set(list.keys());
  $('gridView').querySelectorAll('.grid-pick').forEach(c => {
    c.checked = !all;
    c.closest('.grid-cell').classList.toggle('picked', !all);
  });
  paintGridBar(list);
};
$('selPrint').onclick = () => {
  printList = pickedList();
  if (window.bootstrap) bootstrap.Modal.getOrCreateInstance($('printModal')).show();
  else printLabels();
};

// 轉為自訂內容: copy the generated list into the text box
$('bPreview').addEventListener('click', e => {
  if (!e.target.closest('#toText')) return;
  $('value').value = lines().join('\n');
  $('modeText').checked = true;
  $('multiLine').checked = true;
  cur = 0;
  render();
  $('value').focus();
});

// Clicking a thumbnail opens that item in single view
$('gridView').addEventListener('click', e => {
  const item = e.target.closest('.grid-item');
  if (!item) return;
  openItem(+item.dataset.i);
});

// Typing a hex code (#RRGGBB or RRGGBB) updates the color picker
COLOR_PAIRS.forEach(([c, h]) => {
  $(h).addEventListener('input', () => {
    const m = $(h).value.trim().match(/^#?([0-9a-f]{6})$/i);
    if (m) { $(c).value = '#' + m[1].toLowerCase(); render(); }
  });
  $(h).addEventListener('blur', () => { $(h).value = $(c).value; }); // drop partial input
});

// Day/night switch (top-right); the choice is remembered
const setTheme = t => {
  document.documentElement.dataset.bsTheme = t;
  try { localStorage.setItem('barcode-maker-theme', t); } catch {}
};
$('themeLight').checked = document.documentElement.dataset.bsTheme !== 'dark';
$('themeDark').checked = !$('themeLight').checked;
document.querySelectorAll('[name="theme"]').forEach(r => r.addEventListener('change', () => setTheme($('themeDark').checked ? 'dark' : 'light')));
// Main color (top right): retro green, fresh blue or minimal white; remembered.
// The mascot pictures have a color version per palette (img/<name>-blue.svg …); the strip
// (data-holiday) also has a holiday version (img/pom-pixel-xmas-blue.svg …, see theme.js).
const PALETTES = { paletteGreen: 'green', paletteBlue: 'blue', paletteWhite: 'white' };
function applyPalette(p) {
  p === 'green' ? delete document.documentElement.dataset.bkPalette : (document.documentElement.dataset.bkPalette = p);
  const holiday = document.documentElement.dataset.bkHoliday;
  document.querySelectorAll('img[data-pal]').forEach(img => {
    const h = holiday && 'holiday' in img.dataset ? '-' + holiday : '';
    img.src = `img/${img.dataset.pal}${h}${p === 'green' ? '' : '-' + p}.svg`;
  });
}
const currentPalette = document.documentElement.dataset.bkPalette || 'green';
Object.entries(PALETTES).forEach(([id, p]) => {
  $(id).checked = p === currentPalette;
  $(id).addEventListener('change', () => {
    applyPalette(p);
    try { localStorage.setItem('barcode-maker-palette', p); } catch {}
  });
});
applyPalette(currentPalette);
// Phones: only the current swatch and the current day/night button show (CSS);
// tapping it switches to the next choice
const isPhone = matchMedia('(max-width: 575.98px)');
const cycleOnTap = name => {
  const radios = [...document.querySelectorAll(`[name="${name}"]`)];
  radios.forEach((r, i) => document.querySelector(`label[for="${r.id}"]`).addEventListener('click', e => {
    if (!isPhone.matches || !r.checked) return;
    e.preventDefault();
    const next = radios[(i + 1) % radios.length];
    next.checked = true;
    next.dispatchEvent(new Event('change', { bubbles: true }));
  }));
};
cycleOnTap('palette');
cycleOnTap('theme');

// Jump to the typed item (Enter or leaving the field); out-of-range is clamped
const jumpTo = () => {
  const n = lines().length, v = Math.round(+$('posInput').value);
  if (!n || !v) { $('posInput').value = cur + 1; return; }
  cur = Math.max(0, Math.min(n - 1, v - 1));
  $('posInput').value = cur + 1;
  render();
};
$('posInput').addEventListener('change', jumpTo);
$('posInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); jumpTo(); } });


$('prev').onclick = () => go(-1);
$('next').onclick = () => go(1);
// Arrow keys switch preview, except while typing in a field
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select, .dropdown-menu, .modal') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (!$('gridView').hidden || document.querySelector('.modal.show')) return; // grid has its own arrow keys
  if (e.key === 'ArrowLeft') go(-1);
  if (e.key === 'ArrowRight') go(1);
});
// Remember which size side the user typed (registered before render, which fills the other)
['imgW', 'imgH'].forEach(id => $(id).addEventListener('input', () => { sizeSide = id; }));
// Content fields take no spaces (typed or pasted); line breaks stay. Registered before render
const SPACES = /[ \t\u3000]/g; // half-width space, tab, full-width space
CONTENT_IDS.forEach(id => $(id).addEventListener('input', () => {
  const el = $(id), clean = el.value.replace(SPACES, '');
  if (clean === el.value) return;
  const caret = el.value.slice(0, el.selectionStart).replace(SPACES, '').length;
  el.value = clean;
  el.setSelectionRange(caret, caret);
}));
fields.forEach(id => $(id).addEventListener('input', render));
load();
if (!$('imgW').value && $('imgH').value) sizeSide = 'imgH';
render();
// Re-check the zoom cap when the window size changes
let zoomTimer;
window.addEventListener('resize', () => { clearTimeout(zoomTimer); zoomTimer = setTimeout(applyZoom, 100); });
// Re-render once OCR-B is ready so text width is measured with the real font
if (OCRB_FACE) document.fonts.load('20px "OCR-B"').then(() => { checks.clear(); gridKey = ''; render(); }, () => {});

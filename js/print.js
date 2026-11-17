// Label sheet printing
// Label sheet layout: A4 split evenly into columns × rows (edge-to-edge sheets)
const LAYOUTS = { '3x8': [3, 8], '2x7': [2, 7], '3x10': [3, 10], '4x10': [4, 10] };
function getLayout() {
  const v = $('printLayout').value;
  const [cols, rows] = LAYOUTS[v] || [
    Math.max(1, Math.min(8, Math.round(+$('printCols').value) || 3)),
    Math.max(1, Math.min(30, Math.round(+$('printRows').value) || 8))];
  const per = cols * rows;
  // Start on a later cell when the first labels of the sheet are used up
  const skip = Math.max(0, Math.min(per - 1, (Math.round(+$('printStart').value) || 1) - 1));
  return { cols, rows, per, skip, w: 210 / cols, h: 297 / rows };
}
const mm = v => +v.toFixed(1); // 37.125 → 37.1
const pageCount = n => { const L = getLayout(); return Math.ceil((n + L.skip) / L.per); };

// Items to print: the selection from the whole-set view, else everything;
// starting from item 「從第 n 筆」
let printList = null;
const allPrintItems = () => printList || lines();
const printFrom = () => Math.max(1, Math.min(allPrintItems().length, Math.round(+$('printFrom').value) || 1));
const getPrintList = () => allPrintItems().slice(printFrom() - 1);

function printLabels() {
  const o = opts(), list = getPrintList(), L = getLayout();
  const sheet = $('sheet');
  sheet.innerHTML = '';
  sheet.style.setProperty('--off-x', (+$('printOffX').value || 0) + 'mm');
  sheet.style.setProperty('--off-y', (+$('printOffY').value || 0) + 'mm');
  let page;
  const newPage = () => {
    const p = Object.assign(document.createElement('div'), { className: 'page' });
    p.appendChild(page = Object.assign(document.createElement('div'), { className: 'page-grid' }));
    page.style.gridTemplateColumns = `repeat(${L.cols}, ${L.w}mm)`;
    page.style.gridTemplateRows = `repeat(${L.rows}, ${L.h}mm)`;
    sheet.appendChild(p);
  };
  // Empty cells for the labels already used on the first sheet
  const cells = [...Array(L.skip).fill(null), ...list];
  cells.forEach((v, i) => {
    if (i % L.per === 0) newPage();
    const label = Object.assign(document.createElement('div'), { className: 'label' });
    if (v === null) { page.appendChild(label); return; }
    label.appendChild(fluidSvg(v, o));
    page.appendChild(label);
  });
  window.print();
  printList = null; // next print (from the toolbar) uses the whole list again
}


// Print dialog: show what will print, then print once the modal has closed
function updatePrintDialog() {
  const L = getLayout(), n = getPrintList().length;
  $('printCustom').hidden = $('printLayout').value !== 'custom';
  $('printStart').max = L.per;
  $('printFrom').max = allPrintItems().length;
  // One fact per line, no full stops
  $('printInfo').replaceChildren(...[
    `每張 ${mm(L.w)} × ${mm(L.h)} mm`, `共 ${n} 張，${pageCount(n)} 頁`
  ].map(t => Object.assign(document.createElement('div'), { textContent: t })));
  renderSheetPreview();
}
$('printModal').addEventListener('show.bs.modal', updatePrintDialog);
['printLayout', 'printStart', 'printFrom', 'printCols', 'printRows'].forEach(id => $(id).addEventListener('input', updatePrintDialog));
$('print').addEventListener('click', () => { printList = null; });
// First page in miniature (0.8 px per mm), shifted by the offset fields
function renderSheetPreview() {
  const grid = $('sheetPreview'), o = opts(), L = getLayout();
  const list = getPrintList().slice(0, L.per - L.skip);
  grid.style.gridTemplateColumns = `repeat(${L.cols}, ${L.w * 0.8}px)`;
  grid.style.gridTemplateRows = `repeat(${L.rows}, ${L.h * 0.8}px)`;
  grid.replaceChildren();
  for (let c = 0; c < L.per; c++) {
    const cell = document.createElement('div'), i = c - L.skip;
    if (i < 0) cell.className = 'used'; // already used on the sheet
    else if (list[i] !== undefined) {
      try { cell.appendChild(fluidSvg(list[i], { ...o, thumb: true })); } catch {}
    }
    grid.appendChild(cell);
  }
  shiftPreview();
}
// Miniature follows the offset fields (0.8 px per mm)
const shiftPreview = () => {
  $('sheetPreview').style.transform = `translate(${(+$('printOffX').value || 0) * 0.8}px, ${(+$('printOffY').value || 0) * 0.8}px)`;
};
['printOffX', 'printOffY'].forEach(id => $(id).addEventListener('input', shiftPreview));
$('printConfirm').onclick = () => {
  const modal = window.bootstrap && bootstrap.Modal.getInstance($('printModal'));
  if (!modal) return printLabels();
  $('printModal').addEventListener('hidden.bs.modal', printLabels, { once: true });
  modal.hide();
};

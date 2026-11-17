// Theme: saved choice, else follow the system (Bootstrap 5.3 color modes);
// palette (main color): retro green (default), fresh blue or minimal white
(() => {
  let t = null, p = null;
  try { t = localStorage.getItem('barcode-maker-theme'); p = localStorage.getItem('barcode-maker-palette'); } catch {}
  if (p === 'blue' || p === 'white') document.documentElement.dataset.bkPalette = p;
  document.documentElement.dataset.bsTheme =
    t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
})();

// Holidays: a seasonal accent color and a prop for the mascot, on top of any palette.
// Fixed dates repeat yearly (MM-DD); lunar ones are listed per year (YYYY-MM-DD).
// Preview any of them with ?holiday=newyear | midautumn | halloween | xmas
(() => {
  const HOLIDAYS = [
    ['halloween', '10-25', '10-31'],
    ['xmas', '12-20', '12-26'],
    ['newyear', '2027-02-03', '2027-02-11'], ['newyear', '2028-01-23', '2028-01-31'],
    ['newyear', '2029-02-10', '2029-02-18'], ['newyear', '2030-01-31', '2030-02-08'],
    ['midautumn', '2026-09-22', '2026-09-26'], ['midautumn', '2027-09-12', '2027-09-16'],
    ['midautumn', '2028-09-30', '2028-10-04'], ['midautumn', '2029-09-19', '2029-09-23'],
    ['midautumn', '2030-09-09', '2030-09-13'],
  ];
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, ymd = `${d.getFullYear()}-${md}`;
  const today = from => from.length === 5 ? md : ymd;
  const forced = new URLSearchParams(location.search).get('holiday');
  const hit = forced ? HOLIDAYS.find(([id]) => id === forced)
    : HOLIDAYS.find(([, from, to]) => today(from) >= from && today(from) <= to);
  if (hit) document.documentElement.dataset.bkHoliday = hit[0];
})();

// Theme: saved choice, else follow the system (Bootstrap 5.3 color modes);
// palette (main color): retro green (default), fresh blue or minimal white
(() => {
  let t = null, p = null;
  try { t = localStorage.getItem('barcode-maker-theme'); p = localStorage.getItem('barcode-maker-palette'); } catch {}
  if (p === 'blue' || p === 'white') document.documentElement.dataset.bkPalette = p;
  document.documentElement.dataset.bsTheme =
    t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
})();

// Theme: saved choice, else follow the system (Bootstrap 5.3 color modes)
(() => {
  let t = null;
  try { t = localStorage.getItem('barcode-maker-theme'); } catch {}
  document.documentElement.dataset.bsTheme =
    t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
})();

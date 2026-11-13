// Runs before the first paint. Light is the default whatever the OS prefers; dark only
// when the visitor chose it with the "Dark theme" button (remembered if storage works).
'use strict';
(() => {
  let saved = null;
  try { saved = window.localStorage.getItem('warehouse-theme'); } catch { saved = null; }
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
})();

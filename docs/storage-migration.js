'use strict';
// Copy only known app-owned keys; retain conflicts and originals for explicit recovery.
(() => {
 const exact = {"warehouse-theme": "issue_warehouse_theme_v1", "warehouse-query-v1": "issue_warehouse_guest_query_v1", "warehouse:preview-paused": "issue_warehouse_preview_paused_v1"}, prefixes = {"issue-warehouse:v1:": "issue_warehouse_profiles_v1:", "issue-warehouse:install-dismissed:v1": "issue_warehouse_install_dismissed_v1", "issue-warehouse:quick:v1:": "issue_warehouse_quick_v1:"};
 for (const name of ['localStorage','sessionStorage']) {
  try {
   const store=window[name], keys=Array.from({length:store.length},(_,i)=>store.key(i));
   for (const key of keys) {
    const prefix=Object.keys(prefixes).find(p=>key.startsWith(p));
    const target=exact[key] || (prefix ? prefixes[prefix]+key.slice(prefix.length) : null);
    if(!target) continue;
    const value=store.getItem(key);
    if(value===null || value.length>262144) continue;
    const existing=store.getItem(target);
    if(existing===null) store.setItem(target,value);
    if(store.getItem(target)===value) store.removeItem(key);
    else document.documentElement.dataset.storageRecovery='conflict';
   }
  } catch { document.documentElement.dataset.storageRecovery='unavailable'; }
 }
})();

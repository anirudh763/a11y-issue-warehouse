/* Real query/filter/split metadata and optional original backlog bytes. Explicit Save only. */
'use strict';
(() => {
 const store=window.WorkspaceStore,$=id=>document.getElementById(id);let epoch=0,resetting=false;
 function readCurrent(){
  const cohort=window.WarehouseExplorer?.read(),query=window.WarehouseSQL?.readCurrent();
  if(!cohort||!query||!window.WarehouseSQL.isVerified())return null;
  const backlog=window.PrivateBacklog?.readCurrent?.()||null;
  return {kind:query.result?'query':query.split?'split':'filter',title:backlog?'Private backlog · '+backlog.summary.rows+' rows':query.result?'SQL query · '+query.result.rows+' rows':query.split?'Seeded split · '+query.split.rows+' rows':'Issue cohort · '+cohort.filtered_rows+' records',payload:{schema:'issue-warehouse/1',cohort,query,backlog}};
 }
 function changed(){if(resetting)return;const current=readCurrent();if(JSON.stringify(current)!==JSON.stringify(store.state.current))store.capture(current,{autosave:false});}
 function clearPrivate(server=true){
  if(resetting)return;resetting=true;epoch++;
  window.ProductSurface.clearPrivate({preservePendingGuest:!server&&!!window.ProductSurface.profiles.current()});window.WarehouseSQL.reset();window.WarehouseExplorer?.clear();window.WarehousePages.reset();
  dispatchEvent(new CustomEvent('warehouse-private-reset',{detail:{server}}));
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  for(const field of document.querySelectorAll('dialog input,dialog textarea')){if(['checkbox','radio'].includes(field.type))field.checked=false;else field.value='';}
  for(const form of document.querySelectorAll('server-workspace form'))form.reset();
  store.capture(null);resetting=false;
 }
 store.register({readCurrent,readArtifacts(){const artifact=window.PrivateBacklog?.readArtifact?.();return artifact?[artifact]:[];},onLogout(){clearPrivate(true);},
  async restore(saved,files,isCurrent){
   const value=saved.payload,ticket=epoch,current=()=>ticket===epoch&&isCurrent();
   if(value?.schema!=='issue-warehouse/1'||!['query','filter','split'].includes(saved.kind)||!value.query||!value.cohort)throw Error('Unsupported Warehouse record.');
   if(typeof value.cohort.filters!=='string'||value.cohort.filters.length>8192||typeof value.query.sql!=='string'||new TextEncoder().encode(value.query.sql).length>4096||typeof value.query.seed!=='string'||value.query.seed.length>128)throw Error('Saved query, filters or split seed exceed supported bounds.');
   if(!window.WarehouseSQL.isVerified())throw Error('Wait for the current public snapshot to verify, then retry Open.');
   if(value.cohort.source_sha256!==window.WarehouseExplorer.read()?.source_sha256)throw Error('The published snapshot changed. Export the stored run to retain its source hash; re-import its query explicitly for the new snapshot.');
   const filters=window.WarehouseExplorer.normalizeFilters(value.cohort.filters);
   if(value.backlog){if(!files[0])throw Error('The saved backlog source is missing.');await window.PrivateBacklog.restoreSource(files[0],value.backlog,current);if(!current())return;}else window.PrivateBacklog.clear();
   if(!current())return;
   window.WarehouseSQL.restore(value.query);window.WarehousePages.navigate('/workbench');window.WarehouseExplorer.restore(filters);
   $('workbench-sql').open=!!value.query.sql;$('workbench-import').open=!!value.backlog;changed();
  }
 });
 store.subscribe(state=>{window.WarehouseSQL?.setPrincipal(state.session?.principal_id||null,state.session?.migrated_from);});
 window.ProductSurface.profiles.subscribe(()=>clearPrivate(false));
 addEventListener('warehouse-change',changed);addEventListener('warehouse-ready',changed);addEventListener('warehouse-trust',changed);
 const recovery=document.createElement('details');recovery.className='panel';const recoverySummary=document.createElement('summary');recoverySummary.textContent='Retained tab query';const recoveryHint=document.createElement('p');recoveryHint.textContent='Older unscoped drafts are never restored automatically on a server host. Import the old copy explicitly; it remains in tab storage.';const recoveryButton=document.createElement('button');recoveryButton.type='button';recoveryButton.className='btn';recoveryButton.id='import-legacy-query';recoveryButton.textContent='Import retained query';const recoveryStatus=document.createElement('p');recoveryStatus.id='legacy-query-status';recoveryStatus.setAttribute('role','status');recovery.append(recoverySummary,recoveryHint,recoveryButton,recoveryStatus);$('settings-browser').append(recovery);
 $('import-legacy-query').onclick=()=>{try{window.WarehouseSQL.importLegacy();window.WarehousePages.navigate('/workbench');$('workbench-sql').open=true;}catch(error){$('legacy-query-status').textContent=error.message;}};
 window.WarehousePrivate={clear:clearPrivate,readCurrent,get epoch(){return epoch;}};
})();

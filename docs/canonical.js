/* Canonical navigation; legacy research routes keep their original tools. */
'use strict';
(() => {
 const $=id=>document.getElementById(id), main=$('workspace');
 const basePath=new URL('./',document.currentScript.src).pathname,prefixMode=basePath!=='/';
 const aliases={overview:'overview',workbench:'workbench',reports:'reports',settings:'settings',taxonomy:'taxonomy',export:'manifest',system:'system'};
 const canonicalRoute=()=>!location.hash||/^#\/(overview|workbench|reports|settings)$/.test(location.hash);
 function href(path){const url=new URL(path,location.href),name=url.pathname.replace(/^\//,'');return prefixMode&&aliases[name]?basePath+url.search+'#/'+aliases[name]:url.pathname+url.search+url.hash;}
 main.prepend($('canonical-pages-template').content.cloneNode(true));
 for(const a of document.querySelectorAll('a[href^="/"]'))a.setAttribute('href',href(a.getAttribute('href')));

 const work=$('screen-explore');
 const save=document.createElement('server-workspace');save.setAttribute('view','workbench');$('h-explore').closest('.screen-head').after(save);
 const sqlDetail=document.createElement('details');sqlDetail.id='workbench-sql';sqlDetail.className='panel';const sqlSummary=document.createElement('summary');sqlSummary.textContent='Read-only SQL';sqlDetail.append(sqlSummary);document.querySelector('.toolbar').after(sqlDetail);
 const importDetail=document.createElement('details');importDetail.id='workbench-import';importDetail.className='panel';const importSummary=document.createElement('summary');importSummary.textContent='Private issue import and analysis';const importHint=document.createElement('p');importHint.className='small';importHint.textContent='CSV or JSON, up to 2 MiB and 2,000 rows. Analysis stays local. Save current run uploads selected input to this private server workspace.';importDetail.append(importSummary,importHint);sqlDetail.after(importDetail);
 const scenarioDetail=document.createElement('details');scenarioDetail.id='workbench-scenarios';scenarioDetail.className='panel';const scenarioSummary=document.createElement('summary');scenarioSummary.textContent='Sample scenarios';scenarioDetail.append(scenarioSummary,document.querySelector('.scenario-panel'));importDetail.after(scenarioDetail);
 const timeline=document.querySelector('.timeline-wrap'),timelineHome=document.createComment('Timeline home');timeline.before(timelineHome);const timelineDetail=document.createElement('details');timelineDetail.id='cohort-timeline';timelineDetail.className='panel';const timelineSummary=document.createElement('summary');timelineSummary.textContent='Opened by year';timelineDetail.append(timelineSummary);timelineHome.after(timelineDetail);
 const toolGroup=document.createElement('div');toolGroup.className='workbench-tool-group';sqlDetail.before(toolGroup);toolGroup.append(sqlDetail,importDetail,scenarioDetail);sqlSummary.textContent='SQL';sqlSummary.setAttribute('aria-label','Read-only SQL');importSummary.textContent='Private import';scenarioSummary.textContent='Samples';
 const cohortOptions=document.createElement('details');cohortOptions.id='cohort-options';cohortOptions.className='panel';const optionsSummary=document.createElement('summary');optionsSummary.textContent='Cohort options';cohortOptions.append(optionsSummary);toolGroup.after(cohortOptions);
 const optionNodes=[$('sort').closest('.field'),$('copy-link').closest('.field'),$('quick-filters'),$('quick-csv').closest('.download-bar'),$('download-status'),timelineDetail],optionHomes=optionNodes.map(node=>{const marker=document.createComment('Cohort option home');node.before(marker);return marker;});let optionsMounted=false;
 const nodes=['screen-sql','screen-manifest','screen-system'];const homes=new Map(nodes.map(id=>{const n=$(id),marker=document.createComment(id+' home');n.before(marker);return[id,marker];}));
 const resultNodes=[document.querySelector('.sql-results'),document.querySelector('.sql-split')];const resultHomes=resultNodes.map(n=>{const marker=document.createComment('SQL output home');n.before(marker);return marker;});
 let current='overview';
 function move(id,host){const n=$(id);if(n.parentElement!==host)host.append(n);n.hidden=false;$(n.getAttribute('aria-labelledby')).hidden=true;n.classList.add('embedded-tool');}
 function navigate(path){path=href(path);if(path!==location.pathname+location.search+location.hash)history.pushState(null,'',path);dispatchEvent(new Event('warehouse-navigate'));[...main.querySelectorAll('h1')].find(h=>h.getClientRects().length)?.focus({preventScroll:true});window.scrollTo(0,0);}
 function show(next){
  current=next;save.hidden=!canonicalRoute();toolGroup.hidden=!canonicalRoute();
  const canonicalWorkbench=next==='explore'&&canonicalRoute();const splitDisclosure=document.querySelector('.sql-split');if(canonicalRoute()&&!splitDisclosure.dataset.canonicalInitialized){splitDisclosure.open=false;splitDisclosure.dataset.canonicalInitialized='true';}for(const detail of [sqlDetail,importDetail,scenarioDetail])detail.hidden=!canonicalRoute();
  if(canonicalWorkbench){if(!optionsMounted){optionNodes.forEach(node=>cohortOptions.append(node));optionsMounted=true;}cohortOptions.hidden=false;if(!$('facets').dataset.canonicalInitialized){$('facets').open=false;$('facets').dataset.canonicalInitialized='true';}timelineDetail.append(timeline);timelineDetail.hidden=false;}else{if(optionsMounted){optionNodes.forEach((node,i)=>optionHomes[i].after(node));optionsMounted=false;}cohortOptions.hidden=true;if(timelineHome.nextSibling!==timeline)timelineHome.after(timeline);timelineDetail.hidden=true;}
  const local=document.querySelector('.local-work-area');if(local)(!canonicalRoute()?document.querySelector('.loc'):$('settings-local')).append(local);
  const footer=document.querySelector('.launch-tools');if(footer)(!canonicalRoute()?document.body:$('settings-offline')).append(footer);
  const panel=document.querySelector('.backlog-panel');if(panel){importDetail.append(panel);panel.hidden=false;}
  for(const[id,marker]of homes){if(marker.nextSibling!==$(id))marker.after($(id));$(id).classList.remove('embedded-tool');$($(id).getAttribute('aria-labelledby')).hidden=false;$(id).hidden=id!==`screen-${next}`;}
  resultNodes.forEach((n,i)=>{if(resultHomes[i].nextSibling!==n)resultHomes[i].after(n);});
  if(next==='explore'&&canonicalRoute())move('screen-sql',sqlDetail);
  if(next==='reports'){move('screen-manifest',$('reports-manifest'));resultNodes.forEach(n=>$('reports-results').append(n));}
  if(next==='settings')move('screen-system',$('settings-diagnostics'));
  const active=['sql','explore'].includes(next)?'workbench':['manifest','taxonomy','methods'].includes(next)?'reports':['system'].includes(next)?'settings':next;
  for(const a of document.querySelectorAll('a[data-canonical]')){if(a.dataset.canonical===active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  document.documentElement.dataset.canonical=active;
  refresh();
 }
 function refresh(){
  const data=window.WarehouseExplorer?.read();
  if(data){$('overview-status').textContent=`${data.total_rows.toLocaleString()} public records · ${data.filtered_rows.toLocaleString()} in the current cohort`;$('overview-rows').textContent=data.total_rows.toLocaleString();$('overview-collected').textContent=data.collected_at;$('overview-hash').textContent=data.source_sha256||'Unavailable';$('overview-trust').textContent=window.WarehouseSQL?.isVerified()?'Matches the published manifest':'Verification unavailable; trusted exports blocked';}
  const sql=window.WarehouseSQL?.readCurrent?.();const backlog=window.PrivateBacklog?.readCurrent?.();
  $('reports-current').textContent=backlog?`${backlog.summary.rows} imported rows · ${backlog.summary.analyzed ? backlog.summary.selected+' in the selected scope':'not analyzed'}`:sql?.result?`${sql.result.rows} query rows · DuckDB-Wasm ${sql.result.engine}`:sql?.split?`${sql.split.rows} rows assigned once · seed ${sql.seed}`:'No query or private backlog analysis yet.';
 }
 document.addEventListener('click',e=>{const a=e.target.closest('a[data-canonical]');if(!a||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();const sheet=$('menu-sheet');if(sheet.open)sheet.close();navigate('/'+a.dataset.canonical+(['workbench','reports'].includes(a.dataset.canonical)?location.search:''));});
 $('overview-search').addEventListener('input',()=>{const q=$('overview-search').value,found=window.WarehouseExplorer?.search(q)||[];$('overview-search-status').textContent=`${found.length.toLocaleString()} matching records`;$('overview-search-results').replaceChildren(...found.slice(0,3).map(row=>{const li=document.createElement('li');li.textContent=row.repo+' #'+row.number+' · '+row.title;return li;}));});
 $('overview-search-form').addEventListener('submit',e=>{e.preventDefault();navigate('/workbench'+($('overview-search').value?'?q='+encodeURIComponent($('overview-search').value):''));});
 addEventListener('warehouse-change',refresh);addEventListener('warehouse-ready',refresh);addEventListener('warehouse-trust',refresh);
 addEventListener('DOMContentLoaded',()=>{const panel=document.querySelector('.backlog-panel');if(panel){importDetail.append(panel);panel.hidden=false;}const local=document.querySelector('.local-work-area');if(local)$('settings-local').append(local);const footer=document.querySelector('.launch-tools');if(footer)$('settings-offline').append(footer);if(window.ProductSurface.route())window.WarehousePages.legacy();else show(current);});
 window.WarehousePages={show,navigate,href,basePath,prefixMode,isCanonicalRoute:canonicalRoute,legacy(){const panel=document.querySelector('.backlog-panel'),home=document.querySelector('[data-product-page=home]');if(panel&&home){home.after(panel);panel.hidden=!['','#/','#'].includes(location.hash);}const footer=document.querySelector('.launch-tools');if(footer)document.body.append(footer);},reset(){for(const id of ['overview-search'])$(id).value='';$('overview-search-status').textContent='';$('overview-search-results').replaceChildren();$('reports-current').textContent='No query or private backlog analysis yet.';}};
})();

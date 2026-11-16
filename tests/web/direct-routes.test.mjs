import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url), {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'), docs=path.join(root,'docs');
const output=path.join(root,'artifacts/verification/post-restart');
const routes=['/','/taxonomy','/export','/system'], titles=['Dataset','Taxonomy','Export','System'];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const file=path.join(docs,routes.includes(url.pathname)?'index.html':url.pathname);if(!file.startsWith(docs+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',types[path.extname(file)]||'text/plain');fs.createReadStream(file).pipe(res);});
let browser;
try{
 if(!process.env.WAREHOUSE_BASE_URL)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=process.env.WAREHOUSE_BASE_URL||'http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));let scans=0;
 for(const width of [320,768,1440]){
  await page.setViewportSize({width,height:900});
  for(let i=0;i<routes.length;i++){
   await page.goto(base+routes[i]);await page.waitForSelector('html[data-ready=true]');
   assert.equal(await page.locator('main h1:visible').textContent(),titles[i]);
   await page.reload();await page.waitForSelector('html[data-ready=true]');
   assert.equal(await page.locator('main h1:visible').textContent(),titles[i]);assert.match(await page.title(),new RegExp(titles[i]));
   assert.equal(await page.locator('#rail a[aria-current=page]').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),routes[i]+' overflow at '+width);
   await page.evaluate(fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8'));
   assert.deepEqual(await page.evaluate(async()=>(await axe.run(document)).violations.map(v=>v.id)),[],routes[i]+' axe at '+width);scans++;
   await page.screenshot({path:path.join(output,(process.env.WAREHOUSE_BASE_URL?'direct-live-':'direct-')+i+'-'+width+'.png'),fullPage:true});
  }
 }
 await page.goto(base+'/taxonomy');await page.waitForSelector('html[data-ready=true]');
 const categoryCounts=await page.locator('#taxonomy-basis tr[data-category]').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.dataset.category,Number(row.dataset.count)])));
 const raw=JSON.parse(fs.readFileSync(path.join(docs,'data/issues.json'))),M=require(path.join(docs,'model.js'));
 const issues=M.decode(raw).filter(i=>i.sample==='a11y');
 assert.deepEqual(categoryCounts,Object.fromEntries(Object.keys(M.CATEGORY_NAMES).map(key=>[key,issues.filter(i=>i.cats.has(key)).length])));
 await page.goto(base+'/?q=TalkBack');await page.waitForSelector('html[data-ready=true]');
 const count=Number(await page.locator('#count').getAttribute('data-count'));
 const other=await context.newPage();await other.goto(base+'/taxonomy?state=closed');await other.waitForSelector('html[data-ready=true]');
 await page.fill('#q','dark mode');await page.waitForFunction(()=>new URLSearchParams(location.search).get('q')==='dark mode');
 assert.equal(new URL(other.url()).searchParams.get('state'),'closed');
 await page.goto(base+'/export?q=TalkBack');await page.waitForSelector('html[data-ready=true]');
 assert.equal(Number(await page.locator('#manifest-count').getAttribute('data-count')),count);
 const downloading=page.waitForEvent('download');await page.locator('#dl-json').click();const file=await downloading;
 const exported=JSON.parse(fs.readFileSync(await file.path()));assert.equal(exported.count,count);assert.equal(exported.issues.length,count);
 assert.ok(exported.snapshot.data_sha256);assert.ok(exported.issues.every(i=>i.source_url.startsWith('https://github.com/')));assert.match(exported.caveat,/not.*verified bug/);
 await page.goto(base+'/export?q=does-not-match-this-public-snapshot-zzz');await page.waitForSelector('html[data-ready=true]');assert.equal(await page.locator('#dl-json').isDisabled(),true);
 await page.goto(base+'/');await page.waitForSelector('html[data-ready=true]');await page.locator('#rail a[data-route=taxonomy]').click();await page.goBack();assert.equal(new URL(page.url()).pathname,'/');await page.goForward();assert.equal(new URL(page.url()).pathname,'/taxonomy');
 await page.goto(base+'/');await page.waitForSelector('html[data-ready=true]');await page.keyboard.press('Tab');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'h-explore');
 await page.setViewportSize({width:320,height:900});await page.locator('#menu-btn').click();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.id==='menu-btn');
 if(process.env.WAREHOUSE_BASE_URL){
  await page.goto(base+'/system');await page.waitForFunction(()=>document.querySelector('#system-status').textContent.startsWith('Updated'));
  assert.match(await page.locator('#system-data').textContent(),/issue-warehouse/);assert.match(await page.locator('#system-metrics').textContent(),/http_requests_total/);
  await page.route('**/metrics',route=>route.abort());await page.locator('#system-refresh').click();await page.waitForFunction(()=>document.querySelector('#system-status').textContent.includes('unavailable'));await page.unroute('**/metrics');await page.locator('#system-refresh').click();await page.waitForFunction(()=>document.querySelector('#system-status').textContent.startsWith('Updated'));
 }
 if(process.env.WAREHOUSE_BASE_URL){
  await page.goto(base+'/');await page.waitForSelector('html[data-ready=true]');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);
  for(let i=0;i<routes.length;i++){await page.goto(base+routes[i]);await page.waitForSelector('html[data-ready=true]');assert.equal(await page.locator('main h1:visible').textContent(),titles[i]);}
  await page.waitForFunction(()=>document.querySelector('#system-status').textContent.includes('unavailable'));
  await page.goto(base+'/export?q=TalkBack');await page.waitForSelector('html[data-ready=true]');assert.equal(Number(await page.locator('#manifest-count').getAttribute('data-count')),count);assert.equal(await page.locator('#dl-json').isDisabled(),false);
  await context.setOffline(false);
 }
 const badContext=await browser.newContext();const bad=await badContext.newPage();await bad.route('**/data/manifest.json',route=>route.fulfill({json:{...JSON.parse(fs.readFileSync(path.join(docs,'data/manifest.json'))),sha256:'0'.repeat(64)}}));await bad.goto(base+'/export');await bad.waitForSelector('html[data-ready=true]');assert.equal(await bad.locator('#dl-json').isDisabled(),true,'unverified snapshot cannot be exported');assert.match(await bad.locator('#manifest-status').textContent(),/verif/i);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({routes:4,widths:[320,768,1440],axe_scans:scans,page_errors:0,taxonomy:true,export_readback:true,offline_direct_routes:!!process.env.WAREHOUSE_BASE_URL,invalid_snapshot_blocked:true,tabs:true,history:true,keyboard:true}));
}finally{await browser?.close();server.close();}

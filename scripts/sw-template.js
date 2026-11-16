'use strict';
const BUILD = __CONFIG__;
const ROOT = new URL('./', self.location.href);
const CACHE = BUILD.app.replaceAll('-','_') + '_pwa_' + BUILD.version;
const paths = new Map(BUILD.files.map((file) => [new URL(file.path, ROOT).href, file]));
const hex = (buffer) => [...new Uint8Array(buffer)].map((v) => v.toString(16).padStart(2, '0')).join('');
async function complete() {
 const cache = await caches.open(CACHE);
 return (await Promise.all([...paths.keys()].map((url) => cache.match(url)))).every(Boolean);
}
async function prepareFiles() {
 const cache = await caches.open(CACHE);
 for (const [url, file] of paths) {
  if (await cache.match(url)) continue;
  const response = await fetch(new Request(url, {cache:'reload', credentials:'omit'}));
  if (!response.ok || response.redirected || !response.headers.get('content-type')?.toLowerCase().includes(file.mime)) throw Error('Required offline asset unavailable: '+file.path);
  const bytes = await response.clone().arrayBuffer();
  if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== file.sha256) throw Error('Build mismatch: '+file.path);
  await cache.put(url, response);
 }
}
self.addEventListener('install', (event) => event.waitUntil(prepareFiles().catch(async(error) => { await caches.delete(CACHE); throw error; })));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => event.waitUntil((async () => {
 if (event.data?.type === 'PREPARE') { try { await prepareFiles(); event.ports[0]?.postMessage({ready:true}); } catch { event.ports[0]?.postMessage({error:'Offline preparation failed. Reconnect and retry; storage may be full or this build is no longer available.'}); } }
 if (event.data?.type === 'STATUS') event.ports[0]?.postMessage({ready:await complete(), version:BUILD.version});
 if (event.data?.type === 'ACTIVATE') {
  const clients = (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter((c) => c.url.startsWith(ROOT.href));
  if (clients.length > 1) { event.ports[0]?.postMessage({error:'Close the other tabs for this app, then retry. Their work has not been changed.'}); return; }
  if (!await complete()) { event.ports[0]?.postMessage({error:'The new offline copy is incomplete. Keep this version and retry preparation online.'}); return; }
  event.ports[0]?.postMessage({accepted:true}); await self.skipWaiting();
 }
})()));
self.addEventListener('fetch', (event) => {
 const request = event.request, url = new URL(request.url);
 if(request.method !== 'GET' || request.headers.has('authorization') || url.origin !== ROOT.origin) return;
 let key = url.href;
 if(request.mode === 'navigate' && [ROOT.pathname, ROOT.pathname+'index.html', ROOT.pathname+'taxonomy', ROOT.pathname+'export', ROOT.pathname+'system'].includes(url.pathname)) key = new URL('index.html', ROOT).href;
 if(!paths.has(key)) return;
 event.respondWith((async () => {
  const cache = await caches.open(CACHE), hit = await cache.match(key);
  if(hit) return hit;
  // An evicted asset must still belong to this exact build; never mix new Wasm/JS into old HTML.
  try {
   const response = await fetch(new Request(key, {cache:'reload',credentials:'omit'})), file=paths.get(key);
   if(!response.ok || !response.headers.get('content-type')?.toLowerCase().includes(file.mime) || hex(await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer())) !== file.sha256) throw Error('Build unavailable');
   await cache.put(key,response.clone()); return response;
  } catch {
   if(request.mode === 'navigate') return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline copy unavailable</title><h1>Reconnect to open this app</h1><p>This device has no complete offline copy. Reconnect, reload, then choose Prepare offline.</p></html>',{status:503,headers:{'Content-Type':'text/html'}});
   return Response.error();
  }
 })());
});

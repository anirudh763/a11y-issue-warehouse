const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function build(root,app,template) {
 const dir=path.join(root,'docs');
 const names=app==='cuereport' ? ['index.html','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png','atkinson-hyperlegible-latin-400-normal.woff2','atkinson-hyperlegible-latin-700-normal.woff2'] : ['index.html','routes.css','dm-sans-variable.ttf','manifest.webmanifest','favicon.svg','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png','ui.css','explorer.css','product.css','pwa.css','storage-migration.js','theme.js','model.js','sql-workbench.js','sql-worker.js','local-profile.js','product.js','pwa.js','ecosystem.js','backlog.js','encrypted-backup.js','backup-ui.js','sync-provider.js','sync-ui.js','explorer.js','atkinson-hyperlegible-latin-400-normal.woff2','atkinson-hyperlegible-latin-700-normal.woff2','data/issues.json','data/manifest.json','vendor/duckdb-browser.mjs','vendor/duckdb-browser-eh.worker.js','vendor/duckdb-eh.wasm','vendor/extensions/v1.4.3/wasm_eh/json.duckdb_extension.wasm','vendor/extensions/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm'];
 const types={'.html':'text/html','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.css':'text/css','.js':'javascript','.mjs':'javascript','.json':'application/json','.wasm':'application/wasm'};
 const files=names.map(name=>{const data=fs.readFileSync(path.join(dir,name));return {path:name,mime:types[path.extname(name)],bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};});
 const version=crypto.createHash('sha256').update(JSON.stringify(files)+fs.readFileSync(template)).digest('hex').slice(0,16);
 const appVersion=fs.existsSync(path.join(root,"package.json"))?JSON.parse(fs.readFileSync(path.join(root,"package.json"))).version:null;
 const config={app,appVersion,version,files};fs.writeFileSync(path.join(dir,'sw.js'),fs.readFileSync(template,'utf8').replace('__CONFIG__',JSON.stringify(config)));
 fs.writeFileSync(path.join(dir,'offline-manifest.json'),JSON.stringify(config,null,2)+'\n');
 console.log(`${app} offline build ${version}: ${files.length} public files, ${files.reduce((n,f)=>n+f.bytes,0)} bytes`);
}
module.exports=build;
if(require.main===module) build(path.resolve(__dirname,'..'),'issue-warehouse',path.join(__dirname,'sw-template.js'));

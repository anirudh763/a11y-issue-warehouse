const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,__dirname.endsWith('/test')?'..':'../..');const cue=fs.existsSync(path.join(root,'src/app.html'));
const code=fs.readFileSync(path.join(root,cue?'src/storage-migration.js':'docs/storage-migration.js'),'utf8');
function storage(entries){const map=new Map(entries);return {map,get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
test('migration is app scoped, preserves conflicts, and tolerates blocked storage',()=>{
 const old=cue?'tbt-theme':'warehouse-theme',key=cue?'cuereport_theme_v1':'issue_warehouse_theme_v1';
 const local=storage([[old,'dark'],['other_app_token','sentinel']]),session=storage([]),document={documentElement:{dataset:{}}};
 vm.runInNewContext(code,{window:{localStorage:local,sessionStorage:session},document});assert.equal(local.getItem(key),'dark');assert.equal(local.getItem(old),null);assert.equal(local.getItem('other_app_token'),'sentinel');
 local.setItem(old,'light');vm.runInNewContext(code,{window:{localStorage:local,sessionStorage:session},document});assert.equal(local.getItem(key),'dark');assert.equal(local.getItem(old),'light');assert.equal(document.documentElement.dataset.storageRecovery,'conflict');
 const blocked={get length(){throw Error('blocked')}};assert.doesNotThrow(()=>vm.runInNewContext(code,{window:{localStorage:blocked,sessionStorage:session},document}));assert.equal(document.documentElement.dataset.storageRecovery,'unavailable');
});

test('server migration retains originals for explicit recovery',()=>{const old='warehouse-query-v1',query='SELECT 23 AS retained',session=storage([[old,query]]),local=storage([]),document={documentElement:{dataset:{}},querySelector:()=>({})};vm.runInNewContext(code,{window:{localStorage:local,sessionStorage:session},document});assert.equal(session.getItem(old),query);assert.equal(session.getItem('issue_warehouse_guest_query_v1'),query);});

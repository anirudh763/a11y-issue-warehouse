import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {start,stop,open} from './helpers.mjs';
const require=createRequire(import.meta.url);
const out=process.env.AUDIT_OUT||'/tmp/warehouse-audit';
before(async()=>{await mkdir(out,{recursive:true});await start();});after(stop);
for(const theme of ['light','dark'])for(const size of [{width:1440,height:900},{width:375,height:812}])test(`audit routes ${theme} ${size.width}`,async()=>{
 const p=await open('#/sql',{...size,setup:p=>p.addInitScript(t=>localStorage.setItem('warehouse-theme',t),theme)});const rows=[];
 try{
 for(const route of ['explore','sql','manifest','methods','','404-test','404-test/details']){
  await p.goto(new URL('#/'+route,p.url()).href);await p.locator('main h1:visible').waitFor();await p.evaluate(()=>document.fonts.ready);await p.evaluate(await readFile(require.resolve('axe-core/axe.min.js'),'utf8'));const ax=await p.evaluate(()=>axe.run());
  const id=(route||'root').replaceAll('/','-')+'-'+theme+'-'+size.width;
  await writeFile(out+'/'+id+'.axe.json',JSON.stringify(ax));
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);rows.push({id,overflow,violations:ax.violations.map(v=>({id:v.id,impact:v.impact})),incomplete:ax.incomplete.map(v=>v.id)});
  if(['sql','explore'].includes(route))await p.screenshot({path:out+'/'+id+'.png',fullPage:true});
  assert.equal(overflow,0,id);assert.deepEqual(ax.violations.filter(v=>['serious','critical'].includes(v.impact)),[],id);
 }
 for(const route of ['explore','sql','manifest','methods']){
  await p.goto(new URL('#/'+route,p.url()).href);await p.locator('main h1:visible').waitFor();await p.evaluate(()=>document.documentElement.style.fontSize='200%');
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);const id='text200-'+route+'-'+theme+'-'+size.width;rows.push({id,overflow});await p.screenshot({path:out+'/'+id+'.png'});
  if(overflow)await writeFile(out+'/'+id+'-overflow.json',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,cls:e.className,rect:e.getBoundingClientRect().toJSON()})).filter(e=>e.rect.width&&e.rect.right>innerWidth)),null,2));assert.equal(overflow,0,id);
 }
 assert.deepEqual(p.errors,[]);
 }finally{await writeFile(out+'/matrix-'+theme+'-'+size.width+'.json',JSON.stringify(rows,null,2));await p.close();}
});

test('forced colors, reduced motion and text spacing preserve operational controls', async () => {
  for (const width of [1440, 375]) {
    const p = await open('#/sql', { width, height: width === 375 ? 812 : 900 });
    try {
      await p.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await p.evaluate(() => {
        for (const element of document.querySelectorAll('*')) {
          element.style.setProperty('line-height', '1.5', 'important');
          element.style.setProperty('letter-spacing', '.12em', 'important');
          element.style.setProperty('word-spacing', '.16em', 'important');
          if (element.tagName === 'P') element.style.setProperty('margin-bottom', '2em', 'important');
        }
      });
      for (const route of ['explore', 'sql', 'manifest', 'methods']) {
        await p.goto(new URL('#/' + route, p.url()).href);
        await p.locator('main h1:visible').waitFor();
        if (route === 'sql') {
          await p.waitForFunction(() => !document.querySelector('#sql-run').disabled);
          await p.locator('#sql-run').click();
          await p.waitForFunction(() => document.querySelectorAll('#sql-table tbody tr').length > 0);
        }
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, route + ' ' + width);
        await p.screenshot({ path: out + '/forced-spacing-' + route + '-' + width + '.png' });
      }
      assert.deepEqual(p.errors, []);
    } finally { await p.close(); }
  }
});

import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {start,stop,open,ctx} from './helpers.mjs';
before(start);after(stop);
test('landing, local profiles and saved query A/B isolation',async()=>{
 const p=await open('#/',{width:1440});
 try {
  await p.getByRole('heading',{name:'From issue records to inspectable evidence.'}).waitFor();
  await p.locator('a[href="#/signup"]').first().click();
  await p.fill('#profile-name','Alice');await p.fill('#profile-password','correct horse battery');await p.click('#profile-submit');
  await p.waitForURL('**/#/app');
  await p.goto(p.url().replace('#/app','#/app/sql'));await p.waitForFunction(()=>!document.querySelector('#sql-run').disabled);
  const sql='SELECT title FROM issues LIMIT 3';await p.fill('#sql-query',sql);await p.click('#save-work');await p.fill('#save-work-name','A query');await p.locator('#save-work-form button[type=submit]').click();
  await p.waitForURL('**/#/saved');assert.equal(await p.locator('#saved-work-list li').count(),1);
  await p.locator('[data-product-page=saved] [data-logout]').click();await p.waitForURL('**/#/');
  await p.goto(p.url()+'signup');await p.fill('#profile-name','Bobby');await p.fill('#profile-password','another strong password');await p.click('#profile-submit');await p.waitForURL('**/#/app');
  await p.goto(p.url().replace('#/app','#/saved'));assert.equal(await p.locator('#saved-work-list li').count(),0);
  await p.locator('[data-product-page=saved] [data-logout]').click();await p.goto(p.url().replace(/#.*$/,'#/login'));
  await p.fill('#profile-name','Alice');await p.fill('#profile-password','correct horse battery');await p.click('#profile-submit');await p.waitForURL('**/#/app');
  await p.goto(p.url().replace('#/app','#/saved'));await p.getByRole('button',{name:'Restore A query',exact:true}).click();
  assert.equal(await p.inputValue('#sql-query'),sql);assert.equal(await p.locator('#sql-table tbody tr').count(),0);
  assert.deepEqual(p.errors,[]);
 }finally{await p.close();}
});

test('profile can save typed SQL while public snapshot is still loading', async () => {
 const context=await ctx.browser.newContext(); const p=await context.newPage();
 let release; const held=new Promise(resolve=>{release=resolve;});
 await p.route('**/data/issues.json',async route=>{await held;await route.continue();});
 try {
  await p.goto(ctx.base+'#/signup');
  await p.fill('#profile-name','Early user');await p.fill('#profile-password','first long password');await p.click('#profile-submit');await p.waitForURL('**/#/app');
  await p.goto(ctx.base+'#/app/sql');await p.fill('#sql-query','SELECT title FROM issues LIMIT 1');await p.click('#save-work');await p.fill('#save-work-name','Unrun question');await p.locator('#save-work-form button[type=submit]').click();
  await p.waitForURL('**/#/saved',{timeout:2500});
  release();await p.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await p.getByRole('button',{name:'Restore Unrun question',exact:true}).click();
  assert.equal(await p.inputValue('#sql-query'),'SELECT title FROM issues LIMIT 1');assert.equal(await p.locator('#sql-table tbody tr').count(),0);
 } finally { release(); await context.close(); }
});

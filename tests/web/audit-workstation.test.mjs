import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {start,stop,open} from './helpers.mjs';
before(start);after(stop);
test('exact bounded SQL survives reload without auto execution',async()=>{const p=await open('#/sql');try{await p.waitForFunction(()=>!document.querySelector('#sql-run').disabled);const sql="SELECT title FROM issues WHERE title LIKE '%東京%' LIMIT 7;\n";await p.fill('#sql-query',sql);await p.reload();await p.waitForFunction(()=>!document.querySelector('#sql-run').disabled);assert.equal(await p.inputValue('#sql-query'),sql);assert.match(await p.textContent('#sql-recovery-status'),/Restored/);assert.equal(await p.locator('#sql-table tbody tr').count(),0);assert.equal(await p.locator('[data-sql-export]').first().isDisabled(),true);}finally{await p.close();}});
test('theme action label follows pressed state across reload',async()=>{const p=await open('#/sql',{width:1440});try{await p.locator('#rail .theme-toggle').click();assert.equal(await p.locator('#rail .theme-toggle').innerText(),'Light theme');assert.equal(await p.locator('#rail .theme-toggle').getAttribute('aria-pressed'),'true');await p.reload();assert.equal(await p.locator('#rail .theme-toggle').innerText(),'Light theme');}finally{await p.close();}});

test('oversized Unicode query clears recovery instead of silently truncating', async () => {
  const p = await open('#/sql');
  try {
    await p.fill('#sql-query', 'SELECT number FROM issues LIMIT 1');
    await p.fill('#sql-query', '-- ' + '東京'.repeat(700));
    assert.match(await p.textContent('#sql-recovery-status'), /exceeds 4,096 bytes/);
    assert.equal(await p.evaluate(() => sessionStorage.getItem('issue_warehouse_guest_query_v1')), null);
    await p.reload();
    assert.doesNotMatch(await p.inputValue('#sql-query'), /東京/);
  } finally { await p.close(); }
});

test('unavailable tab storage gives an actionable recovery warning', async () => {
  const p = await open('#/sql', { setup: p => p.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'issue_warehouse_guest_query_v1') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  }) });
  try {
    const sql = 'SELECT number FROM issues LIMIT 1';
    await p.fill('#sql-query', sql);
    assert.match(await p.textContent('#sql-recovery-status'), /Copy your query before reloading/);
    assert.equal(await p.inputValue('#sql-query'), sql);
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); }
});

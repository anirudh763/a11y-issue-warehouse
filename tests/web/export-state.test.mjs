import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { start, stop, open } from './helpers.mjs';

before(start);
after(stop);

const delayedWorker = (p) => p.addInitScript(() => {
  window.__delayNextWorkerResult = false;
  window.__heldWorkerResult = null;
  const add = Worker.prototype.addEventListener;
  Worker.prototype.addEventListener = function (type, listener, options) {
    if (type !== 'message') return add.call(this, type, listener, options);
    const wrapped = (event) => {
      if (window.__delayNextWorkerResult && event.data?.type === 'result') {
        window.__delayNextWorkerResult = false;
        window.__heldWorkerResult = { worker: this, listener, event };
        return;
      }
      listener.call(this, event);
    };
    return add.call(this, type, wrapped, options);
  };
  window.__releaseWorkerResult = () => {
    const held = window.__heldWorkerResult;
    if (!held) throw new Error('No real worker result is being held.');
    window.__heldWorkerResult = null;
    held.listener.call(held.worker, held.event);
  };
});

async function openSQL(setup = delayedWorker) {
  const page = await open('#/sql', { setup });
  await page.waitForFunction(() => !document.querySelector('#sql-run').disabled, null, { timeout: 90_000 });
  return page;
}

async function runQuery(page, sql) {
  await page.fill('#sql-query', sql);
  await page.click('#sql-run');
  await page.waitForFunction(() => !document.querySelector('#sql-result-status').textContent.startsWith('Running query…'));
  assert.match(await page.textContent('#sql-result-status'), /rows shown/);
}

async function armDelayedResult(page) {
  await page.evaluate(() => { window.__delayNextWorkerResult = true; });
}

async function waitForHeldResult(page) {
  await page.waitForFunction(() => Boolean(window.__heldWorkerResult), null, { timeout: 90_000 });
}

async function releaseAndSettle(page) {
  await page.evaluate(() => window.__releaseWorkerResult());
  await page.waitForFunction(() => document.querySelector('#sql-cancel').disabled);
  await page.waitForTimeout(50);
}

test('query export is discarded if the editor changes while the real worker result is pending', async () => {
  const page = await openSQL();
  const downloads = [];
  page.on('download', (download) => downloads.push(download));
  try {
    const original = 'SELECT number FROM issues ORDER BY number LIMIT 3';
    await runQuery(page, original);
    await armDelayedResult(page);
    await page.click('[data-sql-export="csv"]');
    await waitForHeldResult(page);
    await page.waitForFunction(() => document.querySelector('#sql-export-status').textContent.includes('Building'));
    // Worker actually runs and produces its export; only delivery of its real result event is delayed.
    await page.fill('#sql-query', 'SELECT number FROM issues ORDER BY number LIMIT 4');
    await releaseAndSettle(page);
    assert.equal(downloads.length, 0);
    assert.equal(await page.locator('[data-sql-export="csv"]').isDisabled(), true);
    assert.match(await page.textContent('#sql-result-status'), /Query changed/);
  } finally { await page.close(); }
});

test('query revision rejects an in-flight export after edit and change back to identical text', async () => {
  const page = await openSQL();
  const downloads = [];
  page.on('download', (download) => downloads.push(download));
  try {
    const original = 'SELECT number FROM issues ORDER BY number LIMIT 3';
    await runQuery(page, original);
    await armDelayedResult(page);
    await page.click('[data-sql-export="csv"]');
    await waitForHeldResult(page);
    await page.fill('#sql-query', original + ' ');
    await page.fill('#sql-query', original);
    await releaseAndSettle(page);
    assert.equal(await page.inputValue('#sql-query'), original);
    assert.equal(downloads.length, 0);
    assert.equal(await page.locator('[data-sql-export="csv"]').isDisabled(), true);
    assert.match(await page.textContent('#sql-result-status'), /Query changed/);
  } finally { await page.close(); }
});

test('split build is discarded if the seed changes and changes back before the worker result arrives', async () => {
  const page = await openSQL();
  try {
    const seed = 'warehouse-v1';
    await armDelayedResult(page);
    await page.click('#split-run');
    await waitForHeldResult(page);
    await page.fill('#split-seed', 'changed-seed');
    await page.fill('#split-seed', seed);
    await releaseAndSettle(page);
    assert.equal(await page.inputValue('#split-seed'), seed);
    assert.match(await page.textContent('#split-status'), /Seed changed/);
    assert.deepEqual(await page.$$eval('[data-split-export]', (buttons) => buttons.map((button) => button.disabled)), [true, true, true]);
  } finally { await page.close(); }
});

test('split export is discarded when the visible seed changes during worker readback', async () => {
  const page = await openSQL();
  const downloads = [];
  page.on('download', (download) => downloads.push(download));
  try {
    await page.fill('#split-seed', 'export-seed');
    await page.click('#split-run');
    await page.waitForFunction(() => document.querySelector('#split-status').textContent.includes('rows; train'), null, { timeout: 90_000 });
    assert.equal(await page.locator('[data-split-export="csv"]').isDisabled(), false);
    await armDelayedResult(page);
    await page.click('[data-split-export="csv"]');
    await waitForHeldResult(page);
    await page.fill('#split-seed', 'new-visible-seed');
    await releaseAndSettle(page);
    assert.equal(downloads.length, 0);
    assert.equal(await page.locator('[data-split-export="csv"]').isDisabled(), true);
    assert.match(await page.textContent('#split-status'), /Seed changed/);
  } finally { await page.close(); }
});

test('storage failure removes an older saved query so reload cannot present it as current', async () => {
  const setup = (page) => page.addInitScript(() => {
    const key = 'issue_warehouse_guest_query_v1';
    const nativeSet = Storage.prototype.setItem;
    if (sessionStorage.getItem('warehouse-query-test-seeded') !== 'yes') {
      nativeSet.call(sessionStorage, key, 'SELECT number FROM issues LIMIT 1');
      nativeSet.call(sessionStorage, 'warehouse-query-test-seeded', 'yes');
    }
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Full', 'QuotaExceededError');
      return nativeSet.call(this, name, value);
    };
  });
  const page = await openSQL(setup);
  try {
    assert.match(await page.textContent('#sql-recovery-status'), /Restored query/);
    await page.fill('#sql-query', 'SELECT number FROM issues LIMIT 2');
    assert.match(await page.textContent('#sql-recovery-status'), /Copy your query before reloading/);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('issue_warehouse_guest_query_v1')), null);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#sql-run').disabled, null, { timeout: 90_000 });
    assert.doesNotMatch(await page.textContent('#sql-recovery-status'), /Restored query/);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('issue_warehouse_guest_query_v1')), null);
  } finally { await page.close(); }
});

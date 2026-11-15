// Browser tests for the local SQL/provenance/split/export vertical slice.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { start, stop, open, axe, DOCS } from './helpers.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Model = require('../../docs/model.js');
let page;

before(start);
after(async () => { await page?.close(); await stop(); });

async function download(selector) {
  const [item] = await Promise.all([page.waitForEvent('download', { timeout: 65_000 }), page.click(selector)]);
  return readFile(await item.path());
}

async function waitReady() {
  await page.waitForFunction(() => !document.querySelector('#sql-run').disabled, { timeout: 90_000 });
}

async function waitQuery() {
  await page.waitForFunction(() => !document.querySelector('#sql-result-status').textContent.startsWith('Running query…'), { timeout: 20_000 });
}

test('snapshot hash/schema verify actual bytes and the public projection excludes private fields', async () => {
  const bytes = await readFile(`${DOCS}/data/issues.json`);
  const raw = JSON.parse(bytes);
  const manifest = JSON.parse(await readFile(`${DOCS}/data/manifest.json`));
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(manifest.sha256, digest);
  assert.equal(manifest.row_count, raw.issues.length);
  assert.deepEqual(manifest.schema, Model.SQL_SCHEMA);
  assert.equal(Model.validateSnapshot(raw, digest, manifest).ok, true);
  assert.doesNotMatch(JSON.stringify(raw.fields), /body|username|author/i);
  assert.deepEqual(raw.fields, ['repo', 'number', 'title', 'state', 'state_reason', 'created_at', 'closed_at', 'comments', 'sample', 'sources', 'words', 'labels']);
});

test('schema drift quarantines invalid rows with a reason and preserves the source record', async () => {
  const raw = JSON.parse(await readFile(`${DOCS}/data/issues.json`));
  const manifest = JSON.parse(await readFile(`${DOCS}/data/manifest.json`));
  const original = structuredClone(raw);
  raw.issues[0][1] = 'not-an-integer';
  const result = Model.validateSnapshot(raw, manifest.sha256, manifest);
  assert.equal(result.ok, false);
  assert.deepEqual(result.quarantine, [{ row: 1, reason: 'field type, range, or reference mismatch' }]);
  assert.equal(raw.issues[0][1], 'not-an-integer');
  assert.equal(original.issues[0][1] !== raw.issues[0][1], true);
});

test('Parquet cleanup attempts both resources and resets the export engine after storage failure', async () => {
  const source = await readFile(`${DOCS}/sql-worker.js`, 'utf8');
  const declaration = source.match(/async function cleanupParquetArtifacts\([\s\S]*?\n\}/)?.[0];
  assert.ok(declaration, 'cleanup lifecycle helper remains directly testable without runtime hooks');
  const cleanup = new Function(`${declaration}; return cleanupParquetArtifacts;`)();
  const events = [];
  await assert.rejects(cleanup(
    { dropFile: async (path) => { events.push(`drop:${path}`); throw new Error('injected storage failure'); } },
    { query: async (sql) => { events.push(`query:${sql}`); } },
    '/warehouse-export-test.parquet', true,
    async () => { events.push('reset'); },
  ), /Parquet export cleanup failed; the export engine was reset/);
  assert.deepEqual(events, [
    'drop:/warehouse-export-test.parquet',
    'query:DROP TABLE IF EXISTS warehouse_export_rows',
    'reset',
  ]);
});

test('DuckDB parses real SELECTs and blocks mutation, external access, multi-statement and abusive grammar', async () => {
  page = await open('#/sql');
  await waitReady();
  assert.match(await page.textContent('#sql-status'), /Verified issues\.json SHA-256/);
  assert.equal(await page.inputValue('#sql-query'), 'SELECT repo, state, COUNT(*) AS issues FROM issues GROUP BY repo, state ORDER BY issues DESC LIMIT 20;');
  await page.click('#sql-run');
  await waitQuery();
  assert.match(await page.textContent('#sql-result-status'), /20 rows shown/);
  assert.deepEqual(await page.$$eval('#sql-table thead th', (ths) => ths.map((th) => th.textContent)), ['repo', 'state', 'issues']);
  assert.equal(await page.$$eval('#sql-table tbody tr', (trs) => trs.length), 20);

  await page.fill('#sql-query', 'SELECT COUNT(*) AS row_count FROM issues');
  await page.click('#sql-run');
  await waitQuery();
  assert.match(await page.textContent('#sql-result-status'), /1 rows shown/);
  assert.match(await page.textContent('#sql-engine'), /DuckDB-Wasm/);
  assert.equal(await page.$eval('#sql-table tbody td', (n) => n.textContent), '2643');

  await page.fill('#sql-query', 'SELECT number AS issue_number FROM issues ORDER BY issue_number LIMIT 3');
  await page.click('#sql-run');
  await waitQuery();
  const orderedAliases = await page.$$eval('#sql-table tbody tr', (trs) => trs.map((tr) => Number(tr.cells[0].textContent)));
  assert.equal(orderedAliases.length, 3);
  assert.deepEqual(orderedAliases, [...orderedAliases].sort((a, b) => a - b));
  await page.fill('#sql-query', 'SELECT number FROM issues ORDER BY unknown_alias LIMIT 1');
  await page.click('#sql-run');
  await waitQuery();
  assert.match(await page.textContent('#sql-result-status'), /Column is outside the public projection: unknown_alias/);

  const rejected = [
    'SELECT number FROM issues; SELECT number FROM issues',
    'DELETE FROM issues',
    "COPY issues TO '/tmp/issues.csv'",
    "SELECT * FROM read_csv('/etc/passwd')",
    'WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t) SELECT n FROM issues',
    'SELECT * FROM issues',
    'SELECT current_setting(\'enable_external_access\') FROM issues',
  ];
  for (const sql of rejected) {
    await page.fill('#sql-query', sql);
    await page.click('#sql-run');
    await waitQuery();
    assert.match(await page.textContent('#sql-result-status'), /only|outside|not allowed|supported|exactly one|read only|complex|named/i, sql);
    assert.equal(await page.$$eval('#sql-table tbody tr', (trs) => trs.length), 0, `${sql} clears prior rows`);
  }
});

test('each SQL preset runs once against the verified public projection', async () => {
  const cases = [
    { name: 'All issues by app', columns: ['repo', 'issues'], rows: 15, total: 2643 },
    { name: 'Open issues', columns: ['repo', 'number', 'title', 'comments'], rows: 20 },
    { name: 'Sample groups', columns: ['sample', 'issues'], rows: 3, total: 2643 },
  ];
  for (const preset of cases) {
    const button = page.getByRole('button', { name: preset.name, exact: true });
    assert.equal(await button.isDisabled(), false);
    await button.click();
    assert.equal(await button.isDisabled(), true, `${preset.name} is disabled while its query runs`);
    await waitQuery();
    assert.equal(await page.inputValue('#sql-query'), await button.getAttribute('data-sql-preset'));
    assert.deepEqual(await page.$$eval('#sql-table thead th', (ths) => ths.map((th) => th.textContent)), preset.columns);
    const rows = await page.$$eval('#sql-table tbody tr', (trs) => trs.map((tr) => [...tr.cells].map((cell) => cell.textContent)));
    assert.equal(rows.length, preset.rows, `${preset.name} row count`);
    if (preset.total) assert.equal(rows.reduce((sum, row) => sum + Number(row[1]), 0), preset.total, `${preset.name} covers the public projection`);
    if (preset.name === 'Open issues') {
      const comments = rows.map((row) => Number(row[3]));
      assert.deepEqual(comments, [...comments].sort((a, b) => b - a));
    }
    assert.equal(await button.isDisabled(), false, `${preset.name} is enabled after completion`);
  }
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${width}px SQL route has no horizontal overflow`);
    assert.ok(await page.$$eval('[data-sql-preset]', (buttons) => buttons.every((button) => button.getBoundingClientRect().height >= 44)), `${width}px preset buttons meet 44px target size`);
    assert.deepEqual(await axe(page), [], `axe at ${width}px`);
  }
});

test('empty SQL results retain schema and clear stale rows', async () => {
  await page.fill('#sql-query', 'SELECT number, title FROM issues ORDER BY number LIMIT 1');
  await page.click('#sql-run');
  await waitQuery();
  assert.match(await page.textContent('#sql-result-status'), /1 rows shown/);
  await page.fill('#sql-query', 'SELECT number, title FROM issues WHERE number < 0');
  await page.click('#sql-run');
  await waitQuery();
  assert.match(await page.textContent('#sql-result-status'), /0 rows/);
  assert.equal(await page.$$eval('#sql-table tbody tr', (trs) => trs.length), 0);
  assert.equal(await page.$$eval('#sql-table thead th', (ths) => ths.length), 2);
  assert.equal(await page.textContent('#sql-result-status'), '0 rows. Columns: number, title.');
});

test('snapshot hash mismatch disables trusted SQL and export until verification is repaired', async () => {
  let requests = 0;
  const page2 = await open('#/sql', { setup: (p) => p.route('**/data/manifest.json', async (route) => {
    const manifest = JSON.parse(await readFile(`${DOCS}/data/manifest.json`));
    if (requests++ === 0) manifest.sha256 = '0'.repeat(64);
    await route.fulfill({ json: manifest });
  }) });
  assert.match(await page2.textContent('#sql-status'), /verification failed/);
  assert.equal(await page2.isDisabled('#sql-run'), true);
  assert.equal(await page2.isDisabled('#split-run'), true);
  assert.deepEqual(await page2.$$eval('[data-sql-preset]', (buttons) => buttons.map((button) => button.disabled)), [true, true, true]);
  await page2.click('#sql-retry');
  await page2.waitForFunction(() => !document.querySelector('#sql-run').disabled);
  assert.deepEqual(await page2.$$eval('[data-sql-preset]', (buttons) => buttons.map((button) => button.disabled)), [false, false, false]);
  assert.match(await page2.textContent('#sql-status'), /Verified issues\.json SHA-256/);
  await page2.close();
});

test('seeded split is stable, disjoint, and covers every accepted issue exactly once', async () => {
  await page.fill('#split-seed', 'case-6');
  await page.click('#split-run');
  await page.waitForFunction(() => document.querySelector('#split-status').textContent.includes('rows; train'));
  assert.match(await page.textContent('#split-status'), /^2,643 rows; train 2114, validation 264, test 265;/);
  const first = await download('[data-split-export="jsonl"]');
  const second = await download('[data-split-export="jsonl"]');
  assert.equal(createHash('sha256').update(first).digest('hex'), createHash('sha256').update(second).digest('hex'));
  const lines = first.toString('utf8').trim().split('\n').map(JSON.parse);
  const metadata = lines.shift()._meta;
  assert.deepEqual(metadata.split_ratios, { train: 0.8, validation: 0.1, test: 0.1 });
  assert.equal(metadata.split_seed, 'case-6');
  assert.ok(metadata.snapshot_sha256 && metadata.engine_version && metadata.schema.length > 0);
  const records = lines;
  assert.equal(records.length, 2643);
  assert.equal(new Set(records.map((r) => r.id)).size, records.length);
  assert.deepEqual(new Set(records.map((r) => r.split)), new Set(['train', 'validation', 'test']));
  assert.ok(records.every((r) => r.split_seed === 'case-6' && r.split_algorithm.endsWith('v1')));
  assert.ok(records.every((r) => r.split_train_ratio === 0.8 && r.split_validation_ratio === 0.1 && r.split_test_ratio === 0.1));
  assert.ok(records.every((r) => r.snapshot_sha256 && r.engine_version));
  const splitCsv = await download('[data-split-export="csv"]');
  assert.match(splitCsv.toString('utf8').slice(0, 200), /split_seed/);
  assert.match(await page.textContent('#sql-export-status'), /readback verified/);
  const splitParquet1 = await download('[data-split-export="parquet"]');
  const splitParquet2 = await download('[data-split-export="parquet"]');
  assert.equal(splitParquet1.subarray(0, 4).toString(), 'PAR1');
  assert.equal(splitParquet1.subarray(-4).toString(), 'PAR1');
  assert.equal(createHash('sha256').update(splitParquet1).digest('hex'), createHash('sha256').update(splitParquet2).digest('hex'));
  assert.match(await page.textContent('#sql-export-status'), /2,643 rows; SHA-256 [a-f0-9]{64}; readback verified\./);
});

test('CSV, JSONL and Parquet are real deterministic exports with readback checks', async () => {
  await page.fill('#sql-query', 'SELECT repo, number, title FROM issues ORDER BY repo, number LIMIT 10');
  await page.click('#sql-run');
  await waitQuery();
  assert.match(await page.textContent('#sql-result-status'), /10 rows shown/);
  const csv1 = await download('[data-sql-export="csv"]');
  const csv2 = await download('[data-sql-export="csv"]');
  assert.equal(createHash('sha256').update(csv1).digest('hex'), createHash('sha256').update(csv2).digest('hex'));
  assert.equal(csv1.toString('utf8').split('\r\n').length, 12);
  const jsonl = await download('[data-sql-export="jsonl"]');
  const jsonLines = jsonl.toString('utf8').trim().split('\n').map(JSON.parse);
  assert.equal(jsonLines[0]._meta.row_count, 10);
  assert.deepEqual(jsonLines[0]._meta.schema.map((c) => c.name), ['repo', 'number', 'title']);
  assert.equal(jsonLines.length, 11);
  assert.match(await page.textContent('#sql-export-status'), /readback verified/);
  const parquet1 = await download('[data-sql-export="parquet"]');
  const parquet2 = await download('[data-sql-export="parquet"]');
  assert.equal(parquet1.subarray(0, 4).toString(), 'PAR1');
  assert.equal(parquet1.subarray(-4).toString(), 'PAR1');
  assert.equal(createHash('sha256').update(parquet1).digest('hex'), createHash('sha256').update(parquet2).digest('hex'));
  await page.fill('#sql-query', "SELECT '=HYPERLINK(\"https://bad.invalid\")' AS formula FROM issues LIMIT 1");
  await page.click('#sql-run');
  await waitQuery();
  assert.match(await page.textContent('#sql-result-status'), /1 rows shown/);
  assert.match((await download('[data-sql-export="csv"]')).toString('utf8'), /'=/);
  await page.fill('#sql-query', "SELECT ' =1+1' AS formula FROM issues LIMIT 1");
  await page.click('#sql-run');
  await waitQuery();
  assert.match((await download('[data-sql-export="csv"]')).toString('utf8'), /\r\n' =1\+1\r\n/);
  assert.deepEqual(page.errors, []);
});

test('CSV preserves the declared array type when exporting projected labels', async () => {
  await page.fill('#sql-query', 'SELECT labels FROM issues LIMIT 1');
  await page.click('#sql-run');
  await waitQuery();
  assert.match(await page.textContent('#sql-result-status'), /1 rows shown/);
  const labels = JSON.parse(await page.$eval('#sql-table tbody td', (cell) => cell.textContent));
  const csv = (await download('[data-sql-export="csv"]')).toString('utf8');
  const jsonCell = JSON.stringify(labels);
  const expectedCell = /[",\r\n]|^\s|\s$/.test(jsonCell) ? `"${jsonCell.replaceAll('"', '""')}"` : jsonCell;
  assert.equal(csv.split('\r\n')[1], expectedCell);
});

test('native DuckDB non-finite numbers fail clearly instead of becoming JSON null', async () => {
  for (const sql of [
    'SELECT 1.0 / 0.0 AS numeric_value FROM issues LIMIT 1',
    'SELECT 0.0 / 0.0 AS numeric_value FROM issues LIMIT 1',
  ]) {
    await page.fill('#sql-query', sql);
    await page.click('#sql-run');
    await waitQuery();
    assert.match(await page.textContent('#sql-result-status'), /Query returned NaN or Infinity.*finite values/);
    assert.equal(await page.$$eval('#sql-table tbody tr', (rows) => rows.length), 0);
    assert.equal(await page.isDisabled('[data-sql-export="jsonl"]'), true);
  }
});

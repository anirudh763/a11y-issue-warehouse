// Sample manifest: the downloaded JSON and CSV list exactly the issues SQL selects for the
// same filters, with GitHub source URLs, the inclusion basis the warehouse recorded, the
// filter definition, the snapshot date, the SHA-256 of the data file and the weak-label caveat.
//
//   make load && make e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { start, stop, open, axe, expected, expectedIds, DOCS, DB } from './helpers.mjs';

const require = createRequire(import.meta.url);
const DATA_FILE = path.join(DOCS, 'data/issues.json');

before(start);
after(stop);

const sha256 = async () => createHash('sha256').update(await readFile(DATA_FILE)).digest('hex');

/** ids the warehouse recorded as returned by the label query, for one app (SQL, not the export). */
function labelSourceIds(repo) {
  const py = `import sqlite3,sys
c=sqlite3.connect(f"file:{sys.argv[1]}?mode=ro",uri=True)
for (n,) in c.execute("SELECT r.full_name||'#'||i.number FROM issues i JOIN repos r ON r.id=i.repo_id JOIN issue_sources s ON s.issue_id=i.id AND s.source='label' WHERE r.full_name=?",(sys.argv[2],)): print(n)`;
  return new Set(execFileSync('python3', ['-c', py, DB, repo], { encoding: 'utf8' }).split('\n').filter(Boolean));
}

/** RFC 4180 parser, enough for the manifest (quoted fields, doubled quotes, CRLF). */
function parseCSV(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i += 1; } else if (ch === '"') q = false; else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\r') { /* CRLF */ } else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

async function download(page, id) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(id)]);
  const file = await dl.path();
  return { name: dl.suggestedFilename(), text: await readFile(file, 'utf8') };
}

// ---------- unit: the model the page uses ----------
test('model: manifest of a filtered set has the right ids, URLs, basis and provenance', async () => {
  const M = require(path.join(DOCS, 'model.js'));
  const raw = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  const issues = M.decode(raw);
  assert.equal(issues.length, raw.about.issues);
  const filter = { sample: 'a11y', q: '', app: ['AntennaPod/AntennaPod'], category: [], state: ['open'], year: [], label: [] };
  const chosen = issues.filter((i) => i.sample === 'a11y' && i.repo === 'AntennaPod/AntennaPod' && i.state === 'open');
  const m = M.buildManifest({ raw, issues: chosen, filter, query: 'app=AntennaPod%2FAntennaPod&state=open', sha256: 'ab'.repeat(32), generatedAt: '2026-11-13T00:00:00Z' });
  assert.equal(m.count, expected('app=AntennaPod/AntennaPod&state=open'));
  assert.deepEqual(m.issues.map((i) => i.id).sort(), expectedIds('app=AntennaPod/AntennaPod&state=open'));
  assert.equal(m.snapshot.collected_at, raw.about.collected_at);
  assert.equal(m.snapshot.data_sha256, 'ab'.repeat(32));
  assert.equal(m.snapshot.issues_in_snapshot, raw.about.issues);
  assert.equal(m.filter.query, 'app=AntennaPod%2FAntennaPod&state=open');
  assert.match(m.filter.description, /Accessibility sample/);
  assert.match(m.filter.description, /App: AntennaPod\/AntennaPod/);
  assert.match(m.filter.description, /State: open/);
  assert.match(m.caveat, /weak labels/i);
  assert.match(m.caveat, /not human ground truth/i);
  const labelled = labelSourceIds('AntennaPod/AntennaPod');
  for (const i of m.issues) {
    assert.equal(i.source_url, `https://github.com/AntennaPod/AntennaPod/issues/${i.number}`);
    const hasLabel = i.inclusion_basis.some((b) => b.startsWith('label query'));
    assert.equal(hasLabel, labelled.has(i.id), `${i.id}: label basis matches issue_sources`);
    if (hasLabel) assert.ok(i.inclusion_basis.includes('label query: Area: Accessibility'));
  }
});

test('model: CSV quotes fields and neutralises spreadsheet formulas in titles', async () => {
  const M = require(path.join(DOCS, 'model.js'));
  const m = { snapshot: { collected_at: 'T', data_sha256: 'h' }, filter: { query: 'q=a,b' }, caveat: 'weak',
    issues: [{ id: 'o/r#1', repo: 'o/r', number: 1, state: 'open', sample: 'a11y', inclusion_basis: ['keyword query', 'words: talkback'], source_url: 'https://github.com/o/r/issues/1', title: '=HYPERLINK("x","a, b")', labels: ['x'] }] };
  const rows = parseCSV(M.manifestCSV(m));
  const head = rows[0];
  for (const col of ['id', 'source_url', 'inclusion_basis', 'filter_query', 'snapshot_collected_at', 'data_sha256', 'label_quality', 'title']) assert.ok(head.includes(col), col);
  const r = Object.fromEntries(head.map((h, i) => [h, rows[1][i]]));
  assert.equal(r.title, '\'=HYPERLINK("x","a, b")');
  assert.equal(r.filter_query, 'q=a,b');
  assert.equal(r.inclusion_basis, 'keyword query; words: talkback');
  assert.equal(rows.length, 2);
});

// ---------- browser: the screen and the downloads ----------
for (const query of ['', 'app=AntennaPod/AntennaPod&q=talkback', 'sample=comparison&app=wordpress-mobile/WordPress-Android&year=2019', 'category=label&state=closed', 'label=acknowledged&sample=all']) {
  test(`manifest download for "${query || 'default view'}" lists exactly the SQL selection`, async () => {
    const page = await open(`${query ? `?${query}` : ''}#/manifest`);
    const n = expected(query);
    const ids = expectedIds(query);
    assert.equal(await page.$eval('#manifest-count', (c) => Number(c.dataset.count)), n);
    const hash = await sha256();
    await page.waitForFunction(() => document.querySelector('#manifest-hash').dataset.hash);
    assert.equal(await page.$eval('#manifest-hash', (c) => c.dataset.hash), hash);
    const json = await download(page, '#dl-json');
    assert.match(json.name, /^warehouse-manifest-2026-11-11-\d+\.json$/);
    const m = JSON.parse(json.text);
    assert.equal(m.count, n);
    assert.deepEqual(m.issues.map((i) => i.id).sort(), ids);
    assert.equal(m.snapshot.data_sha256, hash);
    assert.equal(m.snapshot.collected_at, '2026-11-11T06:01:47Z');
    const sorted = (q) => [...new URLSearchParams(q)].map(([k, v]) => `${k}=${v}`).sort();
    assert.deepEqual(sorted(m.filter.query), sorted(query), 'the filter query reproduces the view');
    assert.match(m.caveat, /weak labels/i);
    const csv = parseCSV((await download(page, '#dl-csv')).text);
    assert.equal(csv.length - 1, n, 'one CSV row per issue');
    const col = (name) => csv[0].indexOf(name);
    assert.deepEqual(csv.slice(1).map((r) => r[col('id')]).sort(), ids);
    assert.ok(csv.slice(1).every((r) => r[col('data_sha256')] === hash && r[col('source_url')].startsWith('https://github.com/')));
    assert.deepEqual(page.errors, []);
    await page.close();
  });
}

test('manifest screen: filter definition, snapshot, caveat, preview rows; empty set disables download', async () => {
  const page = await open('?app=signalapp/Signal-Android&state=open#/manifest');
  const text = await page.textContent('main section[data-screen="manifest"]');
  assert.match(text, /App: signalapp\/Signal-Android/);
  assert.match(text, /State: open/);
  assert.match(text, /2026-11-11/);
  assert.match(text, /weak label/i);
  const ids = await page.$$eval('#manifest-rows tr', (r) => r.map((x) => x.querySelector('td').textContent.trim()));
  assert.deepEqual([...ids].sort(), expectedIds('app=signalapp/Signal-Android&state=open'));
  assert.deepEqual(await axe(page), []);
  await page.close();
  const empty = await open('?sample=all&q=zzqqxxnotatitle#/manifest');
  assert.equal(await empty.$eval('#manifest-count', (c) => Number(c.dataset.count)), 0);
  assert.ok(await empty.isDisabled('#dl-csv'));
  assert.ok(await empty.isDisabled('#dl-json'));
  assert.match(await empty.textContent('main section[data-screen="manifest"]'), /No issues match/);
  await empty.close();
});

test('manifest screen: data file that fails to load is an error state, downloads disabled', async () => {
  const page = await open('#/manifest', { ready: 'error', setup: (p) => p.route('**/data/issues.json', (r) => r.fulfill({ status: 404, body: 'x' })) });
  assert.match(await page.textContent('#manifest-status'), /Could not load the issue data/);
  assert.ok(await page.isDisabled('#dl-csv'));
  await page.close();
});

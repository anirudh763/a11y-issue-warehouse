// End-to-end test of the explorer in docs/: counts shown for URL filters equal counts
// computed from the warehouse by SQL, untrusted titles stay text, axe-core finds no
// violations in light and dark, and the page works at 320 px.
//
//   make load && make e2e          (or: node --test tests/web/)
//
// Needs Node 20+, the playwright and axe-core packages (tests/web/package.json) and
// data/warehouse.db. SCREENSHOTS=1 also writes docs/screenshots/*.png.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE = process.env.AXE_PATH || require.resolve('axe-core/axe.min.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = path.join(ROOT, 'docs');
const DB = process.env.WAREHOUSE_DB || path.join(ROOT, 'data/warehouse.db');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

let server; let base; let browser;

function expected(query) {
  const out = execFileSync('python3', [path.join(ROOT, 'tests/web/expected_count.py'), '--db', DB, query], { encoding: 'utf8' });
  return Number(out.trim());
}

async function open(query = '', opts = {}) {
  const page = await browser.newPage({ viewport: { width: opts.width || 1280, height: 900 }, colorScheme: opts.scheme || 'light', deviceScaleFactor: opts.dpr || 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}${query}`);
  await page.waitForSelector('html[data-ready="true"]');
  page.errors = errors;
  return page;
}

const shownCount = (page) => page.$eval('#count', (n) => Number(n.dataset.count));

async function axe(page) {
  // evaluate() runs over the DevTools protocol, so the page's CSP (which blocks inline
  // scripts, as it should) does not apply to the injected checker.
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(await readFile(AXE, 'utf8'));
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  return result.violations.map((v) => `${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0].target.join(' ')}`);
}

before(async () => {
  server = createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DOCS, rel.endsWith('/') ? `${rel}index.html` : rel);
    if (!file.startsWith(DOCS)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

test('home view is the accessibility sample, never empty', async () => {
  const page = await open();
  assert.equal(await shownCount(page), expected(''));
  assert.ok(await shownCount(page) > 0);
  assert.equal(await page.$$eval('#rows tr', (r) => r.length), 100);
  assert.deepEqual(page.errors, []);
  await page.close();
});

for (const query of [
  'app=signalapp/Signal-Android&state=open',
  'app=mozilla-mobile/fenix&category=talkback',
  'sample=comparison&app=wordpress-mobile/WordPress-Android&year=2019&year=2020',
  'sample=excluded&app=woocommerce/woocommerce-android',
  'category=label&category=a11y&state=closed',
  'label=acknowledged&sample=all',
  'sample=all&q=dark mode',
  'sample=all&q=%2314593',
]) {
  test(`URL filter ${query}: visible count equals the database`, async () => {
    const page = await open(`?${query}`);
    const want = expected(query);
    assert.equal(await shownCount(page), want);
    assert.equal(await page.$$eval('#rows button.title-btn', (b) => b.length), Math.min(want, 100));
    await page.close();
  });
}

test('typing a search updates the URL and the count', async () => {
  const page = await open();
  await page.fill('#q', 'talkback');
  await page.waitForFunction(() => location.search.includes('q=talkback'));
  await page.waitForFunction((n) => document.querySelector('#count').dataset.count === String(n), expected('q=talkback'));
  // a facet click is reflected in the URL so the view can be shared
  await page.check('#facet-state input[value="open"]');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('state') === 'open');
  assert.equal(await shownCount(page), expected('q=talkback&state=open'));
  await page.close();
});

test('detail drawer shows facts and a GitHub link, Escape returns focus, history is not touched', async () => {
  const page = await open('?app=signalapp/Signal-Android&state=open&sort=created:asc');
  const historyBefore = await page.evaluate(() => history.length);
  const first = page.locator('#rows button.title-btn').first();
  const title = await first.textContent();
  await first.click();
  await page.waitForSelector('dialog#detail[open]');
  assert.equal(await page.textContent('#d-title'), title);
  const href = await page.getAttribute('#d-link', 'href');
  assert.match(href, /^https:\/\/github\.com\/signalapp\/Signal-Android\/issues\/\d+$/);
  assert.match(await page.evaluate(() => location.search), /issue=signalapp%2FSignal-Android%2F\d+/);
  const violations = await axe(page);
  assert.deepEqual(violations, [], 'axe with the drawer open');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#detail').open);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), title);
  assert.doesNotMatch(await page.evaluate(() => location.search), /issue=/);
  // opening and closing both replace the entry, so Back leaves the view in one step
  assert.equal(await page.evaluate(() => history.length), historyBefore);
  await page.close();
});

test('drawer Previous/Next keeps focus on the button and announces the new title', async () => {
  const page = await open('?app=signalapp/Signal-Android&state=open&sort=created:asc');
  const titles = await page.$$eval('#rows button.title-btn', (b) => b.map((x) => x.textContent));
  await page.locator('#rows button.title-btn').first().click();
  await page.waitForSelector('dialog#detail[open]');
  assert.ok(await page.isDisabled('#d-prev'));
  await page.focus('#d-next');
  await page.keyboard.press('Enter');
  assert.equal(await page.textContent('#d-title'), titles[1]);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'd-next');
  assert.equal(await page.getAttribute('#d-live', 'aria-live'), 'polite');
  assert.equal(await page.textContent('#d-live'), `Issue 2 of ${titles.length}: ${titles[1]}`);
  await page.click('#d-prev');
  assert.equal(await page.textContent('#d-title'), titles[0]);
  // Previous is now disabled, so focus moves to Next instead of being lost
  assert.equal(await page.evaluate(() => document.activeElement.id), 'd-next');
  await page.close();
});

test('a shared issue link opens the drawer', async () => {
  const page = await open('?app=signalapp/Signal-Android&state=open');
  const first = page.locator('#rows button.title-btn').first();
  await first.click();
  const url = page.url();
  const title = await page.textContent('#d-title');
  await page.close();
  const again = await open(url.slice(base.length));
  await again.waitForSelector('dialog#detail[open]');
  assert.equal(await again.textContent('#d-title'), title);
  await again.close();
});

test('untrusted text from the URL and from titles is never parsed as HTML', async () => {
  const payload = '<img src=x onerror="window.__pwned=1">';
  const page = await open(`?sample=all&q=${encodeURIComponent(payload)}&label=${encodeURIComponent('<b>x</b>')}`);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.$$eval('main img, #chips img', (n) => n.length), 0);
  assert.equal(await page.inputValue('#q'), payload);
  assert.match(await page.textContent('#chips'), /Title: <img src=x/);
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('label')), null, 'unknown label values are dropped');
  await page.close();
  // Real titles contain markup-like text, e.g. "<unknown>"; it must render literally.
  const p2 = await open('?sample=all&q=%3Cunknown%3E');
  assert.ok(await shownCount(p2) >= 1);
  assert.match(await p2.textContent('#rows button.title-btn'), /<unknown>/);
  assert.equal(await p2.$$eval('#rows unknown', (n) => n.length), 0);
  await p2.close();
});

test('the leakage chart and its table use the measured numbers', async () => {
  const page = await open();
  const csv = await readFile(path.join(ROOT, 'results/classifier_overall.csv'), 'utf8');
  const f1s = csv.trim().split('\n').slice(1).map((l) => l.match(/,([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),\d+,[\d.]+$/)[3]);
  const cells = await page.$$eval('#leak-table tbody tr td:nth-child(5)', (t) => t.map((c) => c.textContent));
  assert.deepEqual(cells.map(Number), f1s.map(Number));
  const labels = await page.$$eval('#chart svg text.value', (t) => t.map((c) => c.textContent));
  assert.deepEqual(labels.map(Number).sort(), f1s.map(Number).sort());
  assert.equal(await page.getAttribute('#chart svg', 'role'), 'img');
  await page.close();
});

for (const scheme of ['light', 'dark']) {
  test(`axe-core: 0 violations, ${scheme}`, async () => {
    const page = await open('', { scheme });
    assert.deepEqual(await axe(page), []);
    await page.close();
    const filtered = await open('?app=mozilla-mobile/fenix&category=screen-reader&state=closed', { scheme });
    assert.deepEqual(await axe(filtered), []);
    await filtered.close();
  });
}

test('at 375 px the table scrolls inside its own region and says so', async () => {
  const page = await open('', { width: 375 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 375);
  assert.ok(await page.isVisible('#scroll-hint'));
  const wrap = await page.$eval('.results .table-wrap', (w) => [w.scrollWidth, w.clientWidth, w.tabIndex, w.getAttribute('role')]);
  assert.ok(wrap[0] > wrap[1], 'table wider than its region');
  assert.deepEqual(wrap.slice(2), [0, 'region']);
  await page.close();
  const wide = await open('', { width: 1280 });
  assert.equal(await wide.isVisible('#scroll-hint'), false);
  await wide.close();
});

test('works at 320 px: no page-level horizontal scroll, axe clean', async () => {
  const page = await open('', { width: 320 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 320);
  assert.deepEqual(await axe(page), []);
  await page.click('#facets > summary');
  await page.check('#facet-state input[value="open"]');
  assert.equal(await shownCount(page), expected('state=open'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await page.close();
});

test('no single-key shortcuts; sort headers are buttons with aria-sort and match the Sort menu', async () => {
  const page = await open();
  await page.keyboard.press('/');
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'q', 'WCAG 2.1.4: no character-key shortcut');
  for (const key of ['title', 'repo', 'state', 'created', 'days', 'comments']) {
    for (let i = 0; i < 2; i += 1) {
      await page.click(`#table th[data-key="${key}"] button`);
      const [sort, dir] = new URLSearchParams(await page.evaluate(() => location.search)).get('sort')?.split(':') || ['created', 'desc'];
      assert.equal(await page.inputValue('#sort'), `${sort}:${dir}`, `Sort menu shows ${sort}:${dir}`);
    }
  }
  await page.click('#table th[data-key="created"] button');
  await page.click('#table th[data-key="comments"] button');
  assert.equal(await page.getAttribute('#table th[data-key="comments"]', 'aria-sort'), 'descending');
  const comments = await page.$$eval('#rows tr td:nth-child(6)', (t) => t.slice(0, 20).map((c) => Number(c.textContent.replace(/,/g, ''))));
  assert.deepEqual(comments, [...comments].sort((a, b) => b - a));
  await page.close();
});

if (process.env.SCREENSHOTS) {
  test('screenshots for the README', async () => {
    const out = path.join(DOCS, 'screenshots');
    await mkdir(out, { recursive: true });
    const page = await open('', { width: 1280, dpr: 2 });
    await page.screenshot({ path: path.join(out, 'explorer.png') });
    await page.locator('#rows button.title-btn').first().click();
    await page.waitForSelector('dialog#detail[open]');
    await page.screenshot({ path: path.join(out, 'detail.png') });
    await page.close();
    const chart = await open('#leakage', { width: 1280, dpr: 2 });
    await chart.locator('#leakage').screenshot({ path: path.join(out, 'keyword-leakage.png') });
    await chart.close();
  });
}

// Shared harness for the browser tests: a static server for docs/, Playwright, axe-core
// and the SQL oracle in expected_count.py.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE = process.env.AXE_PATH || require.resolve('axe-core/axe.min.js');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DOCS = path.join(ROOT, 'docs');
export const DB = process.env.WAREHOUSE_DB || path.join(ROOT, 'data/warehouse.db');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

export const ctx = { server: null, base: '', browser: null };

export async function start() {
  ctx.server = createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DOCS, rel.endsWith('/') ? `${rel}index.html` : rel);
    if (!file.startsWith(DOCS)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => ctx.server.listen(0, '127.0.0.1', r));
  ctx.base = `http://127.0.0.1:${ctx.server.address().port}/`;
  ctx.browser = await chromium.launch();
}

export async function stop() {
  await ctx.browser?.close();
  ctx.server?.close();
}

/** SQL count for an explorer URL query, straight from the warehouse. */
export function expected(query) {
  const out = execFileSync('python3', [path.join(ROOT, 'tests/web/expected_count.py'), '--db', DB, query], { encoding: 'utf8' });
  return Number(out.trim());
}

/** SQL list of "owner/repo#number" ids for an explorer URL query, sorted. */
export function expectedIds(query) {
  const out = execFileSync('python3', [path.join(ROOT, 'tests/web/expected_count.py'), '--db', DB, '--ids', query], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

export async function open(url = '', opts = {}) {
  const context = await ctx.browser.newContext({ viewport: { width: opts.width || 1280, height: opts.height || 900 }, colorScheme: opts.scheme || 'light', deviceScaleFactor: opts.dpr || 1, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (opts.setup) await opts.setup(page);
  await page.goto(`${ctx.base}${url}`);
  await page.waitForSelector(`html[data-ready="${opts.ready || 'true'}"]`);
  page.errors = errors;
  const close = page.close.bind(page);
  page.close = async () => { await close(); await context.close(); };
  return page;
}

export async function axe(page) {
  // evaluate() runs over the DevTools protocol, so the page's CSP does not block the checker.
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(await readFile(AXE, 'utf8'));
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  return result.violations.map((v) => `${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0].target.join(' ')}`);
}

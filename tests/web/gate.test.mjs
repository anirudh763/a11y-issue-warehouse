// Root visual gate for the light rebuild (rebuild.md, "Root visual gate"): screens as hash
// routes, no page overflow at 320/768/1440, the mobile Menu sheet, focus on the H1 after a
// route change, Back/Forward and deep links, axe in light (default) and dark (opt-in), light
// by default under an OS dark preference, no console errors, CSP unchanged.
//
//   make load && make e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ctx, start, stop, open, axe, expected, DOCS } from './helpers.mjs';

before(start);
after(stop);

const SCREENS = [
  ['#/explore', 'Explore candidate issues', 'Explore'],
  ['#/manifest', 'Sample manifest', 'Sample manifest'],
  ['#/methods', 'Methods', 'Methods'],
];

const h1 = (page) => page.evaluate(() => {
  const h = document.querySelector('main section[data-screen]:not([hidden]) h1');
  return h ? h.textContent.trim() : null;
});
const activeIsH1 = (page) => page.evaluate(() => document.activeElement && document.activeElement.tagName === 'H1' &&
  !document.activeElement.closest('[hidden]'));
// The dialog 'close' event (where the page returns focus) is dispatched as a task after
// close(); wait for it so the assertion reads focus after the handler has run.
const settleFocus = (page) => page.waitForFunction(() => document.activeElement.id === 'menu-btn', null, { timeout: 2000 }).catch(() => {});
const fits = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth);

for (const width of [320, 768, 1440]) {
  test(`no page-level horizontal overflow on every screen at ${width} px`, async () => {
    const page = await open('', { width, height: 900 });
    for (const [hash, title] of SCREENS) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForFunction((t) => document.querySelector('main section[data-screen]:not([hidden]) h1')?.textContent.trim() === t, title);
      assert.ok(await fits(page), `${hash} fits at ${width} px (${await page.evaluate(() => document.scrollingElement.scrollWidth)})`);
      // Any table wider than its box scrolls inside a labelled, focusable region.
      const loose = await page.$$eval('main section[data-screen]:not([hidden]) table', (ts) => ts.filter((t) => {
        const wrap = t.closest('[role="region"][aria-label][tabindex="0"]');
        return !wrap;
      }).length);
      assert.equal(loose, 0, `${hash}: every table sits in a labelled scroll region`);
    }
    await page.close();
  });
}

test('each screen has its own route, title and H1; nav marks the current item', async () => {
  const page = await open();
  assert.equal(await h1(page), 'Explore candidate issues', 'Explore is the default screen');
  for (const [hash, title, short] of SCREENS) {
    await page.click(`#rail a[href="${hash}"]`);
    await page.waitForFunction((t) => document.querySelector('main section[data-screen]:not([hidden]) h1')?.textContent.trim() === t, title);
    assert.equal(new URL(page.url()).hash, hash);
    assert.equal(await page.title(), `${short} – Issue Warehouse`);
    assert.equal(await page.getAttribute(`#rail a[href="${hash}"]`, 'aria-current'), 'page');
    assert.equal(await page.$$eval('#rail a[aria-current="page"]', (a) => a.length), 1);
    assert.equal(await page.$$eval('main section[data-screen]:not([hidden])', (s) => s.length), 1, 'only one screen is shown');
    assert.ok(await activeIsH1(page), `focus is on the H1 after going to ${hash}`);
    assert.match(await page.textContent('.crumbs'), new RegExp(`Issue Warehouse\\s*/\\s*${short}`));
  }
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('Explore lists actual candidate rows from all of the data, not an excerpt', async () => {
  const page = await open('#/explore');
  const n = expected('');
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), n);
  assert.equal(await page.textContent('#summary-candidates'), n.toLocaleString('en-US'));
  assert.equal(await page.textContent('#summary-apps'), '15');
  const first = await page.$$eval('#rows tr', (rows) => rows.slice(0, 5).map((r) => r.textContent));
  for (const t of first) assert.match(t, /#\d+/, 'each row shows its issue number');
  const evidence = await page.$$eval('#rows td.c-evidence', (c) => c.map((x) => x.textContent.trim()));
  assert.ok(evidence.length === 100 && evidence.every((e) => /Label|Keyword|Comparison/.test(e)), 'every row says why it was included');
  const links = await page.$$eval('#rows a.gh-link', (a) => a.map((x) => x.href));
  assert.equal(links.length, 100);
  assert.ok(links.every((h) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(h)));
  await page.close();
});

for (const width of [375, 768]) {
  test(`Menu sheet at ${width} px: opens, keeps focus inside, Escape closes and returns focus`, async () => {
    const page = await open('', { width, height: 800 });
    assert.equal(await page.isVisible('#rail'), false, 'no permanent rail');
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    assert.ok(await menu.isVisible());
    const box = await menu.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, 'Menu is a 44 px target');
    await menu.click();
    await page.waitForSelector('#menu-sheet[open]');
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => !!document.activeElement.closest('#menu-sheet')), 'focus stays in the sheet');
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#menu-sheet').open);
    await settleFocus(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-btn', 'keyboard path');
    // Pointer path: the sheet was opened while focus was elsewhere (a tap does not focus the
    // button on every platform), so the browser's own dialog focus restore would go back to
    // the H1. The page's close handler must still put focus on Menu.
    await page.evaluate(() => { document.querySelector('#h-explore').focus(); document.querySelector('#menu-btn').click(); });
    await page.waitForSelector('#menu-sheet[open]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#menu-sheet').open);
    await settleFocus(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-btn', 'pointer path: returned by the close handler');
    // The Close menu button takes the same path.
    await page.evaluate(() => { document.querySelector('#h-explore').focus(); document.querySelector('#menu-btn').click(); });
    await page.click('#menu-close');
    await page.waitForFunction(() => !document.querySelector('#menu-sheet').open);
    await settleFocus(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-btn', 'Close menu returns focus');
    // choosing a destination closes the sheet and lands on that screen's H1
    await menu.click();
    await page.click('#menu-sheet a[href="#/methods"]');
    await page.waitForFunction(() => !document.querySelector('#menu-sheet').open);
    assert.equal(await h1(page), 'Methods');
    assert.ok(await activeIsH1(page));
    await page.close();
  });
}

test('Back/Forward restore the screen and its filters; deep links load directly', async () => {
  const page = await open('?q=talkback&state=open#/explore');
  assert.equal(await page.inputValue('#q'), 'talkback');
  const n = expected('q=talkback&state=open');
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), n);
  await page.click('#rail a[href="#/manifest"]');
  await page.waitForFunction(() => location.hash === '#/manifest');
  assert.equal(await page.$eval('#manifest-count', (c) => Number(c.dataset.count)), n, 'manifest uses the Explore filters');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/explore');
  assert.equal(await h1(page), 'Explore candidate issues');
  assert.equal(await page.inputValue('#q'), 'talkback');
  assert.ok(await page.isChecked('#facet-state input[value="open"]'));
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), n);
  await page.goForward();
  await page.waitForFunction(() => location.hash === '#/manifest');
  assert.equal(await h1(page), 'Sample manifest');
  await page.close();
  const deep = await open('?app=AntennaPod/AntennaPod#/manifest');
  assert.equal(await h1(deep), 'Sample manifest');
  assert.equal(await deep.$eval('#manifest-count', (c) => Number(c.dataset.count)), expected('app=AntennaPod/AntennaPod'));
  await deep.close();
});

test('old links keep working and unknown routes get a Not found screen', async () => {
  for (const [old, title, hash] of [['#about', 'Methods', '#/methods'], ['#leakage', 'Methods', '#/methods'],
    ['#explorer', 'Explore candidate issues', '#/explore'], ['?state=open', 'Explore candidate issues', '#/explore']]) {
    const page = await open(old);
    assert.equal(await h1(page), title, old);
    if (old.startsWith('#') && old !== '#explorer') assert.equal(new URL(page.url()).hash, hash);
    await page.close();
  }
  const about = await open('#about');
  assert.ok(await about.evaluate(() => { const r = document.getElementById('about').getBoundingClientRect(); return r.top < innerHeight; }), '#about scrolls to that section');
  await about.close();
  const page = await open('#/nope');
  assert.equal(await h1(page), 'Page not found');
  assert.equal(await page.title(), 'Page not found – Issue Warehouse');
  await page.click('main section[data-screen="notfound"] a[href="#/explore"]');
  await page.waitForFunction(() => location.hash === '#/explore');
  assert.equal(await h1(page), 'Explore candidate issues');
  await page.close();
});

test('light by default even when the OS prefers dark; dark only by explicit choice, remembered', async () => {
  const page = await open('', { scheme: 'dark' });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(await bg(), 'rgb(255, 255, 255)', 'white catalogue canvas under OS dark');
  assert.notEqual(await page.getAttribute('html', 'data-theme'), 'dark');
  const toggle = page.locator('#rail .theme-toggle');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  await toggle.click();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await bg(), 'rgb(255, 255, 255)');
  await page.reload();
  await page.waitForSelector('html[data-ready="true"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark', 'choice is remembered');
  await page.close();
  // storage that throws (privacy mode) still gives a working light page
  const blocked = await open('', { setup: (p) => p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); }) });
  assert.equal(await blocked.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)');
  await blocked.click('#rail .theme-toggle');
  assert.equal(await blocked.getAttribute('html', 'data-theme'), 'dark');
  assert.deepEqual(blocked.errors, []);
  await blocked.close();
});

for (const theme of ['light', 'dark']) {
  for (const width of [1280, 320]) {
    test(`axe-core 0 violations on every screen, ${theme}, ${width} px`, async () => {
      const page = await open('', { width, setup: theme === 'dark' ? (p) => p.addInitScript(() => { try { localStorage.setItem('warehouse-theme', 'dark'); } catch {} }) : undefined });
      assert.equal(await page.getAttribute('html', 'data-theme'), theme === 'dark' ? 'dark' : 'light');
      for (const [hash, title] of [...SCREENS, ['#/nope', 'Page not found']]) {
        await page.evaluate((h) => { location.hash = h; }, hash);
        await page.waitForFunction((t) => document.querySelector('main section[data-screen]:not([hidden]) h1')?.textContent.trim() === t, title);
        assert.deepEqual(await axe(page), [], `${hash} ${theme} ${width}`);
      }
      if (width === 320) {
        await page.click('#menu-btn');
        await page.waitForSelector('#menu-sheet[open]');
        assert.deepEqual(await axe(page), [], `menu sheet ${theme}`);
      }
      assert.deepEqual(page.errors, []);
      await page.close();
    });
  }
}

test('CSP is unchanged from the previous release and the page logs no errors', async () => {
  const html = await readFile(path.join(DOCS, 'index.html'), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(csp, "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
  assert.doesNotMatch(html, /<script>(?!<\/script>)/, 'no inline scripts');
  assert.doesNotMatch(html, /prefers-color-scheme/);
  for (const css of ['ui.css', 'explorer.css']) {
    assert.doesNotMatch(await readFile(path.join(DOCS, css), 'utf8'), /prefers-color-scheme/, `${css} has no automatic dark switch`);
  }
  const page = await open('#/methods');
  assert.deepEqual(page.errors, []);
  assert.ok(ctx.base);
  await page.close();
});

// Signature pattern (addendum): faceted catalogue with an issues-over-time strip that filters by
// year, is keyboard operable and has a table alternative with the same numbers.
test('issues-over-time strip: live counts, keyboard toggles the year filter, table alternative agrees', async () => {
  const page = await open('?app=AntennaPod/AntennaPod');
  assert.ok(await page.$('#timeline[role="region"][aria-label]'), 'strip is a labelled region');
  const bars = await page.$$eval('#timeline button[data-year]', (b) => b.map((x) => ({ year: x.dataset.year, n: Number(x.dataset.count), pressed: x.getAttribute('aria-pressed'), name: x.textContent.replace(/\s+/g, ' ').trim() })));
  assert.ok(bars.length >= 10, `one bar per year (${bars.length})`);
  for (const b of bars) {
    assert.equal(b.n, expected(`app=AntennaPod/AntennaPod&year=${b.year}`), `bar ${b.year} count is live for the app filter`);
    assert.equal(b.pressed, 'false');
    assert.match(b.name, new RegExp(`${b.year}.*${b.n}`));
  }
  const busy = bars.filter((b) => b.n > 0).sort((a, b) => b.n - a.n)[0];
  await page.focus(`#timeline button[data-year="${busy.year}"]`);
  await page.keyboard.press('Enter');
  await page.waitForFunction((y) => new URLSearchParams(location.search).getAll('year').includes(y), busy.year);
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), busy.n);
  assert.equal(await page.getAttribute(`#timeline button[data-year="${busy.year}"]`, 'aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.year), busy.year, 'focus stays on the bar');
  assert.match(await page.textContent('#chips'), new RegExp(`Year opened: ${busy.year}`));
  // table alternative, same numbers
  await page.click('#timeline-alt > summary');
  const rows = await page.$$eval('#timeline-table tbody tr', (r) => r.map((x) => [x.cells[0].textContent.trim(), Number(x.cells[1].textContent.replace(/\D/g, ''))]));
  assert.deepEqual(rows, bars.map((b) => [b.year, b.n]));
  await page.keyboard.press('Shift+Tab'); // back toward the strip; Space on the bar clears it again
  await page.focus(`#timeline button[data-year="${busy.year}"]`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('year'));
  for (const sel of ['#timeline button[data-year]']) {
    const box = await page.locator(sel).first().boundingBox();
    assert.ok(box.height >= 44 && box.width >= 24, 'bar target is at least 24 wide and 44 tall');
  }
  assert.deepEqual(await axe(page), []);
  await page.close();
});

test('research catalogue: wrapping facets with live counts precede full-width records', async () => {
  const page = await open('', { width: 1440 });
  const [facets, results] = await page.evaluate(() => ['#facets', '#results'].map((s) => document.querySelector(s).getBoundingClientRect()));
  assert.ok(facets.bottom <= results.top && Math.abs(facets.width - results.width) < 2, 'facets form a band above full-width records');
  const groups = await page.$$eval('#facet-list fieldset', (list) => list.map((x) => x.getBoundingClientRect().top));
  assert.equal(new Set(groups).size, 1, 'facet groups share a horizontal band on desktop');
  assert.ok(await page.$eval('#rows tr:first-child', (row) => row.getBoundingClientRect().bottom) <= 900, 'a complete real record fits inside a 900 px desktop viewport');
  for (const selector of ['#facet-app .facet-options', '#facet-label .facet-options']) {
    const region = page.locator(selector);
    assert.equal(await region.getAttribute('tabindex'), '0');
    assert.match(await region.getAttribute('aria-label'), /scroll for more/);
    await region.focus();
    await page.keyboard.press('End');
    await page.waitForFunction((s) => document.querySelector(s).scrollTop > 0, selector);
    assert.ok(await region.evaluate((el) => el.scrollTop) > 0, `${selector} scrolls by keyboard`);
  }
  const counts = await page.$$eval('#facet-state .facet-row', (r) => r.map((x) => [x.querySelector('input').value, Number(x.querySelector('.f-count').textContent.replace(/\D/g, ''))]));
  for (const [v, n] of counts) assert.equal(n, expected(`state=${v}`));
  await page.close();
});

test('phone facets: expand, select, collapse and Back preserve visible filters and counts', async () => {
  const page = await open('', { width: 320, height: 900 });
  assert.equal(await page.getAttribute('#facets', 'open'), null);
  const summary = await page.locator('#facets > summary').boundingBox();
  assert.ok(summary.height >= 44 && summary.width >= 44);
  assert.ok(await page.$eval('#rows tr:first-child', (row) => row.getBoundingClientRect().top) < 1800, 'records are within two phone viewports with facets closed');
  await page.click('#facets > summary');
  await page.check('#facet-app input[value="AntennaPod/AntennaPod"]');
  await page.check('#facet-state input[value="open"]');
  await page.click('#facets > summary');
  assert.equal(await page.getAttribute('#facets', 'open'), null);
  assert.equal(await page.textContent('#facet-summary'), '2 active');
  assert.match(await page.textContent('#chips'), /App: AntennaPod\/AntennaPod/);
  assert.match(await page.textContent('#chips'), /State: Open/);
  assert.equal(await page.isVisible('#clear'), true);
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), expected('app=AntennaPod/AntennaPod&state=open'));
  await page.goBack();
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('state'));
  assert.equal(await page.textContent('#facet-summary'), '1 active');
  assert.equal(await page.getAttribute('#facets', 'open'), null);
  await page.click('#facets > summary');
  assert.equal(await page.isChecked('#facet-app input[value="AntennaPod/AntennaPod"]'), true);
  assert.equal(await page.isChecked('#facet-state input[value="open"]'), false);
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), expected('app=AntennaPod/AntennaPod'));
  await page.click('#clear');
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), expected(''));
  await page.close();
});

test('in-app Back/Forward revert and reapply a filter change (checkbox and count)', async () => {
  const page = await open('#/explore');
  const all = expected('');
  const open_ = expected('state=open');
  const box = '#facet-state input[value="open"]';
  assert.equal(await page.isChecked(box), false);
  await page.check(box);
  await page.waitForFunction(() => new URLSearchParams(location.search).get('state') === 'open');
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), open_);
  await page.goBack();
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('state'));
  await page.waitForFunction((n) => document.querySelector('#count').dataset.count === String(n), all, { timeout: 3000 }).catch(() => {});
  assert.equal(await page.isChecked(box), false, 'Back unchecks the filter');
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), all, 'Back restores the count');
  assert.equal(await page.$eval('#timeline button[data-year="2020"]', (b) => Number(b.dataset.count)), expected('year=2020'), 'Back restores the strip counts');
  await page.goForward();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('state') === 'open');
  await page.waitForFunction((n) => document.querySelector('#count').dataset.count === String(n), open_, { timeout: 3000 }).catch(() => {});
  assert.equal(await page.isChecked(box), true, 'Forward checks it again');
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), open_, 'Forward restores the filtered count');
  // and a year chosen in the strip goes the same way
  await page.click('#timeline button[data-year="2020"]');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('year') === '2020');
  await page.goBack();
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('year'));
  await page.waitForFunction(() => document.querySelector('#timeline button[data-year="2020"]').getAttribute('aria-pressed') === 'false', null, { timeout: 3000 }).catch(() => {});
  assert.equal(await page.getAttribute('#timeline button[data-year="2020"]', 'aria-pressed'), 'false');
  assert.equal(await page.$eval('#count', (c) => Number(c.dataset.count)), open_);
  await page.close();
});

// Every interactive target on Explore and Sample manifest is at least 44 x 44 CSS px, except
// links inside running text (WCAG 2.5.8 inline exception). Checkboxes and radios count their
// whole clickable row (input + label).
const TARGETS = ['button', 'select', 'input[type="search"]', 'summary', '.nav a', '.crumbs a', '.rail-foot a',
  '.gh-link', '#to-manifest', '.facet-row', '.chip', '.toc a'].join(',');
for (const width of [320, 1440]) {
  test(`44 px targets on Explore and Sample manifest at ${width} px`, async () => {
    const page = await open('?q=talkback#/explore', { width, height: 900 });
    if ((await page.getAttribute('#facets', 'open')) === null) await page.click('#facets > summary');
    await page.click('#timeline-alt > summary');
    for (const hash of ['#/explore', '#/manifest']) {
      if (hash !== '#/explore') {
        await page.evaluate((h) => { location.hash = h; }, hash);
        await page.waitForFunction((h) => location.hash === h, hash);
      }
      const small = await page.$$eval(TARGETS, (els) => els.filter((e) => {
        if (e.closest('[hidden]') || e.closest('dialog:not([open])') || e.classList.contains('sr-only')) return false;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return false; // not rendered (e.g. the rail at 320 px)
        return r.width < 44 || r.height < 44;
      }).map((e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${e.className} "${e.textContent.trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
      const counted = await page.$$eval(TARGETS, (els) => els.filter((e) => e.getBoundingClientRect().width > 0).length);
      assert.ok(counted > 20, `${hash}: measured ${counted} targets`);
      assert.deepEqual(small, [], `${hash} at ${width} px`);
    }
    await page.close();
  });
}

// The issues table stacks its rows when the results column is too narrow for seven columns,
// so the region does not scroll sideways at common desktop widths; if it ever does scroll,
// the "scrolls sideways" hint is shown.
for (const width of [1000, 1250, 1300, 1440, 1920]) {
  test(`issues table at ${width} px: no sideways scroll in its region, hint only when it scrolls`, async () => {
    const page = await open('#/explore', { width, height: 900 });
    const [sw, cw] = await page.$eval('#results .table-wrap', (w) => [w.scrollWidth, w.clientWidth]);
    const hint = await page.isVisible('#scroll-hint');
    if ([1000, 1250, 1440].includes(width)) assert.ok(sw <= cw, `table fits its region at ${width} (${sw} <= ${cw})`);
    assert.equal(hint, sw > cw + 1, 'hint visible exactly when the table scrolls');
    assert.ok(await fits(page));
    await page.close();
  });
}

test('document semantics (anti-slop R-39): landmarks, one visible H1, lang, no zoom lock', async () => {
  const page = await open('#/explore');
  const info = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    landmarks: ['header', 'nav', 'main', 'footer'].map((t) => document.querySelectorAll(t).length > 0),
    h1: [...document.querySelectorAll('h1')].filter((h) => h.offsetParent !== null).length,
    viewport: document.querySelector('meta[name="viewport"]').content,
    pointer: getComputedStyle(document.querySelector('#facet-list label')).cursor,
  }));
  assert.equal(info.lang, 'en');
  assert.deepEqual(info.landmarks, [true, true, true, true]);
  assert.equal(info.h1, 1);
  assert.doesNotMatch(info.viewport, /user-scalable=no|maximum-scale=1/);
  assert.equal(info.pointer, 'pointer');
  await page.close();
});

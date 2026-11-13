# Proposed README additions (for the conductor to merge)

Everything below was measured on 2026-11-12 in a cloud container on branch `web/explorer`.
The Pages URL works only after GitHub Pages is enabled for `main` / `docs`.

---

## Explorer (insert after the diagram at the top)

**Browse the issues:** https://anirudh763.github.io/a11y-issue-warehouse/

![Explorer: facet sidebar, issue table, 1,187 accessibility issues](docs/screenshots/explorer.png)

A static page in `docs/` for accessibility researchers and Android maintainers. It opens on
the 1,187 accessibility issues, newest first. Filter by app, accessibility evidence (the
app's accessibility label, or which search word the issue mentions), state, year opened and
GitHub label; switch between the accessibility sample, the comparison sample and the 166
excluded keyword hits; search titles. Every filter is in the address, so a view can be
shared, for example
`?app=signalapp/Signal-Android&state=open` or `?app=mozilla-mobile/fenix&category=talkback`.
Choosing a title opens a panel with its labels, dates, which queries returned it, which
search words it contains, and a link to the issue on GitHub.

The page shows titles, labels, dates and links only: no author names, avatars or issue
bodies. Its data, `docs/data/issues.json` (426 KB, 127 KB gzipped), is written by
`make site` from the warehouse; CI rebuilds the warehouse and fails if the file is not a
fresh export (`make site-check`). It also charts the keyword-leakage result from
`results/classifier_overall.csv`, with the numbers repeated in a table.

```
make load && make site        # data/raw -> data/warehouse.db -> docs/data/issues.json
make site-check               # fails if docs/data/issues.json is stale
python3 -m http.server -d docs   # then open http://localhost:8000/
cd tests/web && npm ci && cd ../.. && make e2e   # browser test (Playwright, axe-core)
```

## Tests (replace the "Tests" section)

```
make test   ->  63 passed
make e2e    ->  18 tests, 18 passed
```

`tests/test_export_site.py` checks that the export has the same number of issues per app
and per sample as the database (2,643 total; 1,187 / 1,290 / 166), that the committed
`docs/data/issues.json` equals a fresh export of `data/raw/`, and that no body, login or
avatar URL from the recorded pages reaches the export. `tests/web/explorer.test.mjs` opens
the page in Chromium, applies filters through the address and checks that the count on
screen equals a count computed from the database by separate SQL
(`tests/web/expected_count.py`); it also checks that markup in titles and in the address
stays text, and runs axe-core.

Accessibility: the explorer passes automated axe-core checks (WCAG 2.0/2.1/2.2 A and AA
rules plus best practices) with 0 violations in the light and dark themes, with the detail
panel open, and at 320 px width. It has not been tested by hand with a screen reader.

## Security (new short section)

Scanned with bandit, pip-audit, npm audit and semgrep (the semgrep registry was not
reachable from the build machine, so semgrep ran with a small local rule set for HTML
sinks, SQL built from strings, `shell=True` and workflow script injection). No
high-severity findings in the code. Changes made: the explorer writes all issue text with
`textContent` and has a Content-Security-Policy without inline scripts; the CI workflow
now has read-only token permissions, pins actions to commit SHAs and does not keep the
checkout credentials; `hashlib.sha1` in `extract.py` (used only to name raw files) is
marked `usedforsecurity=False`, with a test that file names did not change.

## Repository layout (add these lines)

```
warehouse/export_site.py  warehouse -> docs/data/issues.json for the explorer
docs/                     the explorer (static HTML, CSS, JS; GitHub Pages)
tests/web/                Playwright + axe-core browser test of the explorer
```

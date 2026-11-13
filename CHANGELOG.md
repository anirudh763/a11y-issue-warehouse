# Changelog

## Unreleased

- Email redaction: real contact addresses in issue titles and bodies are replaced with
  `[email redacted]` (11 matches in 8 issues; 13 in 9 of the 496 pages). Placeholder,
  role/no-reply, add-on-ID and non-free-mail code-literal strings are kept. `extract` redacts on save;
  `python3 -m warehouse.extract --redact DIR` rewrites saved pages (idempotent). Rules and
  counts in DATA.md; `tests/test_redact.py`. Git history is not rewritten.
- `reproduction/requirements.lock` pins the versions that produced `reproduction/results/`.
- Rebuilt outputs: `results/`, the label shares and the README's warehouse numbers are
  byte-identical; the explorer data changes in one title (fenix#28360 reads
  `[email redacted]`). Six issue bodies used by `reproduction/` changed, so its classifier
  scores moved slightly (at most 0.036 in a fold mean or pooled score); the README and
  `reproduction/README.md` quote the rebuilt numbers.

## 0.1.0 – 2026-11-13

First tagged version. The data is the snapshot collected from the GitHub search API on
2026-11-11 (newest issue opened 2026-11-09); `data/raw/` and every number in the README are
unchanged by the usability changes below.

### Usability (this release)

- `make serve` builds the warehouse and the explorer data, then serves `docs/` on
  http://localhost:8000/ (localhost only). CI runs it and checks that `/` and
  `/data/issues.json` answer 200.
- Explorer: a one-line note by the results says the labels are weak, names a real example
  (NewPipe's "Release 0.29.2"), and links to About the data.
- Explorer at phone width (640 px and below): each issue is a stacked row with every value
  on screen, so neither the page nor the table scrolls sideways. Table roles are set in the
  markup so cells are still announced with their column.
- Explorer: filter checkboxes and radios are 24 x 24 CSS px (WCAG 2.5.8).
- Explorer: a `<noscript>` message with a link to the data file, and an SVG favicon.
- Data minimisation: saved raw pages no longer store `user`, `assignee(s)` or
  `milestone.creator` (logins, avatar and profile URLs), which nothing used. `extract` drops
  them on save; `--minimise DIR` rewrote the 496 committed pages. Warehouse, label shares,
  `results/`, the explorer data and the reproduction inputs are byte-identical afterwards.
  Test fixtures use placeholder authors. DATA.md states the licence basis, the removal route
  and what personal data remains in issue text.
- `warehouse.__version__`, printed by `python3 -m warehouse.load --version` and
  `python3 -m warehouse.export_site --version`, with a test that it matches the top release
  in this file.
- SECURITY.md (beta status, security contact, supported scope), CONTRIBUTING.md, issue
  templates and a pull-request template.
- README: says up front what the project is (a reproducible dataset pipeline with a static
  explorer, weak labels), adds "How to cite" and "Known label noise", and says who the
  explorer is intended for instead of implying it was validated with them.

### Earlier in 0.1.0 (2026-11-11 to 2026-11-13)

- Pipeline: extract from the GitHub search API to saved pages, idempotent SQLite load,
  19 data-quality checks, analysis SQL, an index benchmark and a TF-IDF classifier with
  leave-one-repository-out scoring (initial commit).
- Static explorer for GitHub Pages with filters kept in the address, an issue panel and the
  keyword-leakage chart (#1); keyboard, 200% zoom and error-state tests, root README and
  font licence (#2).
- Explorer fixes: keep a search typed just before a filter change (#3); keep focus on a
  just-unchecked zero-count filter and fix search races (#6).
- Docs: computed label-only and fenix shares; "accessibility-issue sample" wording (#5).
- `reproduction/`: the method of Aljedaani et al. (2022) applied to this dataset (#4).

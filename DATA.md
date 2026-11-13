# Data

## Ownership, licence and removal

The issue titles and bodies in `data/raw/` and `tests/fixtures/raw/` were written by the
people who filed them on GitHub and belong to those authors. They are **not** covered by
this repository's MIT licence (which covers the code only) and no other licence is claimed
for them. They are public GitHub content, redistributed here non-commercially for research,
under GitHub's Terms of Service, so that the analysis can be re-run offline. The source
repositories are listed in the table below; every record keeps its GitHub issue URL
(`html_url`, checked by `tests/test_minimise.py`), so each one can be traced to its original.

**Removal:** to have a record removed from this copy, open an issue here (the "Wrong label
or removal request" template), or, if you prefer not to post publicly, use the contact in
[SECURITY.md](SECURITY.md). Removal requests from the person who filed an issue are honoured.

## Personal data and minimisation

- **Dropped (2026-11-13):** the `user`, `assignee`, `assignees` and `milestone.creator`
  objects (GitHub logins, avatar and profile URLs) are not stored. Nothing in the pipeline,
  the analysis or `reproduction/` used them. `warehouse.extract` drops them when it saves a
  page, and `python3 -m warehouse.extract --minimise data/raw` removed them from the 496
  pages saved on 2026-11-11 (3,312 items). After that change the warehouse, the label
  shares, every file in `results/`, `docs/data/issues.json` and the two built inputs of
  `reproduction/` are byte-identical; only the hash of the raw pages changed. That hash was
  refreshed in `reproduction/results/data_hashes.csv` (then `8eeebf81…`, previously `b08b01c3…`) and a test
  checks it against the committed pages.
  Earlier versions of the pages remain in the git history.
- **Test fixtures:** the 13 pages in `tests/fixtures/raw/` keep an author object, with each
  real author replaced by a placeholder (`fixture-user-N`, `example.invalid` URLs), so the
  export privacy test still has author data to look for.
- **Contact email addresses redacted (2026-11-13):** see "Email redaction" below.
- **Still present in issue text:** apart from that redaction, titles and bodies are kept as
  written, because the analysis and `reproduction/` use them. They can contain usernames
  (@mentions), names and links.
- **Explorer export (`docs/data/issues.json`, the published site):** titles, labels, dates
  and counts only; no bodies, logins or avatars. Any email-shaped string left in a title or
  label is replaced with "[email removed]" as a second line of defence (none since the
  redaction; mozilla-mobile/fenix#28360, whose whole title was an address, now reads
  "[email redacted]"). `tests/test_export_site.py` checks this.

## Email redaction

**Policy.** Real contact email addresses in issue titles and bodies are replaced with
`[email redacted]`. Nothing else in the text changes, and every issue keeps its `number`
and `html_url`, so each record is still traceable to its GitHub original. Every
email-shaped string is put in exactly one category by `warehouse/redact.py`
(deterministic rules, bounded regular expression, no network):

| Category | Rule | Action |
|---|---|---|
| Not an address | file names such as `icon@2x.png` | kept |
| Code literal | inside inline backticks or a fenced code block | kept |
| Software identifier | a browser add-on ID in a pasted extension list (Firefox add-on IDs are written like addresses): an extension/add-on is mentioned in the 300 characters before it, its line does not mention mail or contact, and its domain is not a free-mail provider | kept |
| Placeholder or example | `example.com/.org/.net`, `*.invalid`, `*.test`, template forms such as `user@domain.com` | kept |
| Role, service or no-reply | `*@users.noreply.github.com`, `*.gserviceaccount.com`, `noreply@…`, `support@…`, `security@…`, `team@…` and similar | kept |
| Contact | everything else | **replaced with `[email redacted]`** |

**Counts on the committed pages** (counts and categories only; no values were printed
while classifying). Per distinct issue (2,643 issues), titles and bodies:

| Category | Matches | Issues | Of which in titles |
|---|---|---|---|
| Not an address | 0 | 0 | 0 |
| Code literal | 2 | 1 | 0 |
| Software identifier | 62 | 8 | 0 |
| Placeholder or example | 2 | 2 | 0 |
| Role, service or no-reply | 43 | 41 | 0 |
| Contact (redacted) | 9 | 7 | 1 |

Because the same issue can be saved in more than one page, the 496 pages hold 11 contact
matches; `python3 -m warehouse.extract --redact data/raw` rewrote the 8 pages that held them
and a second run rewrites 0. Two contact matches were at free-mail providers. The two
code-literal matches (one issue) are at free-mail providers and are kept as written under
this policy; a removal request covers them like any other text. The looser pattern used by
the explorer export also matches 31 strings that are not addresses (19 version strings
such as `lib@1.2.3`, 12 with an underscore or digits where a domain would be); they are not
counted above. The rules are heuristics: an address the rules misclassify is kept, and a
removal request (below) is the route to fix it.

**Future pulls.** `warehouse.extract` redacts when it saves a page, so `make data` never
writes a contact address to `data/raw/`. `python3 -m warehouse.extract --redact DIR` applies
the same redaction to pages already saved (titles and bodies only; idempotent; prints the
counts above, never values). `tests/test_redact.py` covers each category with synthetic
text and checks that the committed pages hold no unredacted contact address.

**Rebuilding.** `make load` updates a stored issue only when its `updated_at` is newer, so
an existing `data/warehouse.db` keeps the old text; rebuild with `make clean load`.

**Effect on the outputs (rebuilt from a clean database on 2026-11-13).** Byte-identical
(`cmp`) before and after: every file in `results/` except `index_benchmark.md` (its timings
differ on every run, so the committed file was kept), the label shares printed by
`analysis/label_shares.py`, and the `make check` results, so no number in the root README
that comes from the warehouse changed. `docs/data/issues.json` changed in one title
(fenix#28360, as above). In `reproduction/`, six of the 2,452 issue bodies changed, so the
two built inputs and the trained-classifier scores changed slightly (largest change in a
fold mean or pooled score 0.036; details and the new tables in `reproduction/README.md`).
New SHA-256 prefixes: raw pages `293caa8a…` (was `8eeebf81…`), `dataset.csv` `c5d3ef6a…` (was
`7610c59c…`), `preprocessed.csv` `eaf02f86…` (was `97e224a6…`); full values in
`reproduction/results/data_hashes.csv`, checked by a test.

**Git history.** The history was not rewritten: commits before this change still contain the
unredacted pages (and, before 2026-11-13, the people objects). Anyone can read them in the
history of this public repository; the addresses were also posted publicly on GitHub by
their authors. To have an address removed from the current pages, use the removal route
above; a request to purge it from the history is handled the same way and would need a
history rewrite of this repository.

## What was collected

Collected on 2026-11-11 (UTC) with `make data`, which runs
`python3 -m warehouse.extract --config config.json --raw data/raw --log data/queries_run.json`.

Endpoint: `GET https://api.github.com/search/issues?q=<query>+created:<range>&sort=created&order=asc&per_page=<n>&page=<p>`

484 queries, 496 response pages, saved one gzip JSON file per page under
`data/raw/<owner>__<repo>/`. `data/queries_run.json` lists every query with its date range,
result count and page count; the table below is a summary of that file.

For every repository three kinds of query were run:

1. label: `repo:<repo> is:issue label:"<label>" created:2008-01-01..2026-11-11`
2. keyword: `repo:<repo> is:issue talkback OR "screen reader" OR accessibility OR a11y in:title,body created:2008-01-01..2026-11-11`
3. comparison, once per calendar month that had at least one result from 1 or 2:
   `repo:<repo> is:issue created:<first day>..<last day of the month>`, oldest first,
   fetching as many issues as that month had results from 1 and 2.

| Repository | Label query | Label results | Keyword results | Comparison queries (months) | Comparison issues fetched |
|---|---|---|---|---|---|
| [wordpress-mobile/WordPress-Android](https://github.com/wordpress-mobile/WordPress-Android) | `label:"Accessibility"` | 94 | 224 | 86 | 238 |
| [AntennaPod/AntennaPod](https://github.com/AntennaPod/AntennaPod) | `label:"Area: Accessibility"` | 24 | 19 | 18 | 30 |
| [signalapp/Signal-Android](https://github.com/signalapp/Signal-Android) | `label:"a11y"` | 12 | 57 | 46 | 60 |
| [thunderbird/thunderbird-android](https://github.com/thunderbird/thunderbird-android) | `label:"type: accessibility"` | 17 | 30 | 17 | 35 |
| [nextcloud/android](https://github.com/nextcloud/android) | `label:"accessibility"` | 7 | 33 | 32 | 38 |
| [element-hq/element-android](https://github.com/element-hq/element-android) | `label:"A11y"` | 9 | 16 | 17 | 22 |
| [element-hq/element-x-android](https://github.com/element-hq/element-x-android) | `label:"A11y"` | 41 | 46 | 18 | 51 |
| [organicmaps/organicmaps](https://github.com/organicmaps/organicmaps) | `label:"Accessibility"` | 7 | 26 | 22 | 31 |
| [Automattic/pocket-casts-android](https://github.com/Automattic/pocket-casts-android) | `label:"[Area] Accessibility"` | 6 | 13 | 11 | 13 |
| [duckduckgo/Android](https://github.com/duckduckgo/Android) | (no label) |  | 20 | 15 | 20 |
| [mozilla-mobile/fenix](https://github.com/mozilla-mobile/fenix) | `label:"access"` | 406 | 549 | 50 | 594 |
| [home-assistant/android](https://github.com/home-assistant/android) | (no label) |  | 14 | 12 | 14 |
| [TeamNewPipe/NewPipe](https://github.com/TeamNewPipe/NewPipe) | `label:"accessibility"` | 11 | 39 | 34 | 45 |
| [woocommerce/woocommerce-android](https://github.com/woocommerce/woocommerce-android) | `label:"category: accessibility"` | 49 | 117 | 42 | 126 |
| [ankidroid/Anki-Android](https://github.com/ankidroid/Anki-Android) | `label:"Accessibility"` | 14 | 45 | 36 | 50 |

The same issue can be returned by more than one query. After removing repeats the pages
hold 2,643 distinct issues (output of `make load`).

## Repositories considered and dropped

`mozilla-mobile/firefox-android` returned 2 issues in total and no accessibility results
from this endpoint, so `mozilla-mobile/fenix` (the archived Firefox for Android repository)
is used instead. `wikimedia/apps-android-wikipedia` returned 0 issues (it does not track
issues on GitHub). Both counts come from one-off `gh api "search/issues?q=repo:<repo>+is:issue&per_page=1"`
calls made on the collection date.

## Known property of the keyword results

GitHub returned 180 issues for the keyword query that contain none of the four search
words: all 180 contain "screen" and "reader" as separate words (WordPress and WooCommerce
have a feature called "Reader"). They stay in `data/raw/` and in the `issues` table, and
are excluded from the accessibility class by the `issue_class` view. See the README.

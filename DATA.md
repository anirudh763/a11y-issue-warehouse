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
  refreshed in `reproduction/results/data_hashes.csv` (now `8eeebf81…`, previously `b08b01c3…`) and a test
  checks it against the committed pages.
  Earlier versions of the pages remain in the git history.
- **Test fixtures:** the 13 pages in `tests/fixtures/raw/` keep an author object, with each
  real author replaced by a placeholder (`fixture-user-N`, `example.invalid` URLs), so the
  export privacy test still has author data to look for.
- **Still present in issue text:** titles and bodies are kept as written, because the
  analysis and `reproduction/` use them. They can contain usernames (@mentions), names and
  links. An automated scan of the raw pages found email-shaped strings in 3 placeholder or
  example forms, 2 project role addresses, and 25 other addresses (3 at free-mail
  providers) in 16 issues, one of them in a title. These are left in the raw pages, because
  changing the text would change the analysed inputs; they are published as their authors
  posted them on GitHub.
- **Explorer export (`docs/data/issues.json`, the published site):** titles, labels, dates
  and counts only; no bodies, logins or avatars. Any email-shaped string in a title or
  label is replaced with "[email removed]" (1 title). `tests/test_export_site.py` checks this.

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

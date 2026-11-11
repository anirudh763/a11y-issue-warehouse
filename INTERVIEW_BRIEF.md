# Interview brief: a11y-issue-warehouse

## What it does, in three sentences

It pulls accessibility bug reports, and a date-matched sample of other issues, from 15
open-source Android app repositories through the GitHub search API and saves every
response page. It loads those pages into a normalized SQLite database with idempotent
upserts, runs 19 data-quality checks, and answers questions with SQL (window functions
and CTEs). A small leave-one-repository-out classifier then tests whether accessibility
reports can be recognised without the words that were used to find them.

## How the data flows, file by file

1. `config.json`: the 15 repositories, each one's accessibility label, the keyword query.
2. `warehouse/extract.py`
   - `http_get` picks the transport: `gh api -i` if `gh` exists, otherwise `urllib` with `GITHUB_TOKEN`.
   - `fetch_json` retries on 403/429, sleeping for `Retry-After`, or until the rate-limit reset time, or 60 s.
   - `search_all` pages through a query; if a date range has more than 1,000 results it halves the range and recurses.
   - `run` does, per repository: label query, keyword query, then one comparison query per month sized to that month's hits. Each page goes to `data/raw/` as gzip JSON; each query is logged in `data/queries_run.json`.
3. `warehouse/load.py`: reads every page in sorted order, one transaction per page. `UPSERT_ISSUE` writes a row only if the incoming `updated_at` is newer. Labels are replaced only when the issue row was written. `issue_sources` records which kind of query returned the issue. One `load_runs` row per run.
4. `warehouse/schema.sql`: six tables, one index, and the `issue_class` view that decides accessibility / comparison / left out.
5. `warehouse/checks.sql` + `checks.py`: each check is a SELECT returning a count of bad rows.
6. `analysis/01..05_*.sql` + `run_analysis.py`: CSVs and `results/summary.md`. `bench_index.py` times query 05 with and without the index. `classify.py` is the classifier.

## The three hardest questions, with honest answers

**1. "Your positive class was defined by keywords and then you built a classifier for it. Isn't that circular?"**
Mostly yes, and the README says so. 1,068 of 1,187 positives contain a search word by
construction, so the keyword rule scores F1 0.948 against its own definition and the
trained model on raw text is worse (0.849). The only non-circular evidence is the masked
variant (F1 0.756, interval 0.736 to 0.776, on repositories the model never saw) and the
114 label-only positives with no search word, of which the masked model finds 71.1%. That
says the reports differ in more than four words. It does not say the model finds
accessibility bugs in general: nothing was hand-labelled, and the negatives were not verified.

**2. "Accessibility issues take three times longer to close (71.8 vs 24.0 days). Can you claim that?"**
Only as a description of this sample. Reasons to doubt a causal reading: it covers closed
issues only; "closed" includes won't-fix and bot closures; one archived repository
(fenix) supplies 49% of the accessibility issues; the comparison sample is the oldest
issues of each month rather than a random draw; issue types differ (accessibility issues
are more often feature requests in some repositories). What holds up better is the
per-repository direction: longer median in 13 of 15 repositories. I would not quote the
pooled ratio as a finding without a proper model (for example survival analysis with
repository as a factor), which this project does not do.

**3. "How do you know the load is idempotent, and what breaks the incremental mode?"**
Idempotent: the upsert has `WHERE excluded.updated_at > issues.updated_at`, label rows
are touched only when the issue row was written, and source rows use `INSERT OR IGNORE`.
`tests/test_load.py` loads twice and asserts `rows_changed == 0` and identical table
dumps; on the real data the second `make load` reported `rows_changed 0`. A weakness: two
copies with the same `updated_at` but different content would keep the first one read.
Incremental mode skips any item at or below the repository's newest stored `updated_at`.
That is wrong for a brand-new old issue (for example a new comparison sample), which it
would skip. The check `issue_count_matches_raw_pages` would then fail, and the fix is a
full load. Also, only the test suite has exercised an incremental load that changes rows;
the one live run found nothing newer.

Other things worth knowing cold: why 180 keyword hits were excluded (GitHub matched
"screen" and "reader" separately); why the index helps (the range on `created_at` becomes
part of the index seek instead of a scan of the repository's rows; 3207.8 ms to 61.3 ms);
what nearest-rank percentile means (`rn = (n + 1) / 2` and `(n * 9 + 9) / 10` in integer arithmetic).

## One small change to make yourself

Add a 20th check: "an open issue must not have a `state_reason` of `completed` or
`not_planned`".

1. Add a `-- check: open_issue_has_no_closing_reason` block with one SELECT to `warehouse/checks.sql`.
2. Add a breaking UPDATE for it to the `BREAK` dictionary in `tests/test_checks.py`
   (`test_at_least_twelve_checks_and_each_has_a_breaking_case` fails until you do).
3. Run `make test`, then `make load check` and see whether the real data passes.
   If it does not, look at the rows before deciding what the result means.

This touches the check format, the runner, the test pattern and the real data in about ten lines.

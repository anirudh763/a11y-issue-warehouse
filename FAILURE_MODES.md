# Failure modes and evidence

The cases below map to the local `data-provenance-qa` acceptance set. Current evidence is finite and device-specific; it is not a universal assurance.

| Case | Expected behavior | Current check |
| --- | --- | --- |
| Seeded train/validation/test split | Stable identity order and content hash; disjoint assignments; full coverage | Browser workbench test repeats JSONL and Parquet, compares hashes, checks all 2,643 IDs and all three splits. |
| Upstream schema drift | Preserve input; quarantine rows with reasons; do not coerce malformed records | Model test changes an integer field to text and checks the original record plus quarantine reason. |
| Read-only SQL | Parse a real single SELECT AST; reject mutations, extra statements, file/network/extension access and abusive grammar | Browser test exercises DuckDB query success and representative rejected statements. Bounds are documented in `docs/SQL_WORKBENCH.md`. |
| Empty results | Preserve output columns and clear stale rows | Browser test runs a nonempty query followed by a zero-row query. |
| Snapshot manifest mismatch | Verify actual snapshot bytes; fail closed and allow re-verification | Browser test corrupts the manifest digest, checks SQL/split are disabled, then retries successfully. |
| Deterministic exports | Real CSV, JSONL and Parquet; formula protection; schema and content checks; reread before download | Browser test verifies CSV/JSONL and native Parquet readback, framing, repeated hashes and leading-whitespace formula neutralization. |

## Data limits

The accessibility sample is selected by labels and keywords. It is weakly labeled, not manually adjudicated and not human ground truth. The comparison sample is not a checked-negative set. Keyword matches can capture unrelated issues; the excluded keyword sample records a known class of these hits. Splitting rows does not deduplicate related issues across repositories or provide held-out-project evaluation. No current workflow supplies human-verified benchmark labels.

A manifest hash establishes that the browser received bytes matching the adjacent manifest. It does not authenticate the upstream source, the authorship of issue text, or a license to reuse that text. The repository's MIT code license does not grant rights in third-party issue text; there is no CC-BY claim.

The current release checks do not claim manual screen-reader testing, exhaustive SQL AST fuzzing, universal browser coverage, cloud deployment or a recovery guarantee for every browser/worker failure. Cancellation and deadline behavior of the nested DuckDB worker have not been independently verified for every browser.

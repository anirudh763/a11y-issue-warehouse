# Decisions

- **Keep the data pipeline intact.** Python and SQLite remain the source of the normalized warehouse and analysis. The browser is an optional view over a compact public JSON projection.
- **Keep the interface native.** The explorer uses existing hash routes, native dialogs, semantic HTML and local CSS. It adds no UI framework, account system or analytics.
- **Fail closed on snapshot drift.** The browser verifies downloaded bytes against the sidecar manifest and checks declared fields and row constraints before trusted queries or exports are enabled. A hash is byte-integrity evidence relative to that manifest, not source authenticity.
- **Limit SQL to a public read-only contract.** The supported table is `issues`, not every normalized SQLite table. DuckDB parses SQL into an AST; the worker validates allowed nodes, columns and functions before running the canonicalized statement.
- **Keep export SQL separate.** User SQL runs in a database with external access disabled. The export-only database receives internally generated rows and uses an internal virtual path for Parquet.
- **Version split behavior.** The SHA-256 seed and stable-identity ordering, tie-break, ratios and snapshot/engine provenance travel with exports. Row splits of weak labels are exploratory, not held-out-project evaluation.
- **Separate code and content rights.** MIT applies to this repository's code. It does not license third-party GitHub issue text, and the project does not claim CC-BY rights in that text.
- **Keep proposed services non-transactional.** The $99–$299 range is an unvalidated planning hypothesis. Curation and benchmark packs are unavailable; the static site has no checkout, payment processing or email capture.
- **Do not imply cloud services exist.** S3, Glue, Lake Formation and Athena are documented only as a possible future mapping, not a deployed architecture.

# Browser SQL workbench

The SQL route is an optional browser view over `data/issues.json`; it does not query or replace
the Python/SQLite warehouse. The adjacent `data/manifest.json` declares schema version 1 and
the exact SHA-256 of the downloaded snapshot. SQL and exports stay disabled unless the byte
hash, row count, required projection fields, types, ranges and references match. Invalid rows
are listed by ordinal and reason in the validation result, then the entire trusted route fails
closed. The original input bytes and repository issue pages are not rewritten.

The only SQL relation is `issues`, with the public columns and types in that manifest. It
contains no issue body, username, email or avatar. DuckDB-Wasm 1.32.0 is loaded lazily from
the same origin in a dedicated worker. It uses DuckDB's EH bundle and therefore requires a
browser with WebAssembly exception handling. The signed JSON and Parquet extensions are also
vendored from DuckDB's official extension distribution. Autoload/autoinstall and external
access are disabled for user queries. The DuckDB SQL serializer parses input into one AST; the workbench validates
one `SELECT_NODE`, the `issues` base table, named projected columns, bounded AST size, and an
allowlist of scalar and aggregate functions before executing the canonical SQL regenerated
from that same AST. CTEs, joins, nested queries, table functions, extensions and file/network
functions are outside this grammar. An unqualified column reference may name an alias declared
in the SELECT list (for example in ORDER BY); undeclared aliases and qualified alias references
remain rejected. Limits: 4,096 UTF-8 query bytes, 256 AST nodes, depth 20,
500 result rows, 1 MB result JSON, and a 12-second query/split deadline after initialization.
Exports have a 60-second deadline. A deadline or cancellation terminates the worker; the next
operation starts a fresh engine.

Seeded splits use `SHA-256(seed UTF-8 || 0x00 || stable issue ID)`, then sort by digest and ID;
the first 80% are training rows, the next 10% validation, and the remainder test. This v1
algorithm is deterministic for the same snapshot and engine version. It splits rows with weak
labels; it is not held-out-project evaluation and does not deduplicate issues across projects.

CSV and JSONL are built from actual engine rows and parsed back before download. CSV prefixes
formula-like cell text with an apostrophe and encodes array/object cells as JSON so values such
as label arrays keep their boundaries. Query results containing NaN or Infinity fail with an
actionable error rather than being coerced to JSON null. Query exports contain at most 500 rows; seeded split
exports contain at most 10,000 rows. All exports are limited to 8 MB and display a SHA-256
digest. Parquet is written by a trusted internal DuckDB `COPY` in a separate export-only
database to a fixed in-memory virtual path, read back, and compared with the exported rows. That
database receives only generated row values, never user SQL. User SQL can never supply a COPY
statement or a destination. Split exports include the seed, ratios, algorithm, snapshot
hash/date and DuckDB version on each row. Byte-for-byte Parquet reproducibility is scoped to
the vendored DuckDB version and this single-threaded deterministic query path.

DuckDB-Wasm and Apache Arrow JS versions, source links, licenses and file digests are recorded
in [`vendor/NOTICE.md`](vendor/NOTICE.md) and [`vendor/SHA256SUMS`](vendor/SHA256SUMS). Run
`scripts/vendor_duckdb_wasm.sh` to rebuild the local assets. The script downloads pinned
packages from npm and official license texts; runtime pages require no CDN or third-party
network access.

## Query recovery

The exact editor text (up to 4,096 UTF-8 bytes) is kept in sessionStorage for this tab. Reload restores text only, never executes it, and starts without result/export state. Closing the tab removes normal session recovery; browser session restoration may retain tab storage. Storage errors are visible and copying the query remains available through the native editor. Editing invalidates displayed result/export state; in-flight results for an older query are discarded. Query contents are not sent to analytics or URLs.

## Server workspaces and recovery

The canonical pages are `/overview`, `/workbench`, `/reports`, and `/settings`; `/` opens Overview. Existing SQL, manifest, methods, taxonomy, and diagnostics links remain available. Workbench keeps the public cohort, read-only SQL, and private imports separate. Reports uses the same query result and split export controls; navigation does not rerun SQL.

On a server host, **Save current run** explicitly uploads the current query, validated filters, seed, public snapshot SHA-256, real engine result/split summary, and any selected original private backlog file. JSON and CSV imports remain limited to 2 MiB and 2,000 rows. Original bytes, format, mapping, scope, and SHA-256 are retained; CSV is not silently converted to a larger JSON artifact. The backend also validates JSON source artifacts with a Warehouse-only 2 MiB/220,000-node limit, depth and credential checks. Metadata stays limited to 64 KiB. Rejected saves leave current input available for local export. Reconnection never uploads it automatically.

Opening saved input validates the public source version and original private source SHA-256. It restores the query and seed without executing SQL; private backlog analysis uses the existing parser and keyword classifier. Changed public snapshots require explicit query import for the new source. Weak labels and keyword candidates remain exploratory, not verified defects.

New SQL tab recovery is scoped to the server principal. An authorized guest-to-account migration copies pending recovery into the new principal namespace and retains the old copy. Logout and unrelated account changes clear the current editor, results, imports, dialogs, and pending operations while retaining stored browser copies. Retained unscoped guest drafts require **Settings → Browser profiles and encrypted backup → Retained tab query → Import retained query**. Import does not delete the original and never runs SQL.

Server snapshots and saved source files belong to the authenticated owner on the private persistent volume. Snapshots on that volume are not a separate-device backup. Existing browser profiles, portable encrypted backups, and configured optional cloud sync remain separate, explicit workflows in Settings.

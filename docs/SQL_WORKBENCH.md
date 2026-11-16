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

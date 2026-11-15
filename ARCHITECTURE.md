# Architecture

## Current system

The production data path remains the repository's Python and SQLite warehouse:

1. Committed GitHub search responses under `data/raw/` are the reproducible source inputs. Refreshing them is an explicit network operation; loading the saved set is offline.
2. `warehouse/load.py` normalizes those records into `data/warehouse.db`. `warehouse/checks.sql` validates schema, references, identities and known data-quality conditions.
3. `warehouse/export_site.py` writes the compact public `docs/data/issues.json` projection and an adjacent `manifest.json` with the snapshot SHA-256, row count, collection date and schema contract.
4. The vanilla JavaScript explorer fetches the public snapshot. Its views do not replace the normalized SQLite database.

The public projection includes issue title, repo, number, state, dates, comment count, sample, search-source flags, word flags and labels. It excludes issue bodies, usernames, email addresses and avatars. Hash verification confirms that downloaded bytes match the published manifest; it does not prove the authenticity of GitHub's source records or grant rights in their text.

## Browser workbench

The optional SQL route loads pinned DuckDB-Wasm assets from the same origin when the visitor runs SQL. A dedicated worker parses the request with DuckDB's SQL serializer, validates a single SELECT AST against the public `issues` projection and its function allowlist, and runs it with external access disabled. Query limits, AST bounds, result limits and worker deadlines bound this browser work.

Seeded splits order stable issue IDs using a versioned SHA-256 procedure. CSV and JSONL exports are built from real rows and reread before download. Parquet is written and reread in a separate export-only DuckDB database; that database receives generated values, never user SQL or a user-supplied path. Export rows and bytes are bounded. The first optional SQL use downloads the engine assets; the explorer's normal public snapshot view does not require DuckDB.

## Not deployed: possible AWS mapping

A future hosted research deployment could map a curated immutable snapshot to S3, describe its schema in Glue, restrict access with Lake Formation and run ad hoc scans through Athena. That is a proposed architecture only. This repository has no AWS account resources, buckets, Glue catalog, Lake Formation policy, Athena workgroup, hosted API or enterprise data pipeline.

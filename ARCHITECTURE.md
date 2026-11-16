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

## Product entry and local saved work

The new root route is an editorial landing. `#/signup` and `#/login` unlock optional browser-local profiles; `#/saved` and `#/profile` manage saved work. `#/app` opens the catalogue; `#/app/explore`, `#/app/sql`, `#/app/manifest` and `#/app/methods` alias existing tool routes. Legacy explicit tool and scoped-filter URLs remain supported. All tools are free and guest accessible.

`local-profile.js` owns bounded profile and saved-work records. `product.js` owns product entry, native navigation disclosures, reduced-motion-aware previews and forms. The explorer adapter captures validated SQL/filter/snapshot context and clears pending search/SQL worker state on identity changes. SQL restoration never executes automatically, and previously shown results are invalidated. No new server, cloud resource or analytics is used.

## Private imports and portable work

`docs/backlog.js` handles explicit CSV/JSON imports (2 MiB, 2,000 flat scalar rows) and bounded public GitHub imports (up to three 50-response pages). Mapping/preview precedes analysis. Original fields remain in memory; stable IDs combine source SHA-256 and row position, or a canonical public issue URL. Imported collections never join the published SQL projection. Category keywords are inferred candidates; severity/state remain supplied or Unknown. Markdown/CSV/print findings identify dataset, scope and denominators; CSV neutralizes formula prefixes while canonical input is retained.

Encrypted backup includes saved queries and only an explicitly selected private dataset. Restore validates/stages before an atomic local-profile commit; restored datasets stay in memory and SQL never executes automatically. The optional Supabase reference connector uses independent cloud auth, owner RLS, conditional revisions, conflict review and deletion tombstones. It ships unconfigured, with no hosted project or live cross-device proof. See ENCRYPTED_BACKUP.md and CLOUD_SYNC.md.

Browser-local profile namespaces are not same-origin security isolation. Existing saved records are not encrypted at rest; encryption protects exported backup files only.

## Direct local routes and trust boundary

```mermaid
flowchart LR
  Tab[Independent browser tab] -->|exact path / query| Server[Local static serving process]
  Server --> UI[docs vanilla application]
  UI --> Snapshot[Public issues snapshot and SHA-256 manifest]
  Snapshot --> Validator[Existing WarehouseModel validator]
  Validator --> Catalogue[Search / weak taxonomy / filtered exports]
  Validator --> SQL[Existing bounded DuckDB worker]
  Tab -->|read only| Health[healthz / readyz / api/system / metrics]
```

The HTTP route allowlist serves the same application for `/`, `/taxonomy`, `/export` and `/system`. Unknown API/asset paths must stay 404. Pages retains legacy hash routing; only the local serving process has health endpoints. Filters remain in each tab's URL; no mutable server-side filter state exists.

The catalogue exporter now uses the same snapshot trust decision as the SQL adapter. Data and manifest fetches have ten-second deadlines; the existing byte limits and schema/hash validator remain in place. Taxonomy counts actual inclusion bases and original GitHub labels within the current selected rows, with overlapping counts and no inferred severity. Filtered CSV retains its formula-injection protection, while JSON retains source URLs, filters, the data hash and weak-label caveat.

System requests have five-second deadlines and show endpoint failure/retry states. Prometheus counters describe the HTTP serving process only; browser SQL/checker operations, data validity and historic throughput are not inferred from them. No AWS component was added for the direct routes.

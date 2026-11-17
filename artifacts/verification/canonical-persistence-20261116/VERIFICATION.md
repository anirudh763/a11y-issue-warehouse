# Warehouse canonical workspace verification

Final source is frozen and the Warehouse-only image is healthy at `http://127.0.0.1:3005`.

- Source service-worker build: `8a7936ad53ea33df`.
- Prepared/served build: `e056803885cad65f`. The build helper adds the server capability marker and recomputes public integrity hashes.
- Root SDK/CSS, persistence module, HTTP server, preparation helper and migration remain exact copies of the shared runtime.
- All 525 protected data/research files and six separately compared model/SQL-worker/Wasm/vendor files remain byte-identical. No datasets or research outputs were regenerated in the source checkout.

## Resulting behavior

The four canonical destinations and persistent desktop/mobile navigation reuse the real catalogue, read-only SQL, query/split exports, private issue parser/classifier and diagnostics. Existing research routes and mounted Pages hash aliases remain usable. Reports retains actual output/export controls; Settings separates private-server accounts/snapshots from retained browser profiles, encrypted files and optional configured cloud sync.

Explicit Save persists real query/filter/seed/source-hash and engine/category summaries plus the original selected backlog bytes. JSON/CSV stays bounded to 2 MiB and 2,000 flat rows. Original CSV is retained even when its JSON representation would exceed 2 MiB. Server artifact names use safe fixed basenames; original source identity/hash is in the owned metadata. Reconnection does not upload. Saved input is hashed and validated before restore; SQL never executes automatically.

New tab recovery is principal-scoped. Authorized guest migration retains the former copy and carries the pending query into the new account namespace. Logout/unrelated owners clear current state and all derived private cohort/import/query/dialog/report data while retaining stored browser copies. Older unscoped queries require explicit import.

Snapshot failure and manifest verification failure expose a named alert and keyboard Retry. The bounded retry reuses the existing loader/validators in place, keeps one active load and one set of event handlers, preserves current SQL/filter/original backlog, and makes no input uploads or automatic SQL calls. Error-state logout resets in-memory criteria before rendering guards, preventing a later retry from resurrecting a previous owner's query or filters.

## Executed checks

| Check | Evidence/result |
|---|---|
| Isolated full Python suite with real disposable PostgreSQL policy fixture | `python-current.log`: **105 passed, no skips**. The fixture was returned to its original stopped state. |
| Research tests | `research-current.log`: **39 passed**. |
| Temporary SQLite load/check/site-check | all exit0; 19 checks,18 pass and the unchanged documented180 keyword-hit finding. |
| Generic HTTP runtime regression | `http-server.log`: **25 passed**. |
| Latest source/HTML contracts | `html-contract-final.log`: **17 passed**. |
| Focused/profile/backup/migration/backlog Node suite | `unit-final.log`: **25 passed**; provider-owned HTTP suite **38 checks**. |
| Existing complete browser domain suite | `browser-domain-green.log`: **99 passed**, then17 existing launch-unit tests and38 provider checks. Real DuckDB/AST controls, worker recovery, schema/hash quarantine, deterministic disjoint splits, CSV/JSONL/Parquet readback and both-theme axe were exercised. |
| Canonical route matrix | `direct-canonical.log`: **20 route/width axe states**,320/375/768/1024/1440, actual offline routes, keyboard/history, tabs, source distrust and export readback. Post-density Workbench5-width axe/viewport checks are in `workbench-layout-final.log`. |
| Persistence acceptance | `persistence-live-final.log`: **17 groups +12 axe states**: real save, controlled outage/retry, actual source reopen/hash, parsed export, snapshot, browser close/reopen, restart/recreation, cross-owner denial, real optional account migration, nondestructive restore, revoked logout. This ran on the same frozen backend/final deadline SDK before the final public-retry/reset-only patch; root's final fleet gates cover the final image. |
| Owned workspace/private flows | `canonical-private-final.log`: **13 groups** including actual SQL/split, navigation/history, original JSON SHA, scope dirty state, cancelled replacement with0reads, held read/reset, held scenario/reset, explicit legacy import, >64KiB original JSON save/readback, lossless2MiB CSV restore, safe filter normalization and signup/reload/unrelated-owner recovery. |
| Legacy browser profiles/backup/cloud | `product-flow.log`:12 groups; `backup-happy.log`: real Unicode encrypted download/wrong-pass rollback/fresh-profile restore; `cloud-ui.log`: actual owned HTTP auth/consent/insert/conflict/CAS/tombstone/disconnect/stale logout. No hosted cloud deployment is claimed. |
| Mounted Pages prefix | `pages-prefix-final.log`: canonical navigation/search/reports/settings/history/reload and retained research aliases remain beneath the mounted prefix; SQL stays out of URLs and never executes on restore. |
| Real offline/update behavior | `pwa-launch-final.log`: actual service-worker offline SQL/export, public-only cache, update/defer/retained profiles, failed install/quota/eviction recovery. Install/share event mocks are explicitly component tests; native device installation is unverified. |
| Exact final retry cases | `snapshot-recovery-final.log`: **2 actual held-fetch cases +2 error-state axe states**, keyboard retry retains the same live page/blob/hash/SQL/search/sort/filter with **0 uploads and0 automatic SQL**. |
| Exact final owner-reset case | `retry-owner-reset-final.log`: manifest failure→private criterion/filter→retry fetch failure→real server logout/new guest→successful retry cannot resurrect prior state, DOM or links. |
| Saved-filter privacy | `saved-filters-final.log`: unsupported SQL/token fields are removed before history; oversized saved search rejects without mutation. |

The extended research browser runner completed scenario/export/pagination/tab/taxonomy/history work and40 light/dark route scans, then exposed the hidden retry failure. Its final error/provenance portion was verified by the targeted final retry/filter regressions rather than repeating the40-scan matrix. The original failing log is retained; it is not labeled a full successful runner.

## Reproduced failures

`scenario-red.log`, `scope-red.log`, `private-worker-red.log`, `backlog-canonical-red.log`, `print-reset-red.log`, `saved-filters-red.log`, `snapshot-recovery-red.log`, `retry-wiring-red.log`, and `retry-owner-reset-red.log` retain observed failing regressions. Current counterparts pass. Scope's prior-script transport basename is normalized solely to isolate its dirty-state bug from the independently fixed unsafe basename. The two real generated print windows close and clear on reset; no native printer/PDF certification is claimed.

`served-final.json` contains final live hashes and capability-adjusted version; `protected-final.json` records protected/core identity. Tests use the existing Python3.11 test environment and Docker Python3.13 runtime. No commits, pushes, public publishing, external paid provisioning or other-app source changes were made. Automated axe and headless checks are finite local evidence, not a human screen-reader or native-device certification.

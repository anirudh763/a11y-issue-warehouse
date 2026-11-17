# Issue Warehouse server workspaces

The static Pages build still runs without a backend. The optional Python HTTP image adds private saved work and accounts; it does not move domain computation to the server.

## Standalone local launch

Keep the five-app Compose deployment if it is already running. For a standalone checkout, first copy `.env.example` to an ignored `.env` **only if that file does not exist**. Set a stable random `APP_SESSION_SECRET` (at least32bytes), preserve it across restarts, and retain the documented loopback origin on port3005. Never put the secret in a frontend variable or commit it.

```sh
docker build -f Dockerfile.web -t warehouse-local .
docker run -d --name warehouse-local --read-only --user 10001:10001 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --env-file .env \
  --mount type=volume,source=warehouse-workspaces,target=/var/lib/product \
  -p 127.0.0.1:3005:8080 warehouse-local
# Stop or restart just this standalone instance, retaining its volume:
docker stop warehouse-local
docker start warehouse-local
```

The selected port must be free; do not stop another application to claim it. For HTTPS, set the exact HTTPS origin and `APP_LOCAL_HTTP=0`; use a separate hostname for each app. `/healthz` checks process liveness, `/readyz` checks required storage/session readiness, and `/metrics` reports HTTP activity, not domain accuracy.


The same bounded persistence protocol is used by the four browser products. This repository’s checks are recorded under artifacts/verification/canonical-persistence-20261116. The separate LeaseQ engine is unchanged.

Each app runs its existing static HTTP runtime plus SQLite WAL, Beaker server-side sessions and Argon2id optional accounts. It has a separate named volume, cookie name, session signing secret, SQLite database and artifact/snapshot tree. A single process serializes mutations with a lock and BEGIN IMMEDIATE; no multi-host or unlimited-concurrency guarantee is made. Existing browser domain engines compute the results, explicitly saved as `browser-computed`. The server validates and authorizes persistence; it does not certify that a submitted result ran an engine.

## Configuration and deployment

APP_DATA_DIR points outside public assets; local Compose uses /var/lib/product owned UID/GID10001, mode0700, with a read-only container root. APP_SESSION_SECRET is stable, random, at least32bytes; create_launch_env.py creates four separate0600 files without overwriting existing files. APP_PUBLIC_ORIGIN is an exact origin. APP_LOCAL_HTTP=1 accepts only explicit loopback HTTP for development; HTTPS produces Secure cookies. APP_SESSION_TTL_SECONDS defaults30days. APP_PASSWORD_AUTH=1 enables local server accounts with no external identity verification or email recovery.

Cookie identifiers are opaque, HttpOnly, SameSite=Lax, explicitly expiring and durable. Registry expiry/revocation is checked on every request, and authentication rotates the session. POST/PUT/PATCH/DELETE require exact Origin and CSRF, except the narrowly scoped initial guest bootstrap. No credentialed wildcard CORS or forwarded-header trust. Apps on the same loopback host use different cookie names; production should use separate HTTPS hostnames because browser cookies are not scoped by port.

Build-time prepare_persistence_assets.py marks public HTML and updates its exact offline integrity digest. Browser-only repository assets remain unmarked. Uploads require explicit Save current run; reconnect only announces pending changes and never starts an upload. API and saved-source reads have a native 30-second network deadline with actual abort and no automatic retries. A timeout retains current input and dirty state for explicit retry. Private API routes are network-only and no-store; offline domain editing continues with unsynced work retained, rather than pretending server storage is available.

## Contracts and bounds

POST /api/session/guest automatically creates or resumes an owned guest workspace. GET /api/session returns current session and CSRF; signup/login rotate and safely transfer authorized guest work; logout revokes. No user-supplied workspace ID alone grants access.

/api/workspaces stores versioned metadata; /api/runs stores domain payloads and artifact references; /api/exports stores actual persisted-run JSON/Markdown/CSV; /api/sync stores completed or failed owned logical snapshots and restores into a new workspace. Lists use limit/offset (at most50 records). Existing browser-specific PDF, JSONL and Parquet exports remain supported by their real implementations. Public /api/samples contains current verified source hashes; existing workspace provenance is not rewritten when a source changes.

Metadata requests64KiB, depth16,10000nodes; Warehouse JSON source artifacts retain the existing2MiB import limit with220000 bounded nodes (2000 × 100 scalar fields plus containers), with the same nested credential/private-JWK/PEM checks; other JSON artifacts remain64KiB; artifacts32MiB each; one large in-flight upload; artifact and snapshot budgets256MiB each; persisted metadata64MiB; at most1000 active guest sessions. Rates are bounded by the implementation (30 guest bootstraps/minute/IP,10 auth attempts/minute/IP,120 mutations and600 reads per minute). Over-limit responses are explicit; no automatic deletion of user records is performed. Private-key PEM/JWK and credential fields are rejected, including encoded JSON artifacts.

Snapshots are consistent workspace-owned logical copies, including actual artifact bytes, placed in SQLite staging and written using sqlite3.backup and atomic files. They exclude auth/session databases and private signing keys. SHA-256 and schema/reference checks precede restore; restore remaps identifiers into a new workspace and leaves the original intact. Snapshots share the local volume and are not a separate device backup. The32MiB serialized logical snapshot limit includes base64 expansion; a large source may save successfully but exceed snapshot capacity. Export source files separately before relying on this bounded local backup. Failed snapshots remain visibly failed, with originals unchanged.

Versioned SQL migrations apply transactionally; source seeding is idempotent. Current database, sessions and source files survive restart and recreation through the named volume. Retain the volume and stable secret together. Back up the volume while the service is stopped or use SQLite's supported backup mechanism; do not copy an actively changing SQLite file alone. Never publish private launch env files or volume contents.

## Acceptance scope

Local target:20 concurrent metadata readers, bounded50-row lists, and one large upload. Record measured p95 separately; passing finite tests is not production capacity certification. The live browser acceptance creates an actual engine-backed run, verifies downloaded artifacts/export contents, creates/restores a real snapshot, closes/reopens its browser profile, restarts/recreates only that app, denies cross-owner access, and verifies account rotation and logout revocation. Full HTTP, session/security, migration, quota, schema and snapshot corruption tests are under runtime/tests.

## Warehouse input and restore

Workbench runs the existing public snapshot filters, bounded read-only DuckDB queries, deterministic splits, and private backlog classifier locally. Save current run uploads validated query/filter/seed settings, actual engine summary, versioned public source hash, and any selected original CSV/JSON backlog bytes. Private imports never join the published research corpus. JSON and CSV remain bounded to 2 MiB, 2,000 rows and 100 scalar fields, with safe keys up to 100 characters. The original file, SHA-256, mapping, scope, supplied labels and actual category counts are retained without normalization or truncation of accepted source bytes. Credential validation may reject a server save while leaving local work intact.

Opening a saved run verifies the public snapshot version and private source hash, restores filters/query/seed without executing SQL, and reanalyzes a saved private backlog through the same classifier when analysis was requested. Weak labels and keyword candidates are not human-verified defects. CSV/JSONL/Parquet exports still use the existing readback-verified browser engine.

Server SQL recovery is scoped to the current principal. A server-confirmed guest-to-account migration copies pending recovery into the account namespace while preserving the guest copy; unrelated accounts receive no import. Logout/account reset and oversized/unavailable storage clear current UI or warn without deleting retained browser copies. Settings exposes explicit import of the older unscoped tab draft; import retains the original and never runs SQL. Local profiles, encrypted portable files, optional configured Supabase sync and server sessions are distinct workflows. The static Pages build sends no private input to this Python backend, and mounted Pages links retain their prefix and hash semantics.

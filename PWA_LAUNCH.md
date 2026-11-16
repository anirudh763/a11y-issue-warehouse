# Issue Warehouse: mobile and offline launch

## Capability boundary

| Capability | Availability |
|---|---|
| Catalogue, bounded SQL, schema/provenance, deterministic splits and CSV/JSONL/Parquet exports | Offline after this build has prepared successfully; exports still require browser storage/memory |
| Local profile signup/unlock/saved work | Offline with prepared assets, Web Crypto, Web Locks and writable browser storage; reload starts locked in this app |
| External imports, original GitHub discussions, feedback submission | Network required; feedback opens a reviewable draft, never submits it |
| First-ever offline visit | Unsupported: the browser cannot load a site it has never fetched. A controlled app with an evicted shell displays reconnect guidance |
| Home-screen install | Browser/platform dependent; Safari has a manual Share → Add to Home Screen guide |
| Apple/Google stores, native hardware testing | Not implemented or submitted; no developer account or fee |

## Public cache and updates

`docs/offline-manifest.json` enumerates actual public assets, sizes and SHA-256. Each required response must have the expected MIME, successful status and digest before the worker installs. No HTML fallback is returned for code, Wasm, worker or API requests. Cache-first reads stay on the installed build; cache misses fetch only matching bytes. No arbitrary URL, authenticated response, private capture/report, bearer token or generated export is cached.

Scope is relative to `/a11y-issue-warehouse/` on Pages, and remains relative on a local server. Four Pages apps share an origin: prefixes avoid accidental collisions, not malicious same-origin access.

An update waits. Review update requires explicit saved/exported-work confirmation. Other open app tabs block acceptance. Controller change reloads only after that action. Failed installation deletes only its incomplete candidate cache; existing releases, saved work and other apps are preserved. Old version caches are retained until explicit Clear this app’s offline copy; storage therefore grows by a build’s public-asset size per successful release. Use the scoped clear action to reclaim storage after exporting work. Browser eviction can remove cached assets regardless of readiness previously shown.

No installation, share-sheet opening, download request or GitHub draft opening is presented as proof of completed external delivery. Install/share mocks are component tests only.

## Data and feedback

Existing local profile passwords use salted PBKDF2; hashes do not encrypt saved work. Guest/profile namespaces remain separate. Feedback includes only app, worker build, viewport and allowlisted route pattern, never URL query/fragment contents, filenames, input text or credentials automatically. Description and steps are deliberately entered and reviewed before GitHub receives a draft URL. External destination is the existing `anirudh763/a11y-issue-warehouse` repository.

Optional checklist state uses app/schema/profile IDs; guest progress is separate. It changes after actual local actions/results. Sharing shows selected text for review, then attempts native file/text sharing with explicit Copy and Download fallbacks. Nothing is uploaded in the background.

## Build and verification

Rebuild after every public asset change: `node scripts/build-pwa.cjs`. The offline version includes file digests and worker template. Run `node tests/web/pwa-launch.cjs` with system Chrome (`CHROME_PATH` may override). Tests use real service workers under the actual project subdirectory and real local engines. Results are reported separately; a test definition is not a pass.

No native SDK, Capacitor scaffold, cloud resource, analytics, subscription or deployment is introduced. Physical-device installation, on-screen keyboard behavior and store eligibility require separate device verification.

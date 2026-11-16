# Optional Supabase reference connector

The shipped app is unconfigured. No cloud account/project was provisioned, and no live cross-device synchronization is claimed. Local tools and encrypted backups remain free and independent.

## Configure an owned project
Apply `docs/supabase-workspaces.sql` in your own Supabase project, enable your chosen Auth sign-in policy and create/manage cloud users separately from local profiles. This reference uses password sign-in for existing cloud accounts. Add `workspace-sync-origin` and `workspace-sync-public-key` meta tags before app scripts in canonical HTML. Use only the HTTPS project origin and its publishable key (legacy anon compatibility exists). Allow that exact origin in CSP connect-src and rebuild. Never put service_role or sb_secret_ credentials in browser assets. Runtime validation rejects those keys. Project setup/deployment is an explicit owner operation.

Public-key guidance: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys). API keys identify the app; Supabase Auth and RLS authorize users.

## Data and conflicts
Cloud sign-in credentials/tokens remain in memory. Nothing auto-syncs. Read, push, conflict resolution and deletion require explicit user action and consent. The provider can read uploaded data: this connector does not claim end-to-end encryption. Only saved work is sent, plus an explicitly selected private dataset where supported. Current unsaved editor text is excluded. Responses are streamed with a 4 MiB cap; uploads are capped at 3 MiB; requests time out and GET retries are bounded. Local logout invalidates stale requests.

There is one workspace row per authenticated user per app-specific table. RLS derives ownership from auth.uid(); local profile IDs never authorize a cloud request. Compare-and-swap revisions preserve conflicting local/remote copies. Remote restoration uses the same staged validation/explicit local import as backup. Deletion creates a revisioned tombstone and leaves local work intact; provider backups may retain older data. No direct hard DELETE permission is granted.

## Verification
Both root app schemas were executed against unique disposable local PostgreSQL databases with ordinary roles and two identity claims. Tests check owner isolation, mutation grants, revision guards, conditional updates and tombstones. Client transport tests use an owned HTTP receiver; they are not evidence of live Supabase deployment or gateway authentication. Actual hosted Auth/RLS configuration and cross-device use remain unverified until the owner configures a project.

Run `node test/sync-provider.test.cjs` for CueReport, or `node tests/web/sync-provider.test.cjs` for Warehouse. Optional SQL tests require psycopg/pytest and the designated disposable test environment; they refuse other database coordinates. Never publish the private test environment file.

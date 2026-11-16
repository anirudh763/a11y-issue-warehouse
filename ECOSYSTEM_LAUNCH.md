# Ecosystem and product hardening

All implemented tools are free. Team/cloud is prospective interest only. No deployment or paid provisioning is performed.

## Configuration
The optional early-access endpoint is absent by default. Configure a public, owned HTTPS endpoint in `meta[name="early-access-endpoint"]` before the ecosystem module runs, and allow exactly its origin in CSP `connect-src`. Never bundle credentials. The endpoint accepts JSON email/team/usecase; a successful HTTP acknowledgement confirms receiver acceptance only. No endpoint means local draft only. Nothing is automatically sent later. Tests must use an owned receiver. Analytics remain absent/disabled.

## Navigation and privacy
More Tools contains explicit public links. LeaseQ was rechecked as HTTP 404 on 2026-11-15; its deployment is labelled unavailable. Link presence is not a remote uptime guarantee. No cross-app profiles or private work transfer.

Warehouse → CueReport passes only a public GitHub issue URL through `#/check?source=...`; CueReport validates the URL, pre-fills import and requires the user to fetch explicitly. Public projection contains no issue bodies. CueReport → Warehouse is an explicit public TalkBack search. Private backlog report transfer uses explicit reviewed Markdown download, followed by manual paste into CueReport. No file-import integration is implied.

## Social assets
Editable `og-card.svg` and `scripts/ecosystem-metadata.html` are retained. Run `CHROME_PATH=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome node scripts/render-og.cjs`, then the normal app build. Cards are illustrative product previews, not live verification results. Only the base page has static social metadata; hash states do not provide independent pages.

## Evidence boundaries
Local browser timings are lab observations, not CrUX field data. Field performance and real customer demand are unavailable. Automated axe checks are not WCAG certification. Native mobile installation, hardware and human usability follow-up remain separate gates.

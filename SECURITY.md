# Security policy

## Status

Public beta (0.1.0), maintained by one student on a best-effort basis. The data is a
fixed snapshot (collected 2026-11-11) and is not refreshed automatically.

## Reporting a problem (security contact)

Use GitHub's private vulnerability reporting for this repository (**Security** tab,
**Report a vulnerability**) when it is switched on. If the button is not there, open a
public issue titled "Security report" that says only that you have a report and asks for a
private channel; do not put the details in the public issue. There is no security email
address.

This is a one-person student project, so there is no response-time guarantee. Reports are
read and answered as soon as possible, and fixes are listed in `CHANGELOG.md`.

## Supported scope

Only the latest commit on `main` and the most recent tagged release are supported.

### In scope

- The explorer in `docs/` (served by GitHub Pages): script injection through issue titles,
  labels or the address, the Content-Security-Policy, anything that sends data off the page.
- The export in `warehouse/export_site.py`: personal data (author names, avatars, issue
  bodies, email addresses) reaching `docs/data/issues.json`.
- The pipeline in `warehouse/`: SQL built from untrusted text, unsafe handling of the saved
  pages in `data/raw/` or of the GitHub token used by `make data`.
- The CI workflow in `.github/workflows/`: token permissions, unpinned actions, script
  injection.

### Out of scope

- The content of the GitHub issues themselves. They belong to their authors and projects;
  report problems there.
- The weak labels (an issue in the wrong sample). That is known label noise; use the
  "Wrong label or removal request" issue template.
- `reproduction/`, which is research code run by hand on a local copy of the data.

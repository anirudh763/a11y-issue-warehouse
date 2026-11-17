---
version: 3
name: Warehouse research index
extends: docs/ui.css
dial: ENERGY 1 / RHYTHM 2 / MOTION 1
theme: light default; dark only by explicit remembered choice
typography:
  ui: system-ui, -apple-system, Segoe UI, Roboto, sans-serif
  body: 16px / 1.5
  heading: responsive 28–32px, system sans
  mono: issue IDs and data hashes
colors:
  canvas: { light: "#ffffff", dark: "#191820" }
  surface: { light: "#ffffff", dark: "#191820" }
  inset: { light: "#f4f3ef", dark: "#24232c" }
  ink: { light: "#25243a", dark: "#f1eff4" }
  secondary: { light: "#5e5b67", dark: "#bbb6c5" }
  boundary: { light: "#817b70", dark: "#99919e" }
  divider: { light: "#d9d6ce", dark: "#494551" }
  accent: { light: "#8a5700", dark: "#e9bb69" }
  selected: { light: "#f6eddb", dark: "#382e20" }
  positive: { light: "#12633c", dark: "#6fd39b" }
  danger: { light: "#b42318", dark: "#ff9b8f" }
radius: 3px controls; square catalogue bands and tables
targets: 44px actionable targets; 24px filter inputs within 44px label rows
motion: state feedback only; reduced motion respected
---

# Warehouse research index

Reading this as: a research catalogue for people inspecting weakly selected GitHub issue
records, in a white, ink and ochre library-index language; ENERGY 1 / RHYTHM 2 / MOTION 1.
This v3 identity implements the owner's November 13 distinct-app instruction and replaces
the earlier shared 216px rail. WCAG 2.2 AA takes priority.

## Composition and purpose

- A compact horizontal catalogue header presents the wordmark, three routes and theme
  control. There is no permanent sidebar. The dark top rule establishes the catalogue edge.
- Explore has a broad search masthead. Its candidate count, loaded-record count, collection
  date and explicit weak-label caveat keep sample scope next to the task, rather than turning
  the measurements into separate dashboard cards.
- Ochre marks search, selected filters, navigation and focus; ink carries record content.
  White keeps the dense source material readable. This palette is the owner's identity choice.
- System sans is the catalogue reading voice; monospace identifies issue numbers and hashes.
  There are no remote fonts, logos, illustrations, decorative icons or marketing sections.
- The year strip is compact but remains a visible filter with counts, aria-pressed and a
  native table disclosure. Its neutral bars encode counts, rather than decorative activity.
- Facets form a flat, wrapping horizontal band before full-width results. Sample and State
  remain fully visible. App, Inclusion basis and GitHub label use named, focusable native
  scroll regions to bound long option lists; every option remains reachable by keyboard.
  All facet inputs retain stable IDs, native radio/checkbox behavior and live counts.
- Active-filter removal controls and Clear filters remain above the facet band. The band
  starts open on desktop. Below 900px its native, labelled disclosure starts closed; its
  44px summary and active count keep filters discoverable while bringing records closer.
- Dense catalogue rows put source issue ID, GitHub link, title, labels, app, state, dates,
  comments and inclusion evidence together. No sample data or inclusion definition changes.
- Manifest pairs filter definition and provenance with the downloads and previews. Methods
  retains its in-page navigation, readable text measure, chart and equivalent data table.

## Responsive behavior

- Desktop: horizontal navigation; 32px catalogue gutters; content up to 1376px including
  gutters. The five facet groups share the band when space permits. Real records begin
  within the 900px-high desktop reference viewport.
- Below 1000px: the labelled Menu opens the existing native modal sheet; Escape, focus
  return and wrapped Tab order remain intact. Facets wrap to two columns, with label search
  spanning the band. Search and sorting wrap according to available space.
- At 640px and below: 16px gutters, a stacked search toolbar, single-column expanded facets,
  and a wrapping year strip keep every year reachable without page overflow. Sample options
  retain full names. Longer lists scroll within their explicitly named regions.
- When the result region is narrower than 820px, rows stack with visible value labels and
  table roles. Sort headers become wrapping buttons. All seven data columns remain present.
- Text zoom, long titles, empty results, loading and data errors use the same composition;
  no content is clipped to fit a screenshot.

## Routes and behavior boundaries

Hash routes remain #/explore, #/manifest and #/methods; unknown routes show Not found.
Filters remain in the query string. Legacy anchors, browser Back/Forward, deep links, H1
focus and current-route markers retain their established behavior. The DOM IDs and event
bindings stay stable. Explicit theme choice remains remembered and works when storage fails.

The view layer continues treating issue text as untrusted text. Exports remain local and
include source URL, inclusion basis, filters, snapshot date and data-file hash. Weak labels
are never described as verified reports; comparison records are not checked negatives.
The complete manifest qualification and AI-assistance disclosure remain visible.

## Verification

Keep database-count, CSV-injection, exact hash, privacy, route, keyboard and axe assertions.
Only old layout and canvas assumptions change; the collapsed phone disclosure remains.
Verify 320/768/1440px, 200% reflow, explicit light/dark themes, controls of at least 44px,
no page overflow, named list scrolling, and actual desktop/mobile screenshots in grayscale.
Browser QA uses automated headless system Chrome with fresh profiles, not a user profile.

## November 15 audit revision

SQL uses a 40/60 editor/results grid with 12px gaps at desktop, stacking in task order below 60rem. Schema and splits retain native disclosure controls and named scrollable tables. Navigation/primary scope strips are compact and all features are free. Commercial research-service UI is removed; source rights remain in Methods. Query text has explicit bounded same-tab recovery, never automatic execution. Theme text names the next action while aria-pressed reflects current dark mode. Enlarged text yields to document growth rather than clipping.

## Editorial entry and optional local profiles — November 15

The newest owner brief adds an editorial root landing while preserving compact tool screens. The landing uses the existing palette, a responsive 56px-scale headline, an authentic labelled four-preview showcase, native disclosure navigation and guest-first entry. Mobile navigation collapses to a native Menu disclosure rather than consuming the first screen. Automatic previews pause on hover/focus and explicit user pause; reduced motion disables autoplay. No prices, upsells or fake adoption metrics are shown.

Login/signup use visible labels and a split form/context layout. Saved-work controls remain reachable in both desktop and mobile workspaces. Catalogue and bounded SQL with explicit saved query/filter/snapshot context; query restoration never runs SQL. Browser-local profiles provide organization, not encryption, verified identity or server authorization. All tools remain free without signup.

## Post-restart direct routes

The latest owner brief supersedes the ochre/purple palette: cool alabaster #f6f8f8, teal #075e62 and navy #182b42, with locally bundled OFL DM Sans. Existing catalogue/search/facet structure and legacy hash screens remain intact. Direct `/` opens Dataset, `/taxonomy` shows actual inclusion bases and GitHub labels, `/export` reuses filtered provenance CSV/JSON manifests, and `/system` reads process health and HTTP metrics. Query filters remain in the URL and independent between tabs. Direct navigation preserves the filter query.

Taxonomy counts are weak issue-selection metadata, never confirmed violations or severity findings. Category/label totals overlap. The label table remains keyboard reachable in its named scrolling region. Export uses the existing snapshot validator before enabling CSV/JSON actions; an invalid manifest blocks trusted downloads. Health data does not describe SQL-worker performance or data validity.


## November 16 navigation and local-work review

UI/UX Pro Max matches Research Lab / University Department, Minimalism & Swiss Style. Retain the existing alabaster #f6f8f8, teal #075e62, navy #182b42 and locally bundled DM Sans, rather than the generator's ochre/serif academic page suggestions. Keep the 4/8/16/24/32 scale, 44px controls and tabular data. Dataset, Taxonomy, Export and System stay primary in direct mode; SQL and Methods live in Research tools, with original hash navigation preserved. Local work wraps the original profile/save/backup/sync navigation beside the breadcrumb within the existing location row, consistently available on all four pages. Escape closes each utility before the native menu dialog; its focus list excludes closed/hidden links. Reuse App & help for offline/install controls. No warehouse/data/SQL execution or export semantics changed. Verify375/768/1024/1440 plus320, both themes, filtered counts/downloads, tab isolation and restore-dialog focus.

## Canonical workspace routes (November 16, 2026)

The persistent desktop rail and native mobile menu contain Overview, Workbench, Reports, and Settings. The root opens Overview. Alabaster, teal, navy, DM Sans, semantic tokens, and the existing research catalogue remain the design language. Workbench places the public search and issue list first, with bounded SQL and private issue intake in native disclosures. Reports contains actual query/split exports, cohort manifests, and server records. Settings separates server accounts/snapshots from retained browser profiles, encrypted backup, offline files, and diagnostics. Legacy research routes reuse their original tools and preserve meaningful aliases.

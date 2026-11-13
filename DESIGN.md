---
version: 2
name: a11y-issue-warehouse explorer
extends: docs/ui.css        # shared base; the dark auto-switch was removed from it in this version
dial: ENERGY 1 / RHYTHM 2 / MOTION 1
theme: light by default (also under an OS dark preference); dark only via the "Dark theme" button
colors:   # docs/explorer.css :root and :root[data-theme="dark"]
  canvas:        { light: "#f7f8fa", dark: "#0e141b", use: page background }
  surface:       { light: "#ffffff", dark: "#151d26", use: header, boxes, tables }
  rail:          { light: "#f0f3f5", dark: "#121a22", use: left rail, menu sheet, table header }
  ink:           { light: "#152536", dark: "#e5ecf2", use: text }
  muted:         { light: "#4b5e6f", dark: "#a9b6c2", use: secondary text }
  input-boundary:{ light: "#748694", dark: "#8796a4", use: input and button borders, bars }
  divider:       { light: "#dce2e8", dark: "#2d3a47", use: 1px borders }
  primary:       { light: "#254bb7", dark: "#9db6ff", use: links, current nav, selected year, focus }
  positive:      { light: "#12633c", dark: "#6fd39b", use: open-state icon, always with the word "Open" }
  warning:       { light: "#925400", dark: "#f0b65a", use: noscript note }
  danger:        { light: "#b42318", dark: "#ff9b8f", use: load-error box, always with text }
typography:
  ui:   { family: "Atkinson Hyperlegible (local woff2, SIL OFL 1.1)", size: 16px, lineHeight: 1.5 }
  h1:   { size: 1.875rem, lineHeight: 1.2 }
  mono: { family: "system ui-monospace", size: 14px, use: "the SHA-256 of the data file only" }
spacing: [4, 8, 16, 24, 32]
rounded: { control: 7px, label: 2em }
targets: { all controls: "44x44 CSS px min (tested on Explore and Manifest at 320 and 1440)", filter inputs: "24x24 inside a 44px clickable row", inline prose links: "exempt (WCAG 2.5.8)" }
elevation: flat (1px borders; dialogs use a backdrop, no shadows)
motion: none (state changes only; reduced motion respected)
---

# Design of the Issue Warehouse explorer

The approved root design of 2026-11-13 (light rebuild) plus the owner's identity addendum.
WCAG 2.2 AA wins over anything here.

## Frame
- Desktop (1000 px and wider): a 216 px left rail with the text wordmark, a one-line purpose,
  a **Work** group (Explore, Sample manifest) and a separate **Learn** group (Methods); a white
  location header with the breadcrumb `Issue Warehouse / <Screen>`; the workspace with a 32 px
  gutter and about 1100 px of content.
- Below 1000 px there is no permanent rail: a labelled **Menu** button opens a modal sheet
  (Escape closes it, focus returns to Menu, Tab wraps inside it).
- Phones (640 px and below): 16 px gutter.
- The issues table has seven columns (Issue with its GitHub link, App, State, Opened, Days to
  close, Comments, Inclusion basis). When the results column is narrower than 820 px (a
  container query, so phones and 1000-1360 px desktops alike) each issue becomes a stacked row
  with labelled values and the header becomes a bar of sort buttons, instead of the table
  scrolling sideways. If the table ever does scroll, a "scrolls sideways" hint is shown.

## Routes
Hash routes so GitHub Pages can serve them: `#/explore` (default), `#/manifest`, `#/methods`;
anything else is a Not found screen. Filters stay in the query string, so one address holds the
screen and the view. Old anchors map: `#explorer`/`#results` to Explore, `#about`/`#leakage` to
Methods at that section. A route change sets the title (`Screen – Issue Warehouse`), moves focus
to the H1 and marks the nav item with `aria-current="page"`.

## Signature pattern: a faceted data catalogue
Facets with live counts (sample, app, inclusion basis, state, GitHub label) sit beside the
result rows, as in a library or open-data catalogue. Above them an issues-over-time strip has
one button per year; its count follows every other filter, pressing it toggles the year filter
(`aria-pressed`), and a "Show these counts as a table" disclosure gives the same numbers as a
table. The year filter has no separate checkbox list; the strip is that filter.
The strip is **year-only by design**: the snapshot spans 2013-2026 (14 bars), and monthly bars
(about 160) would be too narrow to read or to hit at 44 px. Month filtering is not offered.
The filter is called "Inclusion basis" everywhere (facet, chips, manifest filter definition,
table column).

## Rules kept from the previous design
- Issue text is untrusted: it reaches the page only through `textContent` or attributes.
- One focal action per screen: the search box on Explore, **Download CSV** on Sample manifest.
- Status colour is never alone: open/closed have an icon and a word; errors have text.
- No gradients, illustration, logo, avatars, testimonials, invented numbers or decorative
  motion. Every number on screen is computed from `docs/data/issues.json` when the page loads.
- The weak-label caveat appears once on Explore (one concise note) and in full on the manifest.

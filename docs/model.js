// Data model shared by the explorer page and its Node tests: decodes docs/data/issues.json,
// says why each issue is in its sample, and builds the sample manifest (JSON and CSV).
// Pure functions only, no DOM. Issue titles and labels are untrusted text from GitHub.
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarehouseModel = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const DAY = 86400000;
  // Bit order of data.words; these keys are the URL values of the "category" filter.
  const WORD_KEYS = ['talkback', 'screen-reader', 'accessibility', 'a11y'];
  const SAMPLE_NAMES = {
    a11y: 'Accessibility sample', comparison: 'Comparison sample',
    excluded: 'Excluded keyword hits', all: 'All issues',
  };
  const CATEGORY_NAMES = {
    label: "Has the app's accessibility label", talkback: 'Mentions TalkBack',
    'screen-reader': 'Mentions screen reader', accessibility: 'Mentions accessibility', a11y: 'Mentions a11y',
  };
  const FILTERS = [['app', 'App'], ['category', 'Inclusion basis'], ['state', 'State'],
    ['year', 'Year opened'], ['label', 'GitHub label']];
  const CAVEAT = 'Weak labels, not human ground truth. Issues were selected by GitHub labels and ' +
    'search keywords and were not checked by hand. The accessibility sample includes feature ' +
    'requests and some issues only loosely about accessibility (for example release notes that ' +
    'mention a11y), and comparison issues are not checked negatives. Counts mean "issues this ' +
    'search found" on the snapshot date. No issue here is a verified bug.';
  const LABEL_QUALITY = 'weak: selected by label/keyword, not hand-checked';

  function ghURL(repo, number) {
    const [owner, name] = String(repo).split('/');
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${Number(number)}`;
  }

  /** Rows of the compact export as objects. */
  function decode(raw) {
    const f = Object.fromEntries(raw.fields.map((name, i) => [name, i]));
    const repoNames = raw.repos.map((r) => r.name);
    return raw.issues.map((row, idx) => {
      const repo = repoNames[row[f.repo]];
      const number = row[f.number];
      const created = row[f.created_at];
      const closed = row[f.closed_at];
      const sources = row[f.sources];
      const wordBits = row[f.words];
      const cats = new Set();
      if (sources & 1) cats.add('label');
      WORD_KEYS.forEach((w, b) => { if (wordBits & (1 << b)) cats.add(w); });
      const title = String(row[f.title]);
      return {
        idx, repo, number, title, lower: title.toLowerCase(), state: row[f.state],
        reason: row[f.state_reason], created, closed,
        days: closed ? (Date.parse(closed) - Date.parse(created)) / DAY : null,
        comments: row[f.comments], sample: raw.samples[row[f.sample]], sources, wordBits, cats,
        year: created.slice(0, 4), labels: row[f.labels].map((l) => raw.labels[l]),
        key: `${repo}/${number}`, id: `${repo}#${number}`, url: ghURL(repo, number),
      };
    });
  }

  const wordsOf = (issue, raw) => raw.words.filter((_, b) => issue.wordBits & (1 << b));
  const a11yLabelOf = (issue, raw) => (raw.repos.find((r) => r.name === issue.repo) || {}).a11y_label || null;

  /** Full inclusion basis, as recorded by the warehouse (issue_sources and the word test). */
  function inclusionBasis(issue, raw) {
    const out = [];
    if (issue.sources & 1) {
      const lab = a11yLabelOf(issue, raw);
      out.push(lab ? `label query: ${lab}` : 'label query');
    }
    if (issue.sources & 2) out.push('keyword query');
    if (issue.sources & 4) out.push('comparison draw (oldest issues of a matched month)');
    const words = wordsOf(issue, raw);
    out.push(words.length ? `words in title or body: ${words.join(', ')}` : 'no search word in title or body');
    return out;
  }

  /** Short evidence lines for the table: each says why the row is in its sample. */
  function evidence(issue, raw) {
    const lines = [];
    if (issue.sample === 'comparison') lines.push('Comparison: date-matched draw');
    if (issue.sources & 1) lines.push(`Label: ${a11yLabelOf(issue, raw) || 'accessibility'}`);
    const words = wordsOf(issue, raw);
    if (words.length) lines.push(`Keyword: ${words.join(', ')}`);
    if (!lines.length) lines.push('Keyword hit, no search word');
    return lines;
  }

  /** Plain-language definition of a filter state (the manifest's filter description). */
  function describeFilter(filter) {
    const parts = [SAMPLE_NAMES[filter.sample] || filter.sample];
    if (filter.q) parts.push(`Title contains: "${filter.q}"`);
    for (const [key, title] of FILTERS) {
      const values = [...(filter[key] || [])].sort();
      if (!values.length) continue;
      const names = key === 'category' ? values.map((v) => CATEGORY_NAMES[v] || v) : values;
      parts.push(`${title}: ${names.join(' or ')}`);
    }
    return parts.join('; ');
  }

  const byId = (a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : a.number - b.number);

  /**
   * The manifest of one filtered set. `issues` is the set the page shows for `filter`;
   * `query` is the URL query that reproduces it; `sha256` is the hex digest of the exact
   * bytes of data/issues.json the page loaded (null if the browser could not compute it).
   */
  function buildManifest({ raw, issues, filter, query, sha256, generatedAt }) {
    const list = [...issues].sort(byId);
    const plain = Object.fromEntries(FILTERS.map(([k]) => [k, [...(filter[k] || [])].sort()]));
    return {
      manifest_version: 1,
      generated_at: generatedAt,
      generated_by: 'a11y-issue-warehouse explorer, Sample manifest screen',
      snapshot: {
        collected_at: raw.about.collected_at,
        data_file: 'data/issues.json',
        data_sha256: sha256 || null,
        issues_in_snapshot: raw.about.issues,
        apps_in_snapshot: raw.repos.length,
      },
      filter: { query, description: describeFilter(filter), sample: filter.sample, q: filter.q || '', ...plain },
      caveat: CAVEAT,
      label_quality: LABEL_QUALITY,
      count: list.length,
      apps: new Set(list.map((i) => i.repo)).size,
      issues: list.map((i) => ({
        id: i.id, repo: i.repo, number: i.number, title: i.title, state: i.state, sample: i.sample,
        inclusion_basis: inclusionBasis(i, raw), labels: [...i.labels], source_url: i.url,
      })),
    };
  }

  // Quote per RFC 4180. A leading = + - @ tab or CR is prefixed with ' so spreadsheet apps
  // show the title as text instead of running it as a formula (CSV injection).
  function csvField(value) {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const CSV_COLUMNS = ['id', 'repo', 'number', 'state', 'sample', 'inclusion_basis', 'source_url', 'title',
    'filter_query', 'snapshot_collected_at', 'data_sha256', 'label_quality'];

  /** One row per issue; every row repeats the provenance so a row cut out of the file keeps it. */
  function manifestCSV(m) {
    const lines = [CSV_COLUMNS.join(',')];
    for (const i of m.issues) {
      lines.push([i.id, i.repo, i.number, i.state, i.sample, i.inclusion_basis.join('; '), i.source_url, i.title,
        m.filter.query, m.snapshot.collected_at, m.snapshot.data_sha256, m.label_quality || LABEL_QUALITY].map(csvField).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  return {
    WORD_KEYS, SAMPLE_NAMES, CATEGORY_NAMES, FILTERS, CAVEAT, LABEL_QUALITY, CSV_COLUMNS,
    ghURL, decode, inclusionBasis, evidence, describeFilter, buildManifest, manifestCSV, csvField,
  };
}));

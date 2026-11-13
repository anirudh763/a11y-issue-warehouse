// Explorer for docs/data/issues.json (written by `python3 -m warehouse.export_site`).
// Issue titles and labels are untrusted text from GitHub: they only ever reach the page
// through textContent or attribute setters, never as HTML.
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('en-US');
  const PAGE = 100;
  const DAY = 86400000;
  const SVG = 'http://www.w3.org/2000/svg';

  const SAMPLE_OPTIONS = [
    ['a11y', 'Accessibility', 'accessibility issue', 'accessibility issues'],
    ['comparison', 'Comparison sample', 'comparison issue', 'comparison issues'],
    ['excluded', 'Excluded keyword hits', 'excluded keyword hit', 'excluded keyword hits'],
    ['all', 'All issues', 'issue', 'issues'],
  ];
  // Accessibility evidence: the app's label (label query) or a search word in title/body.
  const CATEGORIES = [
    ['label', "Has the app's accessibility label"],
    ['talkback', 'Mentions TalkBack'],
    ['screen-reader', 'Mentions screen reader'],
    ['accessibility', 'Mentions accessibility'],
    ['a11y', 'Mentions a11y'],
  ];
  const WORD_KEYS = ['talkback', 'screen-reader', 'accessibility', 'a11y']; // bit order of data.words
  const SORTS = ['created', 'days', 'comments', 'repo', 'title', 'state'];
  const MULTI = ['app', 'category', 'state', 'year', 'label'];
  const MAX_Q = 200;
  const SORT_OPTIONS = new Set([...document.querySelectorAll('#sort option')].map((o) => o.value));

  let data = null;
  let issues = [];
  let facetDefs = [];
  let state = null;
  let view = [];
  let shown = PAGE;
  let labelFind = '';
  let detailIndex = -1;
  let returnFocus = null;

  // ---------- state <-> URL ----------
  function emptyState() {
    return { sample: 'a11y', q: '', sort: 'created', dir: 'desc', issue: null,
      app: new Set(), category: new Set(), state: new Set(), year: new Set(), label: new Set() };
  }

  function allowedValues(key) {
    const def = facetDefs.find((f) => f.key === key);
    return def ? def.allowed : new Set();
  }

  function readURL() {
    const p = new URLSearchParams(location.search);
    const s = emptyState();
    const sample = p.get('sample');
    if (SAMPLE_OPTIONS.some(([k]) => k === sample)) s.sample = sample;
    s.q = (p.get('q') || '').slice(0, MAX_Q);
    for (const key of MULTI) {
      const ok = allowedValues(key);
      for (const v of p.getAll(key)) if (ok.has(v)) s[key].add(v);
    }
    const [sort, dir] = (p.get('sort') || '').split(':');
    if (SORTS.includes(sort)) { s.sort = sort; s.dir = dir === 'asc' ? 'asc' : 'desc'; }
    const issue = p.get('issue');
    if (issue && issues.some((i) => i.key === issue)) s.issue = issue;
    return s;
  }

  function writeURL(push) {
    const p = new URLSearchParams();
    if (state.sample !== 'a11y') p.set('sample', state.sample);
    for (const key of MULTI) for (const v of [...state[key]].sort()) p.append(key, v);
    if (state.q) p.set('q', state.q);
    if (state.sort !== 'created' || state.dir !== 'desc') p.set('sort', `${state.sort}:${state.dir}`);
    if (state.issue) p.set('issue', state.issue);
    const qs = p.toString();
    const url = location.pathname + (qs ? `?${qs}` : '') + location.hash;
    if (url === location.pathname + location.search + location.hash) return;
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  // ---------- data ----------
  function prepare(raw) {
    const f = Object.fromEntries(raw.fields.map((name, i) => [name, i]));
    const repoNames = raw.repos.map((r) => r.name);
    return raw.issues.map((row, idx) => {
      const repo = repoNames[row[f.repo]];
      const created = row[f.created_at];
      const closed = row[f.closed_at];
      const sources = row[f.sources];
      const wordBits = row[f.words];
      const cats = new Set();
      if (sources & 1) cats.add('label');
      WORD_KEYS.forEach((w, b) => { if (wordBits & (1 << b)) cats.add(w); });
      const days = closed ? (Date.parse(closed) - Date.parse(created)) / DAY : null;
      return {
        idx, repo, number: row[f.number], title: String(row[f.title]),
        lower: String(row[f.title]).toLowerCase(), state: row[f.state],
        reason: row[f.state_reason], created, closed, days, comments: row[f.comments],
        sample: raw.samples[row[f.sample]], sources, wordBits, cats,
        year: created.slice(0, 4), labels: row[f.labels].map((l) => raw.labels[l]),
        key: `${repo}/${row[f.number]}`,
      };
    });
  }

  function buildFacetDefs() {
    const years = [...new Set(issues.map((i) => i.year))].sort().reverse();
    const labels = new Set(issues.flatMap((i) => i.labels));
    facetDefs = [
      { key: 'app', title: 'App', values: data.repos.map((r) => [r.name, r.name]).sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' })), get: (i) => [i.repo] },
      { key: 'category', title: 'Accessibility evidence', values: CATEGORIES, get: (i) => i.cats },
      { key: 'state', title: 'State', values: [['open', 'Open'], ['closed', 'Closed']], get: (i) => [i.state] },
      { key: 'year', title: 'Year opened', values: years.map((y) => [y, y]), get: (i) => [i.year] },
      { key: 'label', title: 'GitHub label', values: null, get: (i) => i.labels },
    ];
    for (const def of facetDefs) {
      def.allowed = new Set(def.values ? def.values.map(([k]) => k) : labels);
    }
  }

  // ---------- filtering ----------
  function matchesSearch(issue, q) {
    if (!q) return true;
    const num = /^#?(\d+)$/.exec(q.trim());
    if (num) return String(issue.number) === num[1] || issue.lower.includes(q.trim().toLowerCase());
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => issue.lower.includes(t));
  }

  function matches(issue, s, skip) {
    if (skip !== 'sample' && s.sample !== 'all' && issue.sample !== s.sample) return false;
    if (!matchesSearch(issue, s.q)) return false;
    for (const def of facetDefs) {
      if (def.key === skip) continue;
      const sel = s[def.key];
      if (!sel.size) continue;
      let hit = false;
      for (const v of def.get(issue)) if (sel.has(v)) { hit = true; break; }
      if (!hit) return false;
    }
    return true;
  }

  function compare(a, b) {
    const dir = state.dir === 'asc' ? 1 : -1;
    const k = state.sort;
    let x; let y;
    if (k === 'days') { x = a.days; y = b.days; }
    else if (k === 'comments') { x = a.comments; y = b.comments; }
    else if (k === 'repo') { x = a.repo.toLowerCase(); y = b.repo.toLowerCase(); }
    else if (k === 'title') { x = a.lower; y = b.lower; }
    else if (k === 'state') { x = a.state; y = b.state; }
    else { x = a.created; y = b.created; }
    if (x === null && y !== null) return 1; // open issues last when sorting by days
    if (y === null && x !== null) return -1;
    if (x < y) return -dir;
    if (x > y) return dir;
    return a.created < b.created ? 1 : a.created > b.created ? -1 : a.idx - b.idx;
  }

  // ---------- DOM helpers ----------
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k in node && typeof v !== 'string') node[k] = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  function svgEl(tag, attrs, text) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function stateIcon(st) {
    const svg = svgEl('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false', class: `st-icon ${st}` });
    if (st === 'open') {
      svg.append(svgEl('circle', { cx: 8, cy: 8, r: 6.25, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
        svgEl('circle', { cx: 8, cy: 8, r: 2, fill: 'currentColor' }));
    } else {
      svg.append(svgEl('circle', { cx: 8, cy: 8, r: 6.25, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
        svgEl('path', { d: 'M5 8.2 7.1 10.3 11 6.2', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }));
    }
    return svg;
  }

  function stateText(issue) {
    if (issue.state === 'open') return 'Open';
    if (issue.reason === 'not_planned') return 'Closed, not planned';
    if (issue.reason === 'duplicate') return 'Closed, duplicate';
    return 'Closed';
  }

  const day = (iso) => (iso ? iso.slice(0, 10) : '');
  const ghURL = (issue) => {
    const [owner, name] = issue.repo.split('/');
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${Number(issue.number)}`;
  };

  // ---------- facets ----------
  function renderFacets() {
    const list = $('facet-list');
    const focusedId = document.activeElement && document.activeElement.id;
    const findCaret = $('label-find') ? $('label-find').selectionStart : null;
    list.replaceChildren();

    // Sample: single choice.
    const sampleCounts = {};
    for (const i of issues) if (matches(i, state, 'sample')) sampleCounts[i.sample] = (sampleCounts[i.sample] || 0) + 1;
    sampleCounts.all = Object.values(sampleCounts).reduce((a, b) => a + b, 0);
    const fsS = el('fieldset', { class: 'facet', id: 'facet-sample' }, el('legend', { text: 'Sample' }));
    for (const [key, name] of SAMPLE_OPTIONS) {
      fsS.append(facetRow('radio', 'sample', key, name, sampleCounts[key] || 0, sampleCounts.all, state.sample === key));
    }
    list.append(fsS);

    for (const def of facetDefs) {
      const counts = new Map();
      for (const i of issues) {
        if (!matches(i, state, def.key)) continue;
        for (const v of def.get(i)) counts.set(v, (counts.get(v) || 0) + 1);
      }
      const total = issues.filter((i) => matches(i, state, def.key)).length;
      const fs = el('fieldset', { class: 'facet', id: `facet-${def.key}` }, el('legend', { text: def.title }));
      let values = def.values;
      if (!values) { // labels: selected ones, then the most frequent matches for the find box
        const find = labelFind.trim().toLowerCase();
        const ranked = [...counts.entries()]
          .filter(([name]) => !state.label.has(name) && (!find || name.toLowerCase().includes(find)))
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
        values = [...[...state.label].sort().map((n) => [n, n]), ...ranked.map(([n]) => [n, n])];
        const findInput = el('input', { id: 'label-find', class: 'input', type: 'search', autocomplete: 'off', spellcheck: 'false', value: labelFind });
        fs.append(el('label', { for: 'label-find', class: 'find-label', text: 'Find a label' }), findInput);
        if (!values.length) fs.append(el('p', { class: 'muted small', text: 'No label matches.' }));
      }
      for (const [key, name] of values) {
        const n = counts.get(key) || 0;
        if (!n && !state[def.key].has(key) && def.key !== 'state') continue;
        fs.append(facetRow('checkbox', def.key, key, name, n, total, state[def.key].has(key)));
      }
      list.append(fs);
    }
    const active = MULTI.reduce((a, k) => a + state[k].size, 0) + (state.q ? 1 : 0);
    $('facet-summary').textContent = active ? `${active} active` : '';
    if (focusedId && $(focusedId)) {
      $(focusedId).focus();
      if (focusedId === 'label-find' && findCaret !== null) $(focusedId).setSelectionRange(findCaret, findCaret);
    }
  }

  // One stable element id per facet value, so focus survives a re-render.
  const facetIds = new Map();
  function facetId(key, value) {
    const k = `${key}\u0000${value}`;
    if (!facetIds.has(k)) facetIds.set(k, `f-${key}-${facetIds.size}`);
    return facetIds.get(k);
  }

  function facetRow(type, key, value, name, count, total, checked) {
    const input = el('input', { type, id: facetId(key, value), name: `f-${key}`, value, checked });
    input.dataset.facet = key;
    const bar = el('span', { class: 'bar', 'aria-hidden': 'true' });
    bar.style.setProperty('--w', total ? `${Math.round((count / total) * 100)}%` : '0%');
    const row = el('div', { class: `facet-row${count ? '' : ' zero'}` },
      input,
      el('label', { for: input.id },
        el('span', { class: 'f-name', text: name, title: name }),
        el('span', { class: 'f-count', text: nf.format(count) }),
        bar));
    return row;
  }

  // ---------- results ----------
  function describeCount(n) {
    const opt = SAMPLE_OPTIONS.find(([k]) => k === state.sample);
    const filtered = MULTI.some((k) => state[k].size) || state.q;
    const verb = n === 1 ? 'matches' : 'match';
    return `${nf.format(n)} ${n === 1 ? opt[2] : opt[3]}${filtered ? ` ${verb} the filters` : ''}`;
  }

  function renderResults(resetPage) {
    view = issues.filter((i) => matches(i, state)).sort(compare);
    if (resetPage) shown = PAGE;
    const count = $('count');
    count.dataset.count = String(view.length);
    count.replaceChildren(el('strong', { text: describeCount(view.length) }),
      view.length > shown ? el('span', { class: 'muted', text: `, showing the first ${nf.format(shown)}` }) : '');
    const body = $('rows');
    body.replaceChildren();
    if (!view.length) {
      body.append(el('tr', null, el('td', { colspan: 6, class: 'empty' },
        'No issues match. ', el('button', { type: 'button', class: 'btn link', 'data-action': 'clear', text: 'Clear filters' }))));
    }
    for (const issue of view.slice(0, shown)) body.append(row(issue));
    $('more').hidden = view.length <= shown;
    $('more').textContent = `Show ${nf.format(Math.min(PAGE, view.length - shown))} more`;
    for (const th of document.querySelectorAll('#table th[data-key]')) {
      const on = th.dataset.key === state.sort;
      if (on) th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    }
    $('sort').value = SORT_OPTIONS.has(`${state.sort}:${state.dir}`) ? `${state.sort}:${state.dir}` : '';
  }

  function row(issue) {
    const [, name] = issue.repo.split('/');
    const tr = el('tr', null,
      el('td', { class: 'c-title' },
        el('button', { type: 'button', class: 'title-btn', 'data-idx': String(issue.idx), text: issue.title }),
        issue.labels.length ? el('span', { class: 'c-labels' }, ...issue.labels.slice(0, 3).map((l) => el('span', { class: 'label', text: l })),
          issue.labels.length > 3 ? el('span', { class: 'muted small', text: `+${issue.labels.length - 3}` }) : null) : null),
      el('td', { class: 'c-app' }, el('span', { title: issue.repo, text: name }), el('span', { class: 'mono muted', text: ` #${issue.number}` })),
      el('td', { class: `c-state ${issue.state}` }, stateIcon(issue.state), el('span', { text: issue.state === 'open' ? 'Open' : 'Closed' })),
      el('td', { class: 'c-date' }, el('time', { datetime: issue.created, text: day(issue.created) })),
      el('td', { class: 'num' }, issue.days === null
        ? el('span', null, el('span', { 'aria-hidden': 'true', class: 'muted', text: '–' }), el('span', { class: 'sr-only', text: 'not closed' }))
        : nf.format(Math.round(issue.days))),
      el('td', { class: 'num', text: nf.format(issue.comments) }));
    return tr;
  }

  function renderChips() {
    const ul = $('chips');
    ul.replaceChildren();
    const add = (key, value, text) => {
      ul.append(el('li', null, el('button', {
        type: 'button', class: 'chip', 'data-key': key, 'data-value': value,
        'aria-label': `Remove filter ${text}`,
      }, el('span', { text }), el('span', { 'aria-hidden': 'true', class: 'x', text: '×' }))));
    };
    if (state.q) add('q', '', `Title: ${state.q}`);
    for (const def of facetDefs) {
      for (const v of [...state[def.key]].sort()) {
        const name = def.values ? (def.values.find(([k]) => k === v) || [v, v])[1] : v;
        add(def.key, v, `${def.title}: ${name}`);
      }
    }
    const any = ul.children.length > 0;
    $('clear').hidden = !any;
    ul.parentElement.classList.toggle('none', !any);
  }

  function render(resetPage = true) {
    renderFacets();
    renderChips();
    renderResults(resetPage);
    if ($('q') !== document.activeElement) $('q').value = state.q;
  }

  // ---------- detail dialog ----------
  // Opening, stepping and closing the drawer all replace the history entry, so Back always
  // leaves the current filtered view rather than stepping through drawer states.
  // `from` is the Previous/Next button that was pressed: focus stays on it and the new
  // title is announced through the live region.
  function openDetail(idx, from = null) {
    const issue = issues[idx];
    if (!issue) return;
    const dlg = $('detail');
    detailIndex = view.indexOf(issue);
    $('d-ref').textContent = `${issue.repo} #${issue.number}`;
    $('d-title').textContent = issue.title;
    const facts = $('d-facts');
    facts.replaceChildren();
    const fact = (k, ...v) => facts.append(el('div', null, el('dt', { text: k }), el('dd', null, ...v)));
    fact('State', el('span', { class: `c-state ${issue.state}` }, stateIcon(issue.state), el('span', { text: stateText(issue) })));
    fact('Opened', el('time', { datetime: issue.created, text: day(issue.created) }));
    fact('Closed', issue.closed ? el('time', { datetime: issue.closed, text: day(issue.closed) }) : 'Not closed');
    if (issue.days !== null) fact('Days to close', issue.days.toFixed(1));
    fact('Comments', nf.format(issue.comments));
    const labels = $('d-labels');
    labels.replaceChildren(...(issue.labels.length ? issue.labels.map((l) => el('li', null, el('span', { class: 'label', text: l })))
      : [el('li', { class: 'muted', text: 'No labels' })]));
    const why = $('d-why');
    const sampleName = SAMPLE_OPTIONS.find(([k]) => k === issue.sample)[1];
    const sources = data.sources.filter((_, b) => issue.sources & (1 << b));
    const words = data.words.filter((_, b) => issue.wordBits & (1 << b));
    why.replaceChildren(
      el('li', null, el('strong', { text: 'Sample: ' }), sampleName),
      el('li', null, el('strong', { text: 'Returned by: ' }), sources.map((s) => `${s} query`).join(', ')),
      el('li', null, el('strong', { text: 'Search words in title or body: ' }), words.length ? words.join(', ') : 'none'));
    if (issue.sources & 1) {
      const lab = (data.repos.find((r) => r.name === issue.repo) || {}).a11y_label;
      if (lab) why.append(el('li', null, el('strong', { text: "App's accessibility label: " }), lab));
    }
    const link = $('d-link');
    link.href = ghURL(issue);
    link.textContent = `Open #${issue.number} on GitHub`;
    $('d-prev').disabled = detailIndex <= 0;
    $('d-next').disabled = detailIndex < 0 || detailIndex >= view.length - 1;
    state.issue = issue.key;
    writeURL(false);
    if (!dlg.open) {
      returnFocus = document.activeElement;
      $('d-live').textContent = '';
      dlg.showModal();
    }
    if (from) {
      const other = from === $('d-prev') ? $('d-next') : $('d-prev');
      (!from.disabled ? from : !other.disabled ? other : $('d-close')).focus();
      $('d-live').textContent = `Issue ${nf.format(detailIndex + 1)} of ${nf.format(view.length)}: ${issue.title}`;
    } else {
      $('d-close').focus();
    }
  }

  function closeDetail() {
    const dlg = $('detail');
    if (dlg.open) dlg.close();
  }

  // ---------- chart ----------
  function renderLeakage() {
    const rows = data.leakage;
    const name = (s) => (s.startsWith('keyword') ? 'Keyword rule' : 'TF-IDF + logistic regression');
    const text = (s) => (s.endsWith('masked text') ? 'words masked' : 'words left in');
    const tbody = document.querySelector('#leak-table tbody');
    tbody.replaceChildren(...rows.map((r) => el('tr', null,
      el('th', { scope: 'row', text: name(r.system) }), el('td', { text: text(r.system) }),
      el('td', { class: 'num', text: r.precision.toFixed(3) }), el('td', { class: 'num', text: r.recall.toFixed(3) }),
      el('td', { class: 'num', text: r.f1.toFixed(3) }), el('td', { text: `${r.f1_ci95_low.toFixed(3)} to ${r.f1_ci95_high.toFixed(3)}` }),
      el('td', { class: 'num', text: r.recall_on_label_only.toFixed(3) }))));
    const masked = rows.find((r) => r.system.startsWith('tfidf') && r.system.endsWith('masked text'));
    if (masked) {
      bind('leak-issues', nf.format(masked.issues));
      bind('leak-label-only', `${(masked.recall_on_label_only * 100).toFixed(1)}%`);
      bind('leak-label-only-n', nf.format(masked.label_only_positives));
    }
    drawChart();
  }

  function drawChart() {
    const host = $('chart');
    const rows = data.leakage;
    const W = Math.max(260, Math.min(720, host.clientWidth || 640));
    const left = 0; const right = 52; const barH = 18; const gap = 34; const top = 8;
    const groups = [['keyword', 'Keyword rule'], ['tfidf', 'TF-IDF + logistic regression']];
    const H = top + groups.length * (2 * (barH + gap)) + 26;
    const x = (v) => left + v * (W - left - right);
    const desc = rows.map((r) => `${r.system}: F1 ${r.f1.toFixed(3)}`).join('; ');
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'chart-t chart-d', class: 'leak-svg' });
    svg.append(svgEl('title', { id: 'chart-t' }, 'F1 with search words left in and masked'), svgEl('desc', { id: 'chart-d' }, desc));
    const axisY = H - 22;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append(svgEl('line', { x1: x(t), x2: x(t), y1: top, y2: axisY, class: 'grid' }));
      svg.append(svgEl('text', { x: x(t), y: axisY + 16, 'text-anchor': t === 0 ? 'start' : t === 1 ? 'end' : 'middle', class: 'tick' }, t.toFixed(2)));
    }
    let y = top;
    for (const [prefix, gname] of groups) {
      for (const variant of ['raw text', 'masked text']) {
        const r = rows.find((row) => row.system.startsWith(prefix) && row.system.endsWith(variant));
        if (!r) continue;
        const cls = variant === 'raw text' ? 'bar-raw' : 'bar-masked';
        svg.append(svgEl('text', { x: left, y: y + 13, class: 'row-label' }, `${gname}, ${variant === 'raw text' ? 'words left in' : 'words masked'}`));
        const by = y + 20;
        svg.append(svgEl('rect', { x: x(0), y: by, width: Math.max(0, x(r.f1) - x(0)), height: barH, class: cls }));
        if (r.f1_ci95_high > r.f1_ci95_low) {
          svg.append(svgEl('line', { x1: x(r.f1_ci95_low), x2: x(r.f1_ci95_high), y1: by + barH / 2, y2: by + barH / 2, class: 'ci' }));
        }
        svg.append(svgEl('text', { x: x(Math.max(r.f1, r.f1_ci95_high)) + 6, y: by + 13, class: 'value' }, r.f1.toFixed(3)));
        y += barH + gap;
      }
    }
    host.replaceChildren(svg);
  }

  function bind(name, value) {
    for (const node of document.querySelectorAll(`[data-bind="${name}"]`)) node.textContent = value;
  }

  function bindAbout() {
    bind('collected', day(data.about.collected_at));
    const a11y = issues.filter((i) => i.sample === 'a11y');
    const fenix = a11y.filter((i) => i.repo === 'mozilla-mobile/fenix').length;
    bind('fenix-share', `${nf.format(fenix)} of the ${nf.format(a11y.length)}`);
    bind('n-a11y', nf.format(a11y.length));
    bind('n-comparison', nf.format(issues.filter((i) => i.sample === 'comparison').length));
    bind('labelled-apps', nf.format(data.repos.filter((r) => r.a11y_label).length));
    bind('excluded', nf.format(issues.filter((i) => i.sample === 'excluded').length));
    bind('excluded-hits', nf.format(issues.filter((i) => (i.sources & 2) && i.wordBits === 0).length));
  }

  // ---------- events ----------
  function wire() {
    let timer = null;
    $('q').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.q = e.target.value.slice(0, MAX_Q);
        writeURL(false);
        render();
      }, 120);
    });
    $('facet-list').addEventListener('change', (e) => {
      const t = e.target;
      if (!t.dataset.facet) return;
      if (t.dataset.facet === 'sample') state.sample = t.value;
      else if (t.checked) state[t.dataset.facet].add(t.value);
      else state[t.dataset.facet].delete(t.value);
      writeURL(true);
      render();
    });
    $('facet-list').addEventListener('input', (e) => {
      if (e.target.id !== 'label-find') return;
      labelFind = e.target.value.slice(0, 100);
      renderFacets();
    });
    $('chips').addEventListener('click', (e) => {
      const b = e.target.closest('button.chip');
      if (!b) return;
      const next = b.closest('li').nextElementSibling || b.closest('li').previousElementSibling;
      const nextKey = next ? [next.firstChild.dataset.key, next.firstChild.dataset.value] : null;
      if (b.dataset.key === 'q') state.q = '';
      else state[b.dataset.key].delete(b.dataset.value);
      writeURL(true);
      render();
      const target = nextKey && document.querySelector(`#chips button[data-key="${CSS.escape(nextKey[0])}"][data-value="${CSS.escape(nextKey[1])}"]`);
      (target || $('q')).focus();
    });
    const clearAll = () => {
      for (const k of MULTI) state[k].clear();
      state.q = '';
      writeURL(true);
      render();
      $('q').focus();
    };
    $('clear').addEventListener('click', clearAll);
    $('rows').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.action === 'clear') clearAll();
      else if (b.dataset.idx) openDetail(Number(b.dataset.idx));
    });
    $('more').addEventListener('click', () => {
      const first = shown;
      shown += PAGE;
      renderResults(false);
      const btn = $('rows').children[first] && $('rows').children[first].querySelector('button');
      if (btn) btn.focus();
    });
    $('sort').addEventListener('change', (e) => {
      const [s, d] = e.target.value.split(':');
      state.sort = s; state.dir = d;
      writeURL(true);
      renderResults(true);
    });
    document.querySelector('#table thead').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-key]');
      if (!th) return;
      const key = th.dataset.key;
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort = key; state.dir = key === 'title' || key === 'repo' ? 'asc' : 'desc'; }
      writeURL(true);
      renderResults(true);
    });
    $('d-close').addEventListener('click', closeDetail);
    $('d-prev').addEventListener('click', () => { if (detailIndex > 0) openDetail(view[detailIndex - 1].idx, $('d-prev')); });
    $('d-next').addEventListener('click', () => { if (detailIndex < view.length - 1) openDetail(view[detailIndex + 1].idx, $('d-next')); });
    $('detail').addEventListener('click', (e) => { if (e.target === $('detail')) closeDetail(); });
    $('detail').addEventListener('close', () => {
      state.issue = null;
      writeURL(false);
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
      else $('results').focus();
      returnFocus = null;
    });
    $('copy-link').addEventListener('click', async () => {
      const status = $('copy-status');
      try {
        await navigator.clipboard.writeText(location.href);
        status.textContent = 'Link copied';
      } catch {
        status.textContent = 'Copy failed; copy the address bar instead';
      }
      setTimeout(() => { status.textContent = ''; }, 4000);
    });
    window.addEventListener('popstate', () => {
      state = readURL();
      render();
      syncDetail();
    });
    if ('ResizeObserver' in window) {
      let last = 0;
      new ResizeObserver(() => {
        const w = $('chart').clientWidth;
        if (Math.abs(w - last) > 8) { last = w; drawChart(); }
      }).observe($('chart'));
    }
    const narrow = window.matchMedia('(max-width: 899px)');
    if (narrow.matches) $('facets').open = false;
  }

  function syncDetail() {
    const issue = state.issue && issues.find((i) => i.key === state.issue);
    if (issue) openDetail(issue.idx);
    else closeDetail();
  }

  // A failed or malformed data file leaves a visible, announced message, never a blank page.
  function showLoadError(reason) {
    const msg = `Could not load the issue data (data/issues.json: ${reason}). ` +
      'Reload the page; if you opened index.html from disk, serve the docs/ folder over HTTP instead, for example with python3 -m http.server -d docs.';
    const count = $('count');
    count.classList.add('load-error');
    count.setAttribute('role', 'alert');
    count.textContent = msg;
    $('rows').replaceChildren(el('tr', null, el('td', { colspan: 6, class: 'empty', text: 'No issues to show: the data file did not load.' })));
    $('chart').replaceChildren(el('p', { class: 'muted', text: 'Chart unavailable: the data file did not load.' }));
    for (const id of ['q', 'sort', 'copy-link']) $(id).disabled = true;
    document.documentElement.dataset.ready = 'error';
  }

  function checkShape(d) {
    const ok = d && Array.isArray(d.issues) && Array.isArray(d.fields) && Array.isArray(d.repos) &&
      Array.isArray(d.labels) && Array.isArray(d.samples) && Array.isArray(d.leakage) && d.about &&
      ['repo', 'number', 'title', 'state', 'created_at', 'sample', 'labels'].every((f) => d.fields.includes(f));
    if (!ok) throw new Error('unexpected file format');
  }

  async function start() {
    try {
      const res = await fetch('data/issues.json', { credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      checkShape(data);
      issues = prepare(data);
      buildFacetDefs();
    } catch (err) {
      showLoadError(err instanceof SyntaxError ? 'not valid JSON' : err.message || 'network error');
      return;
    }
    state = readURL();
    writeURL(false); // drop unknown or invalid parameters from the address
    wire();
    bindAbout();
    renderLeakage();
    render();
    syncDetail();
    document.documentElement.dataset.ready = 'true';
  }

  start();
})();

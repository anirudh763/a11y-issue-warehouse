'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const M = window.WarehouseModel;
  let raw; let rows; let provenance; let worker; let serial = 0; let active = null;
  let lastSQL = ''; let splitSeed = null; let busy = false; let verified = false;
  let queryReady = false; let splitReady = false;

  function syncQueryControls() {
    const disabled = !verified || busy;
    $('sql-run').disabled = disabled;
    document.querySelectorAll('[data-sql-preset]').forEach((button) => { button.disabled = disabled; });
  }

  const definitions = {
    repo: 'Repository full name', number: 'GitHub issue number', title: 'Redacted title', state: 'Open or closed',
    state_reason: 'GitHub close reason, if present', created_at: 'Issue creation timestamp', closed_at: 'Close timestamp, if present',
    comments: 'Comment count', sample: 'Accessibility, comparison, or excluded keyword hit',
    sources: 'Bit flags: label=1, keyword=2, comparison=4', words: 'Bit flags for the four documented search words', labels: 'Redacted GitHub labels',
  };

  function paintSchema(manifest) {
    $('sql-schema-rows').replaceChildren(...manifest.schema.map((field) => {
      const tr = document.createElement('tr');
      for (const value of [field.name, field.type, definitions[field.name]]) {
        const cell = document.createElement('td'); cell.textContent = value; tr.append(cell);
      }
      return tr;
    }));
    $('sql-provenance').textContent = `${manifest.row_count.toLocaleString()} public rows; schema v${manifest.schema_version}; SHA-256 ${manifest.sha256}; collected ${manifest.collected_at}. DuckDB-Wasm ${manifest.engine || 'loaded on first use'}.`;
  }

  function setTrust(manifest, digest) {
    const result = M.validateSnapshot(raw, digest, manifest);
    verified = result.ok;
    provenance = manifest && { sha256: manifest.sha256, collected_at: manifest.collected_at };
    $('sql-status').textContent = result.ok
      ? `Verified issues.json SHA-256 ${manifest.sha256}; schema v${manifest.schema_version}; ${manifest.row_count.toLocaleString()} rows. SQL uses only the public projection.`
      : `${result.reason}${result.quarantine.length ? ` (${result.quarantine.length} row${result.quarantine.length === 1 ? '' : 's'} quarantined)` : ''}. Trusted SQL and exports are disabled.`;
    syncQueryControls();
    $('split-run').disabled = !verified || busy;
    $('sql-quarantine').hidden = result.quarantine.length === 0;
    $('sql-quarantine').replaceChildren(...result.quarantine.slice(0, 50).map((item) => {
      const li = document.createElement('li'); li.textContent = `Row ${item.row}: ${item.reason}`; return li;
    }));
    if (result.ok) paintSchema(manifest);
  }

  async function fetchManifest() {
    const response = await fetch('data/manifest.json', { credentials: 'omit' });
    if (!response.ok) throw new Error(`Manifest request failed (HTTP ${response.status}).`);
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65_536) { await reader.cancel(); throw new Error('Manifest exceeds the 64 KB limit.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const manifest = JSON.parse(new TextDecoder().decode(bytes));
    setTrust(manifest, raw.__digest);
  }

  function clearResults(message) {
    $('sql-table').querySelector('thead').replaceChildren();
    $('sql-table').querySelector('tbody').replaceChildren();
    $('sql-result-status').textContent = message;
    document.querySelectorAll('[data-sql-export]').forEach((b) => { b.disabled = true; });
  }

  function ensureWorker() {
    if (worker) return;
    worker = new Worker('sql-worker.js', { type: 'module' });
    worker.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'phase') { $('sql-engine').textContent = message.phase; return; }
      if (message.type === 'ready') {
        $('sql-engine').textContent = `DuckDB-Wasm ${message.version}; local, one worker thread`;
        return;
      }
      if (!active || message.id !== active.id) return;
      if (message.type === 'deadline') {
        failWorker('Query exceeded the 12 second worker deadline. The worker was stopped; retry to start a fresh engine.');
        return;
      }
      clearTimeout(active.timer);
      const request = active; active = null; busy = false;
      $('sql-cancel').disabled = true;
      syncQueryControls();
      $('split-run').disabled = !verified;
      document.querySelectorAll('[data-sql-export]').forEach((b) => { b.disabled = !verified || !queryReady; });
      document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = !verified || !splitReady; });
      if (message.type === 'error') request.reject(new Error(message.error));
      else request.resolve(message.result);
    });
    worker.addEventListener('error', () => failWorker('The SQL worker failed. It was stopped; retry to start a fresh engine.'));
  }

  function failWorker(reason) {
    if (worker) worker.terminate(); worker = null;
    if (active) { clearTimeout(active.timer); active.reject(new Error(reason)); active = null; }
    busy = false;
    $('sql-cancel').disabled = true;
    syncQueryControls();
    $('split-run').disabled = !verified;
    queryReady = false; splitReady = false;
    clearResults(reason);
    $('split-status').textContent = reason;
  }

  function request(type, data) {
    ensureWorker();
    if (busy) return Promise.reject(new Error('Wait for the current operation to finish.'));
    busy = true;
    if (type === 'query') clearResults('Running query…');
    if (type === 'export-query') { $('sql-export-status').textContent = 'Building and checking export…'; document.querySelectorAll('[data-sql-export]').forEach((b) => { b.disabled = true; }); }
    if (type === 'export-split') document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = true; });
    syncQueryControls(); $('split-run').disabled = true; $('sql-cancel').disabled = false;
    const id = ++serial;
    const timeout = type.startsWith('export-') ? 60_000 : $('sql-engine').textContent ? 12_000 : 60_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => failWorker('The worker deadline expired. It was stopped; retry to start a fresh engine.'), timeout);
      active = { id, timer, resolve, reject };
      worker.postMessage({ id, type, ...data, rows: M.sqlProjection(rows), provenance });
    });
  }

  function renderResult(result) {
    const head = $('sql-table').querySelector('thead'); const body = $('sql-table').querySelector('tbody');
    head.replaceChildren(); body.replaceChildren();
    const tr = document.createElement('tr');
    result.fields.forEach((field) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = field; tr.append(th); });
    head.append(tr);
    body.replaceChildren(...result.rows.map((values) => {
      const row = document.createElement('tr');
      values.forEach((value) => { const cell = document.createElement('td'); cell.textContent = value === null ? 'NULL' : Array.isArray(value) ? JSON.stringify(value) : String(value); row.append(cell); });
      return row;
    }));
    $('sql-result-status').textContent = result.rows.length
      ? `${result.rows.length} rows shown (${result.fields.length} columns). Results stop at ${500} rows.`
      : `0 rows. Columns: ${result.fields.join(', ') || 'none'}.`;
    document.querySelectorAll('[data-sql-export]').forEach((b) => { b.disabled = !verified; });
    queryReady = true;
    $('sql-engine').textContent = `DuckDB-Wasm ${result.version}; local, one worker thread`;
  }

  function save(file) {
    const blob = new Blob([file.bytes], { type: file.filename.endsWith('.parquet') ? 'application/vnd.apache.parquet' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = file.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('sql-export-status').textContent = `${file.rows.toLocaleString()} rows; SHA-256 ${file.hash}; readback verified.`;
  }

  async function runQuery() {
    const sql = $('sql-query').value;
    lastSQL = sql;
    try { renderResult(await request('query', { sql })); }
    catch (error) { clearResults(error.message); }
  }

  async function makeSplit() {
    splitSeed = $('split-seed').value;
    $('split-status').textContent = 'Building SHA-256 split…';
    try {
      const split = await request('split', { seed: splitSeed });
      splitReady = true;
      const counts = split.reduce((a, row) => (a[row.split] = (a[row.split] || 0) + 1, a), {});
      $('split-status').textContent = `${split.length.toLocaleString()} rows; train ${counts.train || 0}, validation ${counts.validation || 0}, test ${counts.test || 0}; all IDs assigned once.`;
      document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = !verified; });
    } catch (error) { $('split-status').textContent = error.message; document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = true; }); }
  }

  function wire() {
    $('sql-run').addEventListener('click', runQuery);
    document.querySelectorAll('[data-sql-preset]').forEach((button) => button.addEventListener('click', () => {
      $('sql-query').value = button.dataset.sqlPreset;
      runQuery();
    }));
    $('sql-cancel').addEventListener('click', () => failWorker('Query cancelled. The worker was stopped; run again to create a new worker.'));
    $('sql-retry').addEventListener('click', async () => {
      $('sql-status').textContent = 'Rechecking the snapshot manifest…';
      try { await fetchManifest(); } catch (error) { verified = false; setTrust(null, null); $('sql-status').textContent = error.message; }
    });
    $('split-run').addEventListener('click', makeSplit);
    document.querySelectorAll('[data-sql-export]').forEach((button) => button.addEventListener('click', async () => {
      try { save(await request('export-query', { sql: lastSQL, format: button.dataset.sqlExport })); }
      catch (error) { $('sql-export-status').textContent = error.message; }
    }));
    document.querySelectorAll('[data-split-export]').forEach((button) => button.addEventListener('click', async () => {
      try { save(await request('export-split', { seed: splitSeed, format: button.dataset.splitExport })); }
      catch (error) { $('split-status').textContent = error.message; }
    }));
  }

  window.WarehouseSQL = {
    configure(snapshot, digest, decoded) {
      raw = snapshot; raw.__digest = digest; rows = decoded; wire();
      fetchManifest().catch((error) => { verified = false; $('sql-status').textContent = `${error.message} Trusted SQL and exports are disabled.`; });
    },
  };
})();

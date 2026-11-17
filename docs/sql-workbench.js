'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const M = window.WarehouseModel;
  let raw; let rows; let provenance; let worker; let serial = 0; let active = null;
  let lastSQL = ''; let splitSeed = null; let busy = false; let verified = false;
  let queryReady = false; let splitReady = false;
  let queryRevision = 0; let splitRevision = 0;let wired=false;
  let savedResult=null,savedSplit=null,recoveryKey=null;
  const changed=()=>window.dispatchEvent(new Event('warehouse-change'));
  const serverEnabled=()=>!!document.querySelector('meta[name=server-persistence][content=enabled]');

  const QUERY_KEY = 'issue_warehouse_guest_query_v1';
  function discardSavedQuery() {
    try { sessionStorage.removeItem(recoveryKey || (serverEnabled() ? 'issue_warehouse_no_principal' : QUERY_KEY)); return true; } catch { return false; }
  }
  function saveQuery() {
    const query = $('sql-query').value;
    if(serverEnabled()&&!recoveryKey){$('sql-recovery-status').textContent='Connect a server workspace to enable private tab recovery.';return;}
    if (window.ProductSurface?.profiles.current()) { $('sql-recovery-status').textContent = 'Use Save work to keep this query on this browser.'; return; }
    try {
      if (new TextEncoder().encode(query).byteLength > 4096) {
        if(serverEnabled()){$('sql-recovery-status').textContent='Query exceeds 4,096 bytes. The previous tab copy was retained; export current text before reloading.';return;}
        const cleared = discardSavedQuery();
        $('sql-recovery-status').textContent = cleared
          ? 'Query exceeds 4,096 bytes; not saved for reload.'
          : 'Query exceeds 4,096 bytes; saved query could not be cleared. Copy your query before reloading.';
        return;
      }
      sessionStorage.setItem(recoveryKey || QUERY_KEY, query);
      $('sql-recovery-status').textContent = 'Query saved in this tab for reload.';
    } catch {
      if(serverEnabled()){$('sql-recovery-status').textContent='Tab storage unavailable. Previous copies were retained; copy current text before reloading.';return;}
      const cleared = discardSavedQuery();
      $('sql-recovery-status').textContent = cleared
        ? 'Tab storage unavailable. Copy your query before reloading.'
        : 'Tab storage unavailable; an older saved query may restore. Copy your query before reloading.';
    }
  }
  function restoreQuery() {
    if(serverEnabled()&&!recoveryKey)return;
    if (window.ProductSurface?.profiles.current()) return;
    try {
      const query = sessionStorage.getItem(recoveryKey || QUERY_KEY);
      if (query !== null && new TextEncoder().encode(query).byteLength <= 4096) {
        $('sql-query').value = query;
        $('sql-recovery-status').textContent = 'Restored query; not run. Results require Run query.';
      }
    } catch { $('sql-recovery-status').textContent = 'Tab storage unavailable. Copy your query before reloading.'; }
  }

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
      ? `${manifest.row_count.toLocaleString()} rows; snapshot ${manifest.collected_at}. Hash matches manifest.`
      : `${result.reason}${result.quarantine.length ? ` (${result.quarantine.length} row${result.quarantine.length === 1 ? '' : 's'} quarantined)` : ''}. Trusted SQL and exports are disabled.`;
    syncQueryControls();
    $('split-run').disabled = !verified || busy;
    $('sql-quarantine').hidden = result.quarantine.length === 0;
    $('sql-quarantine').replaceChildren(...result.quarantine.slice(0, 50).map((item) => {
      const li = document.createElement('li'); li.textContent = `Row ${item.row}: ${item.reason}`; return li;
    }));
    if (result.ok) paintSchema(manifest);
    window.dispatchEvent(new Event("warehouse-trust"));
  }

  async function fetchManifest() {
    const response = await fetch('data/manifest.json', { credentials: 'omit', signal: AbortSignal.timeout(10000) });
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
    queryReady = false; savedResult=null;
    $('sql-table').querySelector('thead').replaceChildren();
    $('sql-table').querySelector('tbody').replaceChildren();
    $('sql-result-status').textContent = message;
    document.querySelectorAll('[data-sql-export]').forEach((b) => { b.disabled = true; });
  }

  function ensureWorker() {
    if (worker) return;
    const ownedWorker = new Worker('sql-worker.js', { type: 'module' });worker=ownedWorker;
    ownedWorker.addEventListener('message', (event) => {
      if(worker!==ownedWorker)return;
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
    ownedWorker.addEventListener('error', () => {if(worker===ownedWorker)failWorker('The SQL worker failed. It was stopped; retry to start a fresh engine.');});
  }

  function failWorker(reason) {
    if (worker) worker.terminate(); worker = null;
    if (active) { clearTimeout(active.timer); active.reject(new Error(reason)); active = null; }
    busy = false;
    $('sql-cancel').disabled = true;
    syncQueryControls();
    $('split-run').disabled = !verified;
    queryReady = false; splitReady = false; savedResult=null;savedSplit=null;
    clearResults(reason);
    $('split-status').textContent = reason;
  }

  function request(type, data) {
    ensureWorker();
    if (busy) return Promise.reject(new Error('Wait for the current operation to finish.'));
    busy = true;
    if (type === 'query') clearResults('Running query…');
    if (type === 'export-query') { $('sql-export-status').textContent = 'Building and checking export…'; document.querySelectorAll('[data-sql-export]').forEach((b) => { b.disabled = true; }); }
    if (type === 'export-split') {
      $('split-status').textContent = 'Building and checking split export…';
      document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = true; });
    }
    syncQueryControls(); $('split-run').disabled = true; $('sql-cancel').disabled = false;
    const id = ++serial;
    const timeout = type.startsWith('export-') ? 60_000 : $('sql-engine').textContent ? 12_000 : 60_000;
    return new Promise((resolve, reject) => {
      const ownedWorker=worker;
      const timer = setTimeout(() => {if(worker===ownedWorker&&active?.id===id)failWorker('The worker deadline expired. It was stopped; retry to start a fresh engine.');}, timeout);
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
    savedResult={rows:result.rows.length,fields:result.fields,engine:result.version,limit:500};changed();
    window.dispatchEvent(new CustomEvent("launch-step", { detail: 1 }));
    $('sql-engine').textContent = `DuckDB-Wasm ${result.version}; local, one worker thread`;
  }

  function save(file, statusId) {
    const blob = new Blob([file.bytes], { type: file.filename.endsWith('.parquet') ? 'application/vnd.apache.parquet' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = file.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.dispatchEvent(new CustomEvent("launch-step", { detail: 2 }));
    $(statusId).textContent = `${file.rows.toLocaleString()} rows; SHA-256 ${file.hash}; readback verified.`;
  }

  async function runQuery() {
    const sql = $('sql-query').value;
    const revision = queryRevision;
    lastSQL = sql;
    saveQuery();
    try {
      const result = await request('query', { sql });
      if (revision === queryRevision && $('sql-query').value === sql) renderResult(result);
    } catch (error) {
      if (revision === queryRevision) clearResults(error.message);
    }
  }

  async function makeSplit() {
    const seed = $('split-seed').value;
    const revision = splitRevision;
    splitSeed = seed;
    splitReady = false;
    document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = true; });
    $('split-status').textContent = 'Building SHA-256 split…';
    try {
      const split = await request('split', { seed });
      if (revision !== splitRevision || $('split-seed').value !== seed) return;
      splitReady = true;
      const counts = split.reduce((a, row) => (a[row.split] = (a[row.split] || 0) + 1, a), {});
      savedSplit={rows:split.length,counts,algorithm:split[0]?.split_algorithm||null,engine:split[0]?.engine_version||null,source_sha256:provenance.sha256};changed();
      $('split-status').textContent = `${split.length.toLocaleString()} rows; train ${counts.train || 0}, validation ${counts.validation || 0}, test ${counts.test || 0}; all IDs assigned once.`;
      document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = !verified; });
    } catch (error) {
      if (revision !== splitRevision) return;
      $('split-status').textContent = error.message;
      document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = true; });
    }
  }

  function wire(restore=true) {
    if(restore)restoreQuery();
    $('sql-query').addEventListener('input', () => {
      queryRevision++;
      queryReady = false;
      clearResults('Query changed. Run query for current results.');
      $('sql-export-status').textContent = '';
      saveQuery();changed();
    });
    $('split-seed').addEventListener('input', () => {
      splitRevision++;
      splitReady = false;
      splitSeed = null;savedSplit=null;changed();
      document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = true; });
      $('split-status').textContent = 'Seed changed. Build split for current seed.';
    });
    $('sql-run').addEventListener('click', runQuery);
    document.querySelectorAll('[data-sql-preset]').forEach((button) => button.addEventListener('click', () => {
      $('sql-query').value = button.dataset.sqlPreset;
      $('sql-query').dispatchEvent(new Event('input', { bubbles: true }));
      runQuery();
    }));
    $('sql-cancel').addEventListener('click', () => failWorker('Query cancelled. The worker was stopped; run again to create a new worker.'));
    $('sql-retry').addEventListener('click', async () => {
      $('sql-status').textContent = 'Rechecking the snapshot manifest…';
      try { await fetchManifest(); } catch (error) { verified = false; setTrust(null, null); $('sql-status').textContent = error.message; }
    });
    $('split-run').addEventListener('click', makeSplit);
    document.querySelectorAll('[data-sql-export]').forEach((button) => button.addEventListener('click', async () => {
      const revision = queryRevision;
      const sql = lastSQL;
      try {
        const file = await request('export-query', { sql, format: button.dataset.sqlExport });
        if (revision === queryRevision && queryReady && $('sql-query').value === sql && lastSQL === sql) save(file, 'sql-export-status');
      } catch (error) {
        if (revision === queryRevision) $('sql-export-status').textContent = error.message;
      }
    }));
    document.querySelectorAll('[data-split-export]').forEach((button) => button.addEventListener('click', async () => {
      const revision = splitRevision;
      const seed = splitSeed;
      try {
        const file = await request('export-split', { seed, format: button.dataset.splitExport });
        if (revision === splitRevision && splitReady && $('split-seed').value === seed && splitSeed === seed) save(file, 'split-status');
      } catch (error) {
        if (revision === splitRevision) $('split-status').textContent = error.message;
      }
    }));
  }

  window.WarehouseSQL = {
    readCurrent(){return verified && new TextEncoder().encode($('sql-query').value).length<=4096 ? {sql:$('sql-query').value,seed:$('split-seed').value,source_sha256:provenance?.sha256,result:savedResult,split:savedSplit} : null;},
    setPrincipal(id,migratedFrom){const next=id?'issue_warehouse_query_v2:'+id:null;if(next===recoveryKey)return;const canMigrate=next&&migratedFrom&&recoveryKey==='issue_warehouse_query_v2:'+migratedFrom;const pending=$('sql-query').value;recoveryKey=next;if(canMigrate&&new TextEncoder().encode(pending).byteLength<=4096){try{sessionStorage.setItem(next,pending);}catch{$('sql-recovery-status').textContent='Account changed; tab recovery is unavailable. Copy your query before reloading.';}}if(next)restoreQuery();},
    importLegacy(){const text=sessionStorage.getItem(QUERY_KEY);if(text===null)throw Error('No retained legacy query in this tab.');if(new TextEncoder().encode(text).byteLength>4096)throw Error('Legacy query exceeds 4,096 bytes. Export it using browser storage tools.');$('sql-query').value=text;$('sql-query').dispatchEvent(new Event('input'));$('sql-recovery-status').textContent='Legacy query imported; not run. The original tab copy was retained.';},
    restore(value){if(!value||typeof value.sql!=='string'||new TextEncoder().encode(value.sql).length>4096||typeof value.seed!=='string'||value.seed.length>128)throw Error('Unsupported query or split seed.');this.reset();$('sql-query').value=value.sql;$('split-seed').value=value.seed;$('sql-recovery-status').textContent='Saved query and seed restored; not run.';saveQuery();changed();},
    reset() {
      queryRevision++; splitRevision++; lastSQL = ''; splitSeed = null;
      failWorker('Session cleared.'); if(!serverEnabled())discardSavedQuery();
      $('sql-query').value = ''; $('split-seed').value = 'warehouse-v1';
      $('sql-recovery-status').textContent = ''; $('sql-export-status').textContent = '';
      $('sql-engine').textContent = '';changed();
      document.querySelectorAll('[data-split-export]').forEach((b) => { b.disabled = true; });
    },
    isVerified() { return verified; },
    configure(snapshot, digest, decoded,{preserveInput=false}={}) {
      raw = snapshot; raw.__digest = digest; rows = decoded;if(!wired){wire(!preserveInput);wired=true;}
      return fetchManifest().catch((error) => { setTrust(null, null); $('sql-status').textContent = `${error.message} Trusted SQL and exports are disabled.`; });
    },
  };
})();

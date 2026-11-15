import * as duckdb from './vendor/duckdb-browser.mjs';

const COLUMNS = new Set(['repo', 'number', 'title', 'state', 'state_reason', 'created_at', 'closed_at', 'comments', 'sample', 'sources', 'words', 'labels']);
const FUNCTIONS = new Set(['+', '-', '*', '/', '//', '%', '=', '!=', '<>', '<', '<=', '>', '>=', 'and', 'or', 'not', 'is null', 'is not null', 'like', 'ilike', '~~', '!~~', '~~*', '!~~*', 'lower', 'upper', 'trim', 'length', 'coalesce', 'ifnull', 'nullif', 'count', 'count_star', 'sum', 'avg', 'min', 'max', 'round', 'abs']);
const AST_CLASSES = new Set(['CONSTANT', 'COLUMN_REF', 'FUNCTION', 'STAR', 'COMPARISON', 'CONJUNCTION', 'OPERATOR']);
const COMPARISONS = new Set(['COMPARE_EQUAL', 'COMPARE_NOTEQUAL', 'COMPARE_LESSTHAN', 'COMPARE_GREATERTHAN', 'COMPARE_LESSTHANOREQUALTO', 'COMPARE_GREATERTHANOREQUALTO', 'COMPARE_DISTINCT_FROM', 'COMPARE_NOT_DISTINCT_FROM', 'COMPARE_IN', 'COMPARE_NOT_IN', 'COMPARE_BETWEEN', 'COMPARE_LIKE', 'COMPARE_NOT_LIKE', 'COMPARE_ILIKE', 'COMPARE_NOT_ILIKE']);
const CONJUNCTIONS = new Set(['CONJUNCTION_AND', 'CONJUNCTION_OR']);
const OPERATORS = new Set(['OPERATOR_NOT', 'OPERATOR_IS_NULL', 'OPERATOR_IS_NOT_NULL']);
const MAX_SQL = 4096;
const MAX_NODES = 256;
const MAX_ROWS = 500;
const MAX_EXPORT_ROWS = 10000;
const MAX_BYTES = 1_000_000;
const PACKAGE_VERSION = duckdb.PACKAGE_VERSION;
let db;
let conn;
let initialising;
let exportDb;
let exportConn;
let exportInitialising;
let exportSerial = 0;
let issueRows;
let provenance;
let active = 0;

const sqlText = (value) => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const sqlValue = (value) => Array.isArray(value) ? `[${value.map(sqlText).join(',')}]` : typeof value === 'number' ? String(value) : sqlText(value);

async function init(rows, source) {
  if (conn) return;
  provenance = source;
  if (!initialising) initialising = (async () => {
    postMessage({ type: 'phase', phase: 'starting DuckDB-Wasm' });
    const base = new URL('./vendor/', self.location.href);
    const worker = new Worker(new URL('duckdb-browser-eh.worker.js', base));
    db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(new URL('duckdb-eh.wasm', base).href);
    await db.open({ path: ':memory:', maximumThreads: 1 });
    conn = await db.connect();
    postMessage({ type: 'phase', phase: 'disabling extension autoload and install' });
    for (const setting of [
      'SET autoinstall_known_extensions = false',
      'SET autoload_known_extensions = false',
      'SET allow_community_extensions = false',
      "SET memory_limit = '256MB'",
      'SET threads = 1',
    ]) await conn.query(setting);
    const extensionRepo = new URL('extensions/', base).href.replace(/\/$/, '');
    await conn.query(`SET custom_extension_repository = ${sqlText(extensionRepo)}`);
    for (const name of ['json']) {
      postMessage({ type: 'phase', phase: `loading local ${name} extension` });
      await conn.query(`INSTALL ${name}`);
      await conn.query(`LOAD ${name}`);
    }
    postMessage({ type: 'phase', phase: 'disabling external access' });
    await conn.query('SET enable_external_access = false');
    await conn.query('CREATE TABLE issues (repo VARCHAR, number INTEGER, title VARCHAR, state VARCHAR, state_reason VARCHAR, created_at VARCHAR, closed_at VARCHAR, comments INTEGER, sample VARCHAR, sources UTINYINT, words UTINYINT, labels VARCHAR[])');
    postMessage({ type: 'phase', phase: 'loading verified snapshot rows' });
    const fields = ['repo', 'number', 'title', 'state', 'state_reason', 'created_at', 'closed_at', 'comments', 'sample', 'sources', 'words', 'labels'];
    const tuples = rows.map((r) => `(${fields.map((k) => sqlValue(r[k])).join(',')})`);
    for (let i = 0; i < tuples.length; i += 100) await conn.query(`INSERT INTO issues VALUES ${tuples.slice(i, i + 100).join(',')}`);
    issueRows = rows;
    postMessage({ type: 'ready', version: await version() });
  })();
  return initialising;
}

async function version() {
  try {
    const result = await conn.query('SELECT version() AS version');
    return result.toArray()[0].version;
  } catch { return PACKAGE_VERSION; }
}

async function initExportDB() {
  if (exportConn) return;
  if (!exportInitialising) exportInitialising = (async () => {
    const base = new URL('./vendor/', self.location.href);
    const worker = new Worker(new URL('duckdb-browser-eh.worker.js', base));
    exportDb = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await exportDb.instantiate(new URL('duckdb-eh.wasm', base).href);
    await exportDb.open({ path: ':memory:', maximumThreads: 1 });
    exportConn = await exportDb.connect();
    for (const setting of [
      'SET autoinstall_known_extensions = false', 'SET autoload_known_extensions = false',
      'SET allow_community_extensions = false', "SET memory_limit = '256MB'", 'SET threads = 1',
    ]) await exportConn.query(setting);
    const repo = new URL('extensions/', base).href.replace(/\/$/, '');
    await exportConn.query(`SET custom_extension_repository = ${sqlText(repo)}`);
    await exportConn.query('INSTALL parquet');
    await exportConn.query('LOAD parquet');
  })().catch((error) => { exportDb = null; exportConn = null; exportInitialising = null; throw error; });
  return exportInitialising;
}

async function cleanupParquetArtifacts(dbHandle, connHandle, exportPath, dropFile, discard) {
  let cleanupError;
  if (dropFile) {
    try { await dbHandle.dropFile(exportPath); } catch (error) { cleanupError = error; }
  }
  try { await connHandle.query('DROP TABLE IF EXISTS warehouse_export_rows'); }
  catch (error) { cleanupError ||= error; }
  if (cleanupError) {
    await discard();
    throw new Error('Parquet export cleanup failed; the export engine was reset.', { cause: cleanupError });
  }
}

async function discardExportDB() {
  const abandoned = exportDb;
  exportDb = null;
  exportConn = null;
  exportInitialising = null;
  if (abandoned) {
    try { await abandoned.terminate(); } catch {}
  }
}

function parquetType(type) {
  const types = { Int8: 'TINYINT', Int16: 'SMALLINT', Int32: 'INTEGER', Int64: 'BIGINT',
    Uint8: 'UTINYINT', Uint16: 'USMALLINT', Uint32: 'UINTEGER', Uint64: 'UBIGINT',
    Float32: 'FLOAT', Float64: 'DOUBLE', Bool: 'BOOLEAN', Utf8: 'VARCHAR', Utf8View: 'VARCHAR',
    Null: 'VARCHAR', 'List<Utf8>': 'VARCHAR[]', 'List<Utf8View>': 'VARCHAR[]' };
  if (!types[type]) throw new Error(`Parquet cannot preserve the result type ${type}.`);
  return types[type];
}

function validateAst(serialized) {
  if (serialized.error || !Array.isArray(serialized.statements) || serialized.statements.length !== 1) throw new Error('Enter exactly one SELECT statement.');
  const root = serialized.statements[0]?.node;
  if (!root || root.type !== 'SELECT_NODE') throw new Error('Only a SELECT query is supported.');
  if ((root.cte_map?.map || []).length || root.qualify || root.sample) throw new Error('CTEs, QUALIFY and sampling are outside the supported query grammar.');
  if (root.from_table?.type !== 'BASE_TABLE' || String(root.from_table.table_name).toLowerCase() !== 'issues') throw new Error('Read only from the public `issues` projection.');
  const selectAliases = new Set((root.select_list || []).map((item) => String(item.alias || '').toLowerCase()).filter(Boolean));
  let nodes = 0;
  const walk = (value, depth = 0, parentFn = '') => {
    if (depth > 20 || ++nodes > MAX_NODES) throw new Error('Query AST is too complex.');
    if (Array.isArray(value)) { for (const child of value) walk(child, depth + 1, parentFn); return; }
    if (!value || typeof value !== 'object') return;
    if (value.class && !AST_CLASSES.has(value.class)) throw new Error(`AST expression is not supported: ${value.class}.`);
    if (value.class === 'COMPARISON' && !COMPARISONS.has(value.type)) throw new Error('Comparison is outside the supported SQL grammar.');
    if (value.class === 'CONJUNCTION' && !CONJUNCTIONS.has(value.type)) throw new Error('Conjunction is outside the supported SQL grammar.');
    if (value.class === 'OPERATOR' && !OPERATORS.has(value.type)) throw new Error('Operator is outside the supported SQL grammar.');
    if (value.class === 'COLUMN_REF') {
      const names = value.column_names || [];
      const column = String(names.at(-1) || '').toLowerCase();
      const sourceColumn = COLUMNS.has(column) && names.length <= 2 && (names.length === 1 || String(names[0]).toLowerCase() === 'issues');
      const selectedAlias = names.length === 1 && selectAliases.has(column);
      if (!sourceColumn && !selectedAlias) throw new Error(`Column is outside the public projection: ${column || '(unknown)'}.`);
    }
    if (value.class === 'FUNCTION') {
      const fn = String(value.function_name).toLowerCase();
      if (!FUNCTIONS.has(fn)) throw new Error(`Function is not allowed: ${fn}.`);
      parentFn = fn;
    }
    if (value.class === 'STAR' && parentFn !== 'count' && parentFn !== 'count_star') throw new Error('Use named projection columns.');
    for (const [key, child] of Object.entries(value)) {
      if (['query_location', 'alias', 'type', 'class', 'function_name', 'column_names', 'value', 'is_null'].includes(key)) continue;
      if (key === 'from_table' && child !== root.from_table) throw new Error('Subqueries, joins and table functions are not supported.');
      walk(child, depth + 1, parentFn);
    }
  };
  walk(root);
  if (!Array.isArray(root.select_list) || !root.select_list.length) throw new Error('Select at least one named column or expression.');
}

function valueOf(v) {
  if (typeof v === 'bigint') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(valueOf);
  if (v instanceof Uint8Array) return Array.from(v);
  if (v && typeof v === 'object') {
    if (typeof v[Symbol.iterator] === 'function') return Array.from(v, valueOf);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valueOf(x)]));
  }
  return v;
}

function valueContainsNonFinite(value) {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(valueContainsNonFinite);
  if (value && typeof value === 'object') return Object.values(value).some(valueContainsNonFinite);
  return false;
}

async function query(sql) {
  if (typeof sql !== 'string' || new TextEncoder().encode(sql).length > MAX_SQL || !sql.trim()) throw new Error('Query must be 1–4,096 UTF-8 bytes.');
  const parsed = await conn.query(`SELECT json_serialize_sql(${sqlText(sql)}, skip_default := true, skip_null := true) AS ast`);
  const ast = JSON.parse(parsed.toArray()[0].ast);
  validateAst(ast);
  const canonicalResult = await conn.query(`SELECT json_deserialize_sql(${sqlText(JSON.stringify(ast))}) AS sql`);
  const canonicalSQL = canonicalResult.toArray()[0].sql;
  const result = await conn.query(`SELECT * FROM (${canonicalSQL}) AS user_result LIMIT ${MAX_ROWS + 1}`);
  const fields = result.schema.fields.map((f) => f.name);
  const types = result.schema.fields.map((f) => f.type.toString());
  const rows = result.toArray().map((row) => fields.map((f) => {
    const value = row[f];
    if (Array.isArray(value)) return value.map(valueOf);
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Uint8Array) && typeof value[Symbol.iterator] === 'function') return Array.from(value, valueOf);
    return valueOf(value);
  }));
  if (rows.some((row) => row.some(valueContainsNonFinite))) throw new Error('Query returned NaN or Infinity. Adjust numeric expressions to return finite values before displaying or exporting.');
  if (rows.length > MAX_ROWS) throw new Error(`Result exceeds ${MAX_ROWS} rows. Add a smaller LIMIT.`);
  const output = { fields, types, rows, version: await version(), canonicalSQL };
  if (new TextEncoder().encode(JSON.stringify(output)).length > MAX_BYTES) throw new Error('Result exceeds the 1 MB output limit.');
  return output;
}

async function split(seed) {
  if (typeof seed !== 'string' || new TextEncoder().encode(seed).length > 128) throw new Error('Seed must be at most 128 UTF-8 bytes.');
  const items = await Promise.all(issueRows.map(async (row) => {
    const id = `${row.repo}#${row.number}`;
    const bytes = new TextEncoder().encode(`${seed}\0${id}`);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hex = [...hash].map((x) => x.toString(16).padStart(2, '0')).join('');
    return { hex, id, row };
  }));
  items.sort((a, b) => a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const train = Math.floor(items.length * 0.8);
  const validation = Math.floor(items.length * 0.1);
  const engine = await version();
  return items.map((item, index) => ({
    id: item.id, repo: item.row.repo, number: item.row.number, title: item.row.title, state: item.row.state,
    sample: item.row.sample, sources: item.row.sources, words: item.row.words,
    split: index < train ? 'train' : index < train + validation ? 'validation' : 'test',
    split_seed: seed, split_algorithm: 'sha256(seed-utf8 || 0x00 || stable-issue-id); sort digest then id; v1',
    split_train_ratio: 0.8, split_validation_ratio: 0.1, split_test_ratio: 0.1,
    snapshot_sha256: provenance.sha256, snapshot_collected_at: provenance.collected_at, engine_version: engine,
  }));
}

function csvSafeText(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) || /^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = `'${s}`;
  return s;
}

function csvValueText(value) {
  const text = value && typeof value === 'object' ? JSON.stringify(value) : value;
  return csvSafeText(text);
}

function csvCell(value) {
  const s = csvValueText(value);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

async function exportRows(fields, rows, format, types = fields.map((_, i) => Number.isInteger(rows[0]?.[i]) ? 'Int32' : typeof rows[0]?.[i] === 'number' ? 'Float64' : 'Utf8'), metadata = {}) {
  if (rows.length > MAX_EXPORT_ROWS) throw new Error(`Export exceeds ${MAX_EXPORT_ROWS} rows.`);
  let bytes;
  if (format === 'csv') {
    const text = [[...fields.map((f, i) => `${f} ${types[i] || 'VARCHAR'}`)].map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
    bytes = new TextEncoder().encode(text);
    if (format === 'csv') {
      const reread = parseCsv(text);
      const expected = rows.map((r) => r.map(csvValueText));
      if (JSON.stringify(reread.slice(1)) !== JSON.stringify(expected)) throw new Error('CSV readback mismatch.');
    }
  } else if (format === 'jsonl') {
    const header = { _meta: { format_version: 1, schema: fields.map((name, i) => ({ name, type: types[i] || 'VARCHAR' })), row_count: rows.length, snapshot_sha256: provenance.sha256, snapshot_collected_at: provenance.collected_at, engine_version: await version(), ...metadata } };
    const text = [JSON.stringify(header), ...rows.map((r) => JSON.stringify(Object.fromEntries(fields.map((f, i) => [f, r[i]]))))].join('\n') + '\n';
    bytes = new TextEncoder().encode(text);
    const reread = text.trimEnd().split('\n').slice(1).map((line) => JSON.parse(line));
    if (JSON.stringify(reread.map((o) => fields.map((f) => o[f]))) !== JSON.stringify(rows)) throw new Error('JSONL readback mismatch.');
  } else if (format === 'parquet') {
    if (new Set(fields).size !== fields.length) throw new Error('Parquet requires unique output column names.');
    await initExportDB();
    const exportPath = `/warehouse-export-${++exportSerial}.parquet`;
    let copyAttempted = false;
    try {
      const names = fields.map((_, i) => `c${i}`);
      const columnTypes = fields.map((_, i) => parquetType(types[i] || (Number.isSafeInteger(rows[0]?.[i]) ? 'Int32' : 'Utf8')));
      await exportConn.query(`CREATE OR REPLACE TEMP TABLE warehouse_export_rows (_ord INTEGER, ${names.map((n, i) => `${n} ${columnTypes[i]}`).join(',')})`);
      for (let i = 0; i < rows.length; i += 100) {
        const values = rows.slice(i, i + 100).map((r, offset) => `(${i + offset},${r.map(sqlValue).join(',')})`).join(',');
        await exportConn.query(`INSERT INTO warehouse_export_rows VALUES ${values}`);
      }
      const projection = fields.map((f, i) => `${names[i]} AS "${f.replaceAll('"', '""')}"`).join(',');
      copyAttempted = true;
      await exportConn.query(`COPY (SELECT ${projection} FROM warehouse_export_rows ORDER BY _ord) TO ${sqlText(exportPath)} (FORMAT PARQUET, COMPRESSION UNCOMPRESSED)`);
      const reread = await exportConn.query(`SELECT * FROM read_parquet(${sqlText(exportPath)})`);
      const check = reread.toArray().map((row) => reread.schema.fields.map((f) => valueOf(row[f.name])));
      if (JSON.stringify(check) !== JSON.stringify(rows)) throw new Error('Parquet readback mismatch.');
      bytes = await exportDb.copyFileToBuffer(exportPath);
    } finally {
      await cleanupParquetArtifacts(exportDb, exportConn, exportPath, copyAttempted, discardExportDB);
    }
  } else throw new Error('Unsupported export format.');
  if (bytes.length > 8_000_000) throw new Error('Export exceeds the 8 MB limit.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { bytes, hash, rows: rows.length, filename: `issue-warehouse.${format}` };
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ',') { row.push(cell); cell = ''; }
    else if (!quoted && ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  return rows;
}

self.onmessage = async ({ data }) => {
  const id = data.id;
  if (data.type === 'init') {
    try { await init(data.rows, data.provenance); } catch (error) { postMessage({ id, type: 'error', error: error.message || String(error) }); }
    return;
  }
  const ticket = ++active;
  try {
    await init(issueRows || data.rows, data.provenance);
    let result;
    if (data.type === 'query') result = await query(data.sql);
    else if (data.type === 'split') result = await split(data.seed);
    else if (data.type === 'export-query') {
      const output = await query(data.sql);
      result = await exportRows(output.fields, output.rows, data.format, output.types);
    } else if (data.type === 'export-split') {
      const rows = await split(data.seed);
      const fields = Object.keys(rows[0] || { id: '', split: '' });
      result = await exportRows(fields, rows.map((r) => fields.map((f) => r[f])), data.format, undefined, {
        split_seed: data.seed, split_algorithm: rows[0]?.split_algorithm, split_ratios: { train: 0.8, validation: 0.1, test: 0.1 },
      });
    } else throw new Error('Unknown SQL workbench operation.');
    if (ticket === active) postMessage({ id, type: 'result', result });
  } catch (error) {
    postMessage({ id, type: 'error', error: error.message || String(error) });
  }
};

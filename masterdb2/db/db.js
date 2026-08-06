/**
 * masterdb2/db/db.js — database lifecycle and access
 *
 * Singleton module: one sql.js Database in memory, one storage backend (fsa-store
 * today; graph-store when IT grants the app registration — change the import line
 * at the top, nothing else). All screens and the import pipeline use this module;
 * none of them import fsa-store directly.
 *
 * Startup sequence
 *   1. await loadSql(initSqlJs, wasmPath)    load + compile WASM once
 *   2. await tryConnect()                    restore last folder (null = needs picker)
 *      OR (inside click handler):
 *      await connectWithPicker()             show folder picker, then open DB
 *   3. Reads:  query(sql, params) / scalar(sql, params) / getDb()
 *      Writes: run(sql, params)  then  await save(writerName)
 *              or  await transaction(fn)  then  await save(writerName)
 */

// ── Storage backend (swap this line to switch to graph-store) ─────────────────
import { pickStore, recallStore, StoreConcurrencyError, StoreLockError, StoreFileNotFoundError } from './fsa-store.js'
export { StoreConcurrencyError, StoreLockError, StoreFileNotFoundError }

// ── Module state ──────────────────────────────────────────────────────────────

let _SQL   = null   // sql.js constructor, set by loadSql()
let _store = null   // storage backend instance
let _db    = null   // in-memory sql.js Database
let _seq   = 0      // save_seq at last open() or save()

// ── Boot ──────────────────────────────────────────────────────────────────────

/**
 * Compile the sql.js WASM. Call once at app startup, before any connect call.
 *
 * initSqlJs : the function from sql-wasm.js (pass window.initSqlJs if loaded
 *             via a <script> tag, or import and pass it directly).
 * wasmPath  : URL to sql-wasm.wasm, relative to the serving document.
 */
export async function loadSql(initSqlJs, wasmPath = '../masterdb/vendor/sql-wasm.wasm') {
  if (_SQL) return
  _SQL = await initSqlJs({ locateFile: () => wasmPath })
}

// ── Connect ───────────────────────────────────────────────────────────────────

async function _doConnect(store) {
  _store = store
  const conflicts = await store.checkConflictCopies()
  const { db, saveSeq, lastWriter, savedAt } = await store.open(_SQL)
  _db  = db
  _seq = saveSeq
  return { saveSeq, lastWriter, savedAt, conflicts }
}

/**
 * Try to restore the previously-chosen OneDrive folder from IndexedDB, then
 * open the database. Returns { saveSeq, lastWriter, savedAt, conflicts } on
 * success, or null if no stored handle exists or the permission prompt was
 * dismissed. A null return means the UI should show the folder-picker button.
 */
export async function tryConnect() {
  if (!_SQL) throw new Error('call loadSql() before connecting')
  const store = await recallStore()
  if (!store) return null
  return _doConnect(store)
}

/**
 * Show the File System Access folder picker, then open the database.
 * Must be invoked from inside a user-gesture event handler (e.g. button click).
 * Returns { saveSeq, lastWriter, savedAt, conflicts }.
 */
export async function connectWithPicker() {
  if (!_SQL) throw new Error('call loadSql() before connecting')
  return _doConnect(await pickStore())
}

export function isOpen() { return !!_db }

// ── Query helpers ─────────────────────────────────────────────────────────────

function _assertOpen() {
  if (!_db) throw new Error('Database is not open')
}

/** The raw sql.js Database instance — for complex queries or prepared statements. */
export function getDb() { _assertOpen(); return _db }

/**
 * Run a SELECT and return an array of plain row objects.
 * params: positional array or object for named parameters.
 */
export function query(sql, params = []) {
  _assertOpen()
  const result = _db.exec(sql, params)
  if (!result.length) return []
  const { columns, values } = result[0]
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])))
}

/** Run a single-value query (COUNT, MAX, etc.). Returns null if no rows. */
export function scalar(sql, params = []) {
  _assertOpen()
  return _db.exec(sql, params)[0]?.values[0]?.[0] ?? null
}

/** Run a DML statement (INSERT / UPDATE / DELETE). */
export function run(sql, params = []) {
  _assertOpen()
  _db.run(sql, params)
}

/**
 * Execute fn() inside BEGIN / COMMIT. Any throw rolls back and re-throws.
 * fn may be async — sql.js is single-threaded in-memory so the transaction
 * is safe to hold open across microtask boundaries.
 */
export async function transaction(fn) {
  _assertOpen()
  _db.run('BEGIN')
  try {
    const result = await fn()
    _db.run('COMMIT')
    return result
  } catch (e) {
    try { _db.run('ROLLBACK') } catch { /* already rolled back */ }
    throw e
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

/**
 * Write the in-memory DB back to disk. Updates the internal save_seq.
 * Throws StoreConcurrencyError if another session wrote first — caller should
 * prompt the user to reload without saving.
 * Returns the new save_seq.
 */
export async function save(writerName) {
  if (!_store || !_db) throw new Error('Database is not open')
  _seq = await _store.save(_db, _seq, writerName)
  return _seq
}

/**
 * Copy the current on-disk DB to db/backups/ as a pre-import snapshot, before
 * the import transaction touches the in-memory DB.
 * Returns the backup filename. The import transaction should INSERT a backup_log
 * row with this filename inside its own transaction.
 */
export async function snapshotForImport(packetId) {
  if (!_store) throw new Error('Database is not open')
  const safe     = String(packetId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const stamp    = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `masterdb-${stamp}-pre-${safe}.sqlite`
  await _store.copy(['db', 'masterdb.sqlite'], ['db', 'backups', filename])
  return filename
}

// ── Lock delegation ───────────────────────────────────────────────────────────

export const claimLock   = (writerName) => { _assertOpen(); return _store.claimLock(writerName) }
export const releaseLock = (writerName) => { _assertOpen(); return _store.releaseLock(writerName) }

/**
 * Read the current lock state (for the dashboard "locked by" banner).
 * Returns null if unlocked, or { owner, claimedAt, stale } if a lock file exists.
 */
export const readLock = () => { _assertOpen(); return _store.readLock() }

// ── Packet + file I/O ─────────────────────────────────────────────────────────

/** List a tech's inbox. Returns [{ name, size, lastModified }]. */
export const listInbox = (techFolder) => {
  _assertOpen(); return _store.list(['techs', techFolder, 'inbox'])
}

/** Read and JSON-parse a packet file from a tech's inbox. */
export async function readPacket(techFolder, filename) {
  _assertOpen()
  const bytes = await _store.readFile(['techs', techFolder, 'inbox', filename])
  return JSON.parse(new TextDecoder().decode(bytes))
}

/**
 * Write a packet JSON to a tech's outbox (called by the packet-generation screen).
 * TechTool picks it up from the locally-synced folder.
 */
export async function writePacket(techFolder, filename, packetObj) {
  _assertOpen()
  const bytes = new TextEncoder().encode(JSON.stringify(packetObj, null, 2))
  await _store.writeFile(['techs', techFolder, 'outbox', filename], bytes)
}

/** Move an imported packet from inbox → archive. */
export const archivePacket = (techFolder, filename) => {
  _assertOpen()
  return _store.move(
    ['techs', techFolder, 'inbox',   filename],
    ['techs', techFolder, 'archive', filename]
  )
}

/** List backup snapshots in db/backups/. Returns [{ name, size, lastModified }]. */
export const listBackups = () => { _assertOpen(); return _store.list(['db', 'backups']) }

/** Scan for OneDrive conflict copies of masterdb.sqlite and return their filenames. */
export const checkConflictCopies = () => { _assertOpen(); return _store.checkConflictCopies() }

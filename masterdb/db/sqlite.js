/**
 * sql.js wrapper with OPFS persistence.
 *
 * sql.js is loaded as a global (initSqlJs) from the CDN script tag in index.html.
 * The SQLite database file is persisted to the browser's Origin Private File System.
 *
 * Usage:
 *   import { initDB, query, run, getDB } from './db/sqlite.js'
 *   await initDB()
 *   const rows = query('SELECT * FROM companies WHERE active = 1')
 *   run('INSERT INTO companies (name, province) VALUES (?, ?)', ['Acme', 'AB'])
 */


import { TimeService } from '../../shared/time-utils.js'

const OPFS_FILENAME = 'masterdb.sqlite'

let _db   = null
let _SQL  = null
let _saving = false

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initDB() {
  if (_db) return _db

  if (typeof initSqlJs === 'undefined') {
    throw new Error('sql.js not loaded. Check the CDN script tag in index.html.')
  }

  _SQL = await initSqlJs({
    locateFile: f => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${f}`
  })

  const existing = await loadFromOPFS()
  _db = existing ? new _SQL.Database(existing) : new _SQL.Database()

  return _db
}

export function getDB() {
  if (!_db) throw new Error('DB not initialized. Call initDB() first.')
  return _db
}

function sanitize(params) {
  return params.map(v =>
    v === undefined || (typeof v === 'number' && isNaN(v)) ? null : v
  )
}

/**
 * Run a SELECT and return all rows as plain objects.
 */
export function query(sql, params = []) {
  const db   = getDB()
  const stmt = db.prepare(sql)
  stmt.bind(sanitize(params))
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

export function queryOne(sql, params = []) {
  const rows = query(sql, params)
  return rows.length > 0 ? rows[0] : null
}

export function run(sql, params = []) {
  getDB().run(sql, sanitize(params))
  scheduleSave()
}
/**
 * Execute multiple statements in a transaction.
 * @param {function} fn — receives { query, run } and executes statements
 */
export function transaction(fn) {
  const db = getDB()
  db.run('BEGIN')
  try {
    fn({ query, run: (sql, params) => db.run(sql, sanitize(params ?? [])) })
    db.run('COMMIT')
    scheduleSave()
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}

/**
 * Return the last inserted row ID.
 */
export function lastInsertId() {
  const row = queryOne('SELECT last_insert_rowid() AS id')
  return row?.id ?? null
}

// ---------------------------------------------------------------------------
// OPFS persistence
// ---------------------------------------------------------------------------

function scheduleSave() {
  if (_saving) return
  _saving = true
  // Debounce — save at most once per animation frame batch
  setTimeout(async () => {
    try {
      await saveToOPFS()
    } catch (e) {
      console.error('OPFS save failed:', e)
    } finally {
      _saving = false
    }
  }, 100)
}

export async function saveToOPFS() {
  const data = getDB().export()
  const root = await navigator.storage.getDirectory()
  const fh   = await root.getFileHandle(OPFS_FILENAME, { create: true })
  const w    = await fh.createWritable()
  await w.write(data)
  await w.close()
}

async function loadFromOPFS() {
  try {
    const root = await navigator.storage.getDirectory()
    const fh   = await root.getFileHandle(OPFS_FILENAME)
    const file = await fh.getFile()
    return new Uint8Array(await file.arrayBuffer())
  } catch {
    return null   // file doesn't exist yet — fresh database
  }
}

/**
 * Export the database as a downloadable file (backup).
 */
export function exportDB() {
  const data = getDB().export()
  const blob = new Blob([data], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `masterdb-backup-${new Date().toISOString().slice(0, 10)}.sqlite`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Automatically backup the database to the provided FileSystemDirectoryHandle.
 * Creates a 'backups' folder if it doesn't exist.
 */
export async function backupToSyncFolder(dirHandle) {
  if (!dirHandle) return

  try {
    const data = getDB().export()
    const backupDir = await dirHandle.getDirectoryHandle('backups', { create: true })
    
    // Use an ISO-like filename that is filesystem-safe
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename  = `masterdb-autobackup-${timestamp}.sqlite`
    
    const fh = await backupDir.getFileHandle(filename, { create: true })
    const w  = await fh.createWritable()
    await w.write(data)
    await w.close()
    
    console.log('Auto-backup completed:', filename)

    // Optional: cleanup old backups (keep only last 20)
    await cleanupOldBackups(backupDir)
  } catch (err) {
    console.error('Auto-backup failed:', err)
  }
}

/**
 * Automatically export key tables to a multi-sheet XLSX file in the sync folder.
 */
export async function exportExcelToSyncFolder(dirHandle) {
  if (!dirHandle || typeof XLSX === 'undefined') return

  try {
    const excelDir = await dirHandle.getDirectoryHandle('excel', { create: true })
    
    // 1. Gather data
    const data = {
      'Companies': query('SELECT * FROM companies'),
      'Employees': query('SELECT * FROM employees'),
      'Tests':     query('SELECT * FROM tests'),
      'Baselines': query('SELECT * FROM baselines')
    }
    
    // 2. Create workbook
    const wb = XLSX.utils.book_new()
    for (const [sheetName, rows] of Object.entries(data)) {
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    }
    
    // 3. Write to array buffer
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    
    // 4. Save to sync folder
    const filename = `masterdb-data-export.xlsx`
    const fh = await excelDir.getFileHandle(filename, { create: true })
    const w  = await fh.createWritable()
    await w.write(buf)
    await w.close()
    
    console.log('Auto-excel export completed:', filename)
  } catch (err) {
    console.error('Auto-excel export failed:', err)
  }
}

async function cleanupOldBackups(backupDir) {
  try {
    const files = []
    for await (const entry of backupDir.values()) {
      if (entry.kind === 'file' && entry.name.startsWith('masterdb-autobackup-')) {
        files.push(entry)
      }
    }

    // Sort by name (which includes timestamp)
    files.sort((a, b) => a.name.localeCompare(b.name))

    // If more than 20, delete oldest
    if (files.length > 20) {
      const toDelete = files.slice(0, files.length - 20)
      for (const entry of toDelete) {
        await backupDir.removeEntry(entry.name)
      }
    }
  } catch (e) {
    console.warn('Backup cleanup failed:', e)
  }
}

/**
 * Records a user action into the system_log table.
 */
export function logAction(state, action, details = "") {
  if (!state.user) return;
  
  const timestamp = TimeService.getTimestamp();
  const timezone = TimeService.getTimezone();

  try {
    run(`INSERT INTO system_log (log_id, user_id, user_name, action, details, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [self.crypto.randomUUID(), state.user.user_id, state.user.name, action, `${details} (${timezone})`, timestamp]);
  } catch (e) {
    console.warn("Audit logging failed:", e);
  }
}

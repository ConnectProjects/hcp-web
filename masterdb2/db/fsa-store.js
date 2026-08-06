/**
 * masterdb2/db/fsa-store.js — File System Access API storage backend
 *
 * Implements the swappable storage interface for MasterDB v2.
 * graph-store (future) will implement the same surface area via Graph API + eTag/If-Match.
 *
 * Interface
 *   open(SQL)                        → { db, saveSeq, lastWriter, savedAt }
 *   save(db, loadedSaveSeq, writer)  → newSaveSeq
 *   claimLock(writerName)            → { owner, claimedAt }   (starts heartbeat)
 *   releaseLock(writerName)          → void                   (stops heartbeat, removes lock)
 *   readLock()                       → null | { owner, claimedAt, stale }
 *   copy(srcPath, destPath)          → void
 *   move(srcPath, destPath)          → void
 *   list(dirPath)                    → [{ name, kind, size?, lastModified? }]
 *   checkConflictCopies()            → [filename, ...]
 *
 * Paths are arrays of string segments relative to the root directory handle:
 *   ['db', 'masterdb.sqlite']
 *   ['db', 'backups', 'masterdb-2026-08-06T12:00:00Z-pre-abc123.sqlite']
 *   ['techs', 'Norman', 'inbox', 'packet.json']
 *
 * Concurrency model (advisory, sound with 1-2 office users):
 *   1. write.lock.json heartbeated lock — stale after 5 min; other sessions read-only
 *   2. save_seq optimistic check — re-reads on-disk DB before overwriting; refuses if seq advanced
 *   3. checkConflictCopies() watchdog — surfaces any OneDrive conflict copies of masterdb.sqlite
 */

const DB_PATH       = ['db', 'masterdb.sqlite']
const LOCK_PATH     = ['db', 'write.lock.json']
const LOCK_STALE_MS = 5 * 60 * 1000   // advisory lock goes stale after 5 minutes
const HEARTBEAT_MS  = 60 * 1000        // heartbeat interval

// ── Custom errors ─────────────────────────────────────────────────────────────

export class StoreConcurrencyError extends Error {
  constructor(msg) { super(msg); this.name = 'StoreConcurrencyError' }
}

// owner and since are set for the UI banner ("locked by Heather since 10:12")
export class StoreLockError extends Error {
  constructor(msg, owner, since) {
    super(msg); this.name = 'StoreLockError'
    this.owner = owner; this.since = since
  }
}

export class StoreFileNotFoundError extends Error {
  constructor(msg) { super(msg); this.name = 'StoreFileNotFoundError' }
}

// ── Root-handle persistence (IndexedDB) ───────────────────────────────────────
// FileSystemDirectoryHandle objects survive serialization into IDB, so we store
// the root handle here and restore it on the next session.

const IDB_NAME    = 'masterdb2-fsa'
const IDB_STORE   = 'handles'
const IDB_ROOT_KEY = 'root'

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

export async function saveRootHandle(handle) {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx  = idb.transaction(IDB_STORE, 'readwrite')
    const req = tx.objectStore(IDB_STORE).put(handle, IDB_ROOT_KEY)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  })
}

export async function loadRootHandle() {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx  = idb.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(IDB_ROOT_KEY)
    req.onsuccess = e => resolve(e.target.result ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}

/**
 * Query and (if needed) request readwrite permission on a persisted handle.
 * Returns true if 'granted', false if 'denied' or 'prompt' was dismissed.
 */
export async function verifyPermission(handle) {
  if (!handle) return false
  const opts = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

// ── FsaStore ─────────────────────────────────────────────────────────────────

export class FsaStore {
  #root
  #SQL = null              // set on first open(); needed for save()'s on-disk seq check
  #heartbeatTimer = null   // setInterval handle for lock heartbeat

  constructor(root) {
    this.#root = root
  }

  // ── Path helpers ────────────────────────────────────────────────────────────

  // Navigate to (and optionally create) a chain of subdirectories.
  // Returns the deepest DirectoryHandle.
  async #navigate(dirSegments, { create = false } = {}) {
    let dir = this.#root
    for (const seg of dirSegments) {
      try {
        dir = await dir.getDirectoryHandle(seg, { create })
      } catch {
        throw new StoreFileNotFoundError(`Directory not found: ${seg}`)
      }
    }
    return dir
  }

  async #readBytes(pathSegments) {
    const dir  = await this.#navigate(pathSegments.slice(0, -1))
    const name = pathSegments.at(-1)
    let fh
    try { fh = await dir.getFileHandle(name) }
    catch { throw new StoreFileNotFoundError(`File not found: ${name}`) }
    return new Uint8Array(await (await fh.getFile()).arrayBuffer())
  }

  async #writeBytes(pathSegments, data) {
    const dir  = await this.#navigate(pathSegments.slice(0, -1), { create: true })
    const name = pathSegments.at(-1)
    const fh   = await dir.getFileHandle(name, { create: true })
    const w    = await fh.createWritable()
    await w.write(data)   // Uint8Array is a valid BufferSource
    await w.close()
  }

  async #deleteEntry(pathSegments) {
    const dir = await this.#navigate(pathSegments.slice(0, -1))
    await dir.removeEntry(pathSegments.at(-1))
  }

  async #readJson(pathSegments) {
    return JSON.parse(new TextDecoder().decode(await this.#readBytes(pathSegments)))
  }

  async #writeJson(pathSegments, obj) {
    await this.#writeBytes(pathSegments, new TextEncoder().encode(JSON.stringify(obj, null, 2)))
  }

  // ── Public interface ────────────────────────────────────────────────────────

  /**
   * Load masterdb.sqlite from disk into a sql.js Database.
   * Also stores the SQL constructor for use in save()'s on-disk seq check.
   * Returns { db, saveSeq, lastWriter, savedAt }.
   */
  async open(SQL) {
    this.#SQL = SQL
    const bytes = await this.#readBytes(DB_PATH)
    const db    = new SQL.Database(bytes)
    const rows  = db.exec('SELECT save_seq, last_writer, saved_at FROM meta WHERE id = 1')
    if (!rows.length || !rows[0].values.length) {
      return { db, saveSeq: 0, lastWriter: null, savedAt: null }
    }
    const [saveSeq, lastWriter, savedAt] = rows[0].values[0]
    return { db, saveSeq, lastWriter, savedAt }
  }

  /**
   * Write the in-memory sql.js DB back to disk.
   *
   * Before overwriting, re-reads the on-disk file's save_seq. If it has
   * advanced past loadedSaveSeq, another session wrote while we were working —
   * throws StoreConcurrencyError. Caller must prompt the user to reload.
   *
   * Returns the new save_seq on success.
   */
  async save(db, loadedSaveSeq, writerName) {
    if (!this.#SQL) throw new Error('call open() before save()')

    // Re-read the on-disk seq (the write.lock should make this a no-op in
    // normal operation; this guard catches stale-lock edge cases).
    let diskSeq = 0
    try {
      const diskDb = new this.#SQL.Database(await this.#readBytes(DB_PATH))
      const rows   = diskDb.exec('SELECT save_seq FROM meta WHERE id = 1')
      if (rows.length && rows[0].values.length) diskSeq = rows[0].values[0][0]
      diskDb.close()
    } catch (e) {
      if (!(e instanceof StoreFileNotFoundError)) throw e
      // DB doesn't exist yet (first-ever save) — proceed
    }

    if (diskSeq > loadedSaveSeq) {
      throw new StoreConcurrencyError(
        `Conflict: the database was saved by another session ` +
        `(on-disk seq ${diskSeq}, loaded seq ${loadedSaveSeq}). Reload required.`
      )
    }

    const newSeq = loadedSaveSeq + 1
    db.run(
      'UPDATE meta SET save_seq = ?, last_writer = ?, saved_at = ? WHERE id = 1',
      [newSeq, writerName, new Date().toISOString()]
    )

    await this.#writeBytes(DB_PATH, db.export())
    return newSeq
  }

  /**
   * Claim the advisory write lock.
   * Throws StoreLockError if another user holds a fresh lock (heartbeat < 5 min old).
   * If the existing lock belongs to writerName, it is refreshed without error.
   * Starts a heartbeat interval — call releaseLock() when the write session ends.
   * Returns { owner, claimedAt }.
   */
  async claimLock(writerName) {
    let existing = null
    try { existing = await this.#readJson(LOCK_PATH) } catch { /* no lock file = available */ }

    if (existing && existing.owner !== writerName) {
      const age = Date.now() - new Date(existing.heartbeat ?? existing.claimedAt).getTime()
      if (age < LOCK_STALE_MS) {
        throw new StoreLockError(
          `Write lock held by ${existing.owner} since ${existing.claimedAt}`,
          existing.owner,
          existing.claimedAt
        )
      }
    }

    const lock = {
      owner:     writerName,
      claimedAt: existing?.owner === writerName ? existing.claimedAt : new Date().toISOString(),
      heartbeat: new Date().toISOString()
    }
    await this.#writeJson(LOCK_PATH, lock)

    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer)
    this.#heartbeatTimer = setInterval(async () => {
      try {
        const current = await this.#readJson(LOCK_PATH)
        if (current?.owner === writerName) {
          await this.#writeJson(LOCK_PATH, { ...current, heartbeat: new Date().toISOString() })
        }
      } catch { /* lock file gone — stop quietly */ }
    }, HEARTBEAT_MS)

    return { owner: lock.owner, claimedAt: lock.claimedAt }
  }

  /**
   * Stop the heartbeat and delete the lock file (only if we own it).
   * Safe to call even if the lock was already released or never claimed.
   */
  async releaseLock(writerName) {
    if (this.#heartbeatTimer) { clearInterval(this.#heartbeatTimer); this.#heartbeatTimer = null }
    try {
      const current = await this.#readJson(LOCK_PATH)
      if (current?.owner === writerName) await this.#deleteEntry(LOCK_PATH)
    } catch { /* already gone */ }
  }

  /**
   * Read the current lock state without claiming it.
   * Returns null if no lock file exists.
   * Returns { owner, claimedAt, stale } where stale=true means the lock is expired.
   */
  async readLock() {
    try {
      const lock = await this.#readJson(LOCK_PATH)
      const age  = Date.now() - new Date(lock.heartbeat ?? lock.claimedAt).getTime()
      return { owner: lock.owner, claimedAt: lock.claimedAt, stale: age >= LOCK_STALE_MS }
    } catch {
      return null
    }
  }

  /**
   * Copy a file from srcPath to destPath (both relative to root).
   * Creates intermediate directories in destPath as needed.
   * Used for pre-import snapshots: copy(['db','masterdb.sqlite'], ['db','backups','masterdb-<stamp>.sqlite'])
   */
  async copy(srcPath, destPath) {
    const bytes = await this.#readBytes(srcPath)
    await this.#writeBytes(destPath, bytes)
  }

  /**
   * Move a file (copy + delete source).
   * Used for packet archiving: move(['techs','Norman','inbox','x.json'], ['techs','Norman','archive','x.json'])
   */
  async move(srcPath, destPath) {
    await this.copy(srcPath, destPath)
    await this.#deleteEntry(srcPath)
  }

  /**
   * List entries in a directory path relative to root.
   * Returns [] if the directory doesn't exist yet (e.g. empty backups/).
   * Each entry: { name, kind: 'file'|'directory', size?, lastModified? }
   */
  async list(dirPath) {
    let dir
    try { dir = await this.#navigate(dirPath) }
    catch { return [] }

    const entries = []
    for await (const [name, handle] of dir) {
      const entry = { name, kind: handle.kind }
      if (handle.kind === 'file') {
        const file = await handle.getFile()
        entry.size         = file.size
        entry.lastModified = file.lastModified
      }
      entries.push(entry)
    }
    return entries
  }

  /** Read a file and return its raw bytes (Uint8Array). */
  async readFile(pathSegments) {
    return this.#readBytes(pathSegments)
  }

  /** Write raw bytes to a file, creating intermediate directories as needed. */
  async writeFile(pathSegments, data) {
    await this.#writeBytes(pathSegments, data)
  }

  /**
   * Watchdog for OneDrive conflict copies.
   * OneDrive creates conflict copies named like "masterdb-Normanpc.sqlite" or
   * "masterdb (Norman's conflicted copy 2026-08-06).sqlite" when two clients
   * write simultaneously. Callers should check on open() and surface any hits.
   * Returns an array of filenames (empty = clean).
   */
  async checkConflictCopies() {
    const entries = await this.list(['db'])
    return entries
      .filter(e =>
        e.kind === 'file' &&
        e.name !== 'masterdb.sqlite' &&
        e.name.toLowerCase().startsWith('masterdb') &&
        e.name.endsWith('.sqlite')
      )
      .map(e => e.name)
  }

  /** Persist this store's root handle to IndexedDB for session recall. */
  async persist() {
    await saveRootHandle(this.#root)
  }
}

// ── Factory functions ─────────────────────────────────────────────────────────

/**
 * Show a folder picker, create an FsaStore bound to the chosen folder, and
 * persist the handle. Call this on first use or when the user wants to change
 * the OneDrive folder.
 *
 * Note: showDirectoryPicker() requires a user gesture (button click).
 */
export async function pickStore() {
  const root  = await showDirectoryPicker({ mode: 'readwrite', id: 'masterdb2-root' })
  const store = new FsaStore(root)
  await store.persist()
  return store
}

/**
 * Try to restore the previously-chosen OneDrive folder from IndexedDB.
 * Returns an FsaStore if a valid, permitted handle is found; null otherwise.
 * A null return means the app must call pickStore() to let the user choose again.
 */
export async function recallStore() {
  const handle = await loadRootHandle()
  if (!handle) return null
  if (!(await verifyPermission(handle))) return null
  return new FsaStore(handle)
}

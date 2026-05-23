/**
 * File System Access API — sync folder utilities
 *
 * Both TechTool and MasterDB point at the same shared OneDrive folder
 * (synced locally via the OneDrive desktop client). This module handles
 * picking the folder, persisting the handle across sessions, and
 * reading/writing/listing/moving JSON packet files within it.
 *
 * Folder layout (from the office's perspective):
 *   ConnectHearing/
 *     inbox/    ← TechTool writes completed packets here; MasterDB reads them
 *     archive/  ← MasterDB moves imported packets here
 *     techs/
 *       Norm/   ← MasterDB writes Norm's packets here; Norm's TechTool reads from here
 *       Cal/    (one subfolder per tech, named by their folder_name field)
 *       ...
 *
 * Requires Chrome or Edge (File System Access API + importmap support).
 */

// ---------------------------------------------------------------------------
// IndexedDB store for the persistent folder handle
// ---------------------------------------------------------------------------

const FS_DB_NAME = 'hcp-fs-handles'
const FS_DB_VER  = 1
let _fsDb = null

async function openFsDB() {
  if (_fsDb) return _fsDb
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FS_DB_NAME, FS_DB_VER)
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('handles', { keyPath: 'key' })
    }
    req.onsuccess = e => { _fsDb = e.target.result; resolve(_fsDb) }
    req.onerror   = e => reject(e.target.error)
  })
}

async function saveHandle(handle) {
  const db = await openFsDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('handles', 'readwrite')
    const req = tx.objectStore('handles').put({ key: 'sync-root', handle })
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  })
}

async function loadHandle() {
  const db = await openFsDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('handles', 'readonly')
    const req = tx.objectStore('handles').get('sync-root')
    req.onsuccess = e => resolve(e.target.result?.handle ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}

// ---------------------------------------------------------------------------
// Public: folder selection and permission
// ---------------------------------------------------------------------------

/**
 * Prompt the user to choose the ConnectHearing sync folder.
 * Saves the handle to IndexedDB for future sessions.
 * MUST be called directly from a user gesture (click handler).
 */
export async function pickSyncFolder() {
  if (!window.showDirectoryPicker) {
    throw new Error('Your browser does not support folder access. Please use Chrome or Edge.')
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'desktop' })
  await saveHandle(handle)
  return handle
}

/**
 * Retrieve the stored folder handle and re-request permission.
 * Shows a one-click "Allow" prompt — does NOT open the full folder picker.
 * Returns null if no folder was previously selected.
 * Must be called from a user gesture.
 */
export async function getSyncFolder() {
  const handle = await loadHandle()
  if (!handle) return null
  const perm = await handle.requestPermission({ mode: 'readwrite' })
  return perm === 'granted' ? handle : null
}

/**
 * Check if permission is already granted without any prompt.
 * Safe to call during app boot (no user gesture needed).
 * Returns the handle if already granted, null otherwise.
 */
export async function querySyncFolder() {
  const handle = await loadHandle()
  if (!handle) return null
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' })
    return perm === 'granted' ? handle : null
  } catch {
    return null
  }
}

/**
 * Returns true if a folder handle is stored (regardless of permission state).
 */
export async function hasSyncFolder() {
  const handle = await loadHandle()
  return handle !== null
}

// ---------------------------------------------------------------------------
// Public: file operations
// ---------------------------------------------------------------------------

async function getDir(root, sub) {
  const parts = sub.split('/')
  let dir = root
  for (const part of parts) {
    if (part) dir = await dir.getDirectoryHandle(part, { create: true })
  }
  return dir
}

/**
 * List all .json files in a subfolder.
 * Returns [{ name: string, handle: FileSystemFileHandle }], sorted by name.
 */
export async function listJsonFiles(root, sub) {
  const dir   = await getDir(root, sub)
  const files = []
  for await (const [name, handle] of dir) {
    if (name.endsWith('.json') && handle.kind === 'file') {
      files.push({ name, handle })
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Read and parse a JSON file from a subfolder.
 */
export async function readJsonFile(root, sub, filename) {
  const dir  = await getDir(root, sub)
  const fh   = await dir.getFileHandle(filename)
  const file = await fh.getFile()
  return JSON.parse(await file.text())
}

/**
 * Write a JSON object to a file in a subfolder (creates or overwrites).
 */
export async function writeJsonFile(root, sub, filename, data) {
  const dir      = await getDir(root, sub)
  const fh       = await dir.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

/**
 * Move a JSON file from one subfolder to another (copy then delete source).
 */
export async function moveJsonFile(root, fromSub, toSub, filename) {
  const data   = await readJsonFile(root, fromSub, filename)
  await writeJsonFile(root, toSub, filename, data)
  const srcDir = await getDir(root, fromSub)
  await srcDir.removeEntry(filename)
}

/**
 * Deletes a file from a subfolder.
 */
export async function deleteJsonFile(root, sub, filename) {
  const dir = await getDir(root, sub);
  await dir.removeEntry(filename);
}
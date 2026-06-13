/**
 * techtool/db/idb.js
 * 
 * IndexedDB storage for TechTool.
 * Handles local persistence of settings and packets for offline use.
 */

const DB_NAME = 'hcp-techtool'
const DB_VER  = 1

let _db = null

export async function openDB() {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('packets'))  db.createObjectStore('packets',  { keyPath: 'packet_id' })
    }
    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror   = e => reject(e.target.error)
  })
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(key) {
  const db = await openDB()
  return new Promise(resolve => {
    const req = db.transaction('settings').objectStore('settings').get(key)
    req.onsuccess = () => resolve(req.result?.value ?? null)
    req.onerror   = () => resolve(null)
  })
}

export async function setSetting(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite')
    tx.objectStore('settings').put({ key, value })
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

/**
 * Removes a setting (used for Logout)
 */
export async function removeSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const req = tx.objectStore('settings').delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Packets
// ---------------------------------------------------------------------------

export async function getAllPackets() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('packets').objectStore('packets').getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function savePacket(packet) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('packets', 'readwrite')
    tx.objectStore('packets').put(packet)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

/**
 * Permanently deletes a packet from the local device database.
 */
export async function deletePacket(packetId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('packets', 'readwrite');
    const store = tx.objectStore('packets');
    const req = store.delete(packetId);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Marks a packet as archived (hidden from dashboard)
 */
export async function archivePacket(packetId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('packets', 'readwrite');
    const store = tx.objectStore('packets');
    const getReq = store.get(packetId);
    
    getReq.onsuccess = () => {
      const packet = getReq.result;
      if (packet) {
        packet.ui_archived = true;
        store.put(packet);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}
const DB_NAME    = 'hcp-techtool'
const DB_VERSION = 1

let _db = null

export async function openDB() {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = e => {
      const db = e.target.result

      // Packets store — keyed by packet_id
      if (!db.objectStoreNames.contains('packets')) {
        const store = db.createObjectStore('packets', { keyPath: 'packet_id' })
        store.createIndex('status',     'status')
        store.createIndex('visit_date', 'visit.visit_date')
      }

      // In-progress test drafts — composite key [packet_id, employee_id]
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: ['packet_id', 'employee_id'] })
      }

      // App settings — key/value pairs
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }

    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror   = e => reject(e.target.error)
  })
}

// ---------------------------------------------------------------------------
// Packets
// ---------------------------------------------------------------------------

export async function savePacket(packet) {
  const db = await openDB()
  return write(db, 'packets', store => store.put(packet))
}

export async function getPacket(packetId) {
  const db = await openDB()
  return read(db, 'packets', store => store.get(packetId))
}

export async function getAllPackets() {
  const db = await openDB()
  return read(db, 'packets', store => store.getAll())
}

export async function packetExists(packetId) {
  const db  = await openDB()
  const key = await read(db, 'packets', store => store.getKey(packetId))
  return key !== undefined
}

export async function deletePacket(packetId) {
  const db = await openDB()
  return write(db, 'packets', store => store.delete(packetId))
}

// ---------------------------------------------------------------------------
// Drafts (in-progress tests)
// ---------------------------------------------------------------------------

export async function saveDraft(packetId, employeeId, testData) {
  const db = await openDB()
  return write(db, 'drafts', store =>
    store.put({
      packet_id:   packetId,
      employee_id: employeeId,
      saved_at:    new Date().toISOString(),
      ...testData
    })
  )
}

export async function getDraft(packetId, employeeId) {
  const db = await openDB()
  return read(db, 'drafts', store => store.get([packetId, employeeId]))
}

export async function deleteDraft(packetId, employeeId) {
  const db = await openDB()
  return write(db, 'drafts', store => store.delete([packetId, employeeId]))
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(key) {
  const db  = await openDB()
  const row = await read(db, 'settings', store => store.get(key))
  return row?.value ?? null
}

export async function setSetting(key, value) {
  const db = await openDB()
  return write(db, 'settings', store => store.put({ key, value }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function read(db, storeName, fn) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly')
    const req = fn(tx.objectStore(storeName))
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

function write(db, storeName, fn) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite')
    const req = fn(tx.objectStore(storeName))
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

/**
 * Marks a packet as archived so it doesn't show on the dashboard.
 */
export async function archivePacket(packetId) {
  const db = await openDB(); // Use your existing openDB function
  return new Promise((resolve, reject) => {
    const tx = db.transaction('packets', 'readwrite');
    const store = tx.objectStore('packets');
    
    const getReq = store.get(packetId);
    
    getReq.onsuccess = () => {
      const packet = getReq.result;
      if (packet) {
        packet.ui_archived = true; // Set a flag for the UI
        store.put(packet);
      }
      resolve();
    };
    
    getReq.onerror = () => reject(getReq.error);
  });
}
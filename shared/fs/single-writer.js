/**
 * shared/fs/single-writer.js
 *
 * STOP-GAP concurrency control for MasterDB sync/import (2026-07-30).
 *
 * Until the durable fix lands (globally-unique ids + eTag/If-Match on OneDrive
 * writes), two things prevent the import/merge collisions documented in
 * INCIDENT-2026-07-29-yorkton.md:
 *
 *   1. withSyncLock()  — Web Locks serialize sync+import across all tabs/workers
 *      of ONE browser profile. Reliable, same-origin only.
 *
 *   2. Import ownership + a best-effort OneDrive claim file — only the one
 *      computer marked as "import owner" runs auto-import, and even that is
 *      guarded by an advisory lock file in the sync root so a second
 *      mis-configured owner can't import at the same instant across computers.
 *
 * Web Locks cannot coordinate across different computers/users (the lock is
 * scoped to a browser profile). That is what the ownership flag + claim file
 * cover, best-effort, given OneDrive's propagation latency.
 */

import { readJsonFile, writeJsonFile, deleteJsonFile } from './sync-folder.js'

// ---------------------------------------------------------------------------
// Web Locks — serialize within a single browser
// ---------------------------------------------------------------------------

/**
 * Run fn() while holding a same-browser lock. If another tab/worker already
 * holds it, returns { skipped: true } immediately instead of queueing, so
 * heartbeats don't pile up. Otherwise returns { skipped: false, result }.
 */
export async function withSyncLock(fn, lockName = 'hcp-masterdb-sync') {
  if (!navigator?.locks?.request) {
    // No Web Locks API (very old browser) — run unguarded rather than block.
    return { skipped: false, result: await fn() }
  }
  return navigator.locks.request(lockName, { ifAvailable: true }, async lock => {
    if (!lock) return { skipped: true }
    return { skipped: false, result: await fn() }
  })
}

// ---------------------------------------------------------------------------
// Per-computer identity + import ownership (localStorage = per browser profile)
// ---------------------------------------------------------------------------

const OWNER_KEY    = 'hcp_import_owner'
const INSTANCE_KEY = 'hcp_instance_id'

/** Stable id for this browser profile (created once, persisted). */
export function getInstanceId() {
  try {
    let id = localStorage.getItem(INSTANCE_KEY)
    if (!id) {
      id = (self.crypto?.randomUUID?.() ?? `inst-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      localStorage.setItem(INSTANCE_KEY, id)
    }
    return id
  } catch {
    return 'inst-ephemeral'
  }
}

/** True if THIS computer is designated to auto-import packets. */
export function isImportOwner() {
  try { return localStorage.getItem(OWNER_KEY) === '1' } catch { return false }
}

/** Enable/disable auto-import ownership for this computer. */
export function setImportOwner(on) {
  try {
    if (on) localStorage.setItem(OWNER_KEY, '1')
    else    localStorage.removeItem(OWNER_KEY)
  } catch {}
}

// ---------------------------------------------------------------------------
// Cross-computer advisory claim — a lock file in the sync root
// ---------------------------------------------------------------------------

const CLAIM_FILE = 'import.lock.json'
const CLAIM_TTL_MS = 120000  // a stale lock older than this is ignored (crash-safe)

/**
 * Try to claim the shared import lock. Best-effort: OneDrive propagation is not
 * instantaneous, so this reduces — not eliminates — the simultaneous-import
 * window. Returns true if the claim is ours.
 */
export async function acquireImportClaim(syncFolder) {
  if (!syncFolder) return true  // no shared folder → nothing to coordinate with
  const me = getInstanceId()
  const now = Date.now()

  let existing = null
  try { existing = await readJsonFile(syncFolder, '', CLAIM_FILE) } catch {}

  if (existing && existing.instanceId && existing.instanceId !== me &&
      typeof existing.ts === 'number' && (now - existing.ts) < CLAIM_TTL_MS) {
    return false  // a fresh claim is held by someone else
  }

  try { await writeJsonFile(syncFolder, '', CLAIM_FILE, { instanceId: me, ts: now }) }
  catch { return false }

  // Settle + read back. If someone else's write landed last, yield.
  await new Promise(r => setTimeout(r, 400))
  let after = null
  try { after = await readJsonFile(syncFolder, '', CLAIM_FILE) } catch {}
  return !!after && after.instanceId === me
}

/** Release the shared import lock if we still hold it. */
export async function releaseImportClaim(syncFolder) {
  if (!syncFolder) return
  const me = getInstanceId()
  try {
    const cur = await readJsonFile(syncFolder, '', CLAIM_FILE)
    if (cur && cur.instanceId === me) await deleteJsonFile(syncFolder, '', CLAIM_FILE)
  } catch {}
}

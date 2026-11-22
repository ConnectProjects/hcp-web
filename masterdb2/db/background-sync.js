/**
 * masterdb2/db/background-sync.js — automatic packet import
 *
 * Wraps the existing autoImportClean() pipeline in a guarded interval so clean
 * packets are imported without the LC having to click "Auto-import all".
 * Ambiguous packets are never committed — autoImportClean leaves them in the
 * inbox and returns them as skipped results for the "Needs Review" UI.
 *
 * Safety rules:
 *   1. Visible tab only — app.js releases the write lock when the tab is hidden.
 *   2. Web Locks (when available) prevent two tabs in this browser racing.
 *   3. A fresh lock owned by a different writer skips this cycle.
 *   4. Errors are published to subscribers, never thrown into the interval.
 *
 * No changes to the packet format, folder layout, or commitImport() gates.
 */

import { query, readLock } from './db.js'
import { autoImportClean } from './import-packet.js'

const DEFAULT_INTERVAL_MS = 60_000
const WEB_LOCK_NAME = 'masterdb-auto-import'

/**
 * Only MasterDB screens import packets. A person may hold both an aud_tech and
 * an admin user row, so the route — not the role — decides.
 */
export function shouldAutoImport(screenName) {
  if (!screenName || screenName === 'login') return false
  return !String(screenName).startsWith('tt-')
}

let _running  = false
let _timer    = null
let _session  = null
let _last     = null
const _subs   = new Set()

// ── State observers ───────────────────────────────────────────────────────────

/** Last result: { at, results: [], error } or null before the first run. */
export function getLastResult() { return _last }

/** Subscribe to sync results. Returns an unsubscribe function. */
export function subscribe(fn) {
  _subs.add(fn)
  return () => { _subs.delete(fn) }
}

function _publish(next) {
  _last = next
  for (const fn of [..._subs]) {
    try { fn(next) } catch { /* one bad subscriber must not break the rest */ }
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _safeReadLock() {
  try { return readLock() } catch { return null }
}

function _activeTechs() {
  return query(`SELECT * FROM techs WHERE active = 1 AND folder_name IS NOT NULL ORDER BY name`)
}

async function _runOnce() {
  // Another MasterDB instance holds a fresh lock — stay out of its way.
  const lock = _safeReadLock()
  if (lock && !lock.stale && lock.owner && lock.owner !== _session.writerName) return

  const techs = _activeTechs()
  if (!techs.length) {
    _publish({ at: Date.now(), results: [], error: null })
    return
  }

  const outcome = await autoImportClean(techs, _session.writerName)
  _publish({ at: Date.now(), results: outcome?.results ?? [], error: null })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run one guarded auto-import cycle now. Safe to call from a timer, a visibility
 * handler, or a UI "Retry" link. No-ops when hidden, already running, or when
 * another tab holds the Web Lock.
 */
export async function refreshNow() {
  if (!_session || _running) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

  _running = true
  try {
    const run = () => _runOnce()

    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      await navigator.locks.request(WEB_LOCK_NAME, { ifAvailable: true }, async handle => {
        if (handle) await run()
      })
    } else {
      await run()
    }
  } catch (e) {
    _publish({ at: Date.now(), results: [], error: e?.message ?? String(e) })
  } finally {
    _running = false
  }
}

/** Start background auto-import for the signed-in session. */
export function startAutoImport(session, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (!session) return
  _stopTimer()
  _session = session
  _last = null
  _timer = setInterval(() => { refreshNow() }, intervalMs)
  refreshNow()
}

/** Stop background auto-import (sign out, tab teardown). */
export function stopAutoImport() {
  _stopTimer()
  _session = null
}

function _stopTimer() {
  if (_timer) { clearInterval(_timer); _timer = null }
}

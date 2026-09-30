/**
 * masterdb2/sw.js — TechTool / MasterDB service worker
 *
 * IMPORTANT: bump VERSION on every deploy. Any change to this string
 * causes browsers to install the new SW and re-fetch all cached assets.
 */

const VERSION = 'hcp-v3'
const CACHE   = `hcp-${VERSION}`

const ASSETS = [
  // App shell
  '/hcp-web/masterdb2/',
  '/hcp-web/masterdb2/index.html',
  '/hcp-web/masterdb2/app.js',
  '/hcp-web/masterdb2/app.css',

  // Vendor
  '/hcp-web/masterdb2/vendor/sql-wasm.js',
  '/hcp-web/masterdb2/vendor/sql-wasm.wasm',
  '/hcp-web/masterdb2/vendor/jszip.min.js',

  // MasterDB screens
  '/hcp-web/masterdb2/screens/login.js',
  '/hcp-web/masterdb2/screens/dashboard.js',
  '/hcp-web/masterdb2/screens/schedule.js',
  '/hcp-web/masterdb2/screens/companies.js',
  '/hcp-web/masterdb2/screens/company.js',
  '/hcp-web/masterdb2/screens/workers.js',
  '/hcp-web/masterdb2/screens/worker.js',
  '/hcp-web/masterdb2/screens/import.js',
  '/hcp-web/masterdb2/screens/reconcile.js',
  '/hcp-web/masterdb2/screens/reports.js',
  '/hcp-web/masterdb2/screens/users.js',
  '/hcp-web/masterdb2/screens/settings.js',
  '/hcp-web/masterdb2/screens/location.js',
  '/hcp-web/masterdb2/screens/test.js',

  // TechTool screens
  '/hcp-web/techtool2/screens/tt-schedule.js',
  '/hcp-web/techtool2/screens/tt-inbox.js',
  '/hcp-web/techtool2/screens/tt-test.js',
  '/hcp-web/techtool2/screens/tt-new-visit.js',
  '/hcp-web/techtool2/screens/tt-settings.js',

  // DB layer
  '/hcp-web/masterdb2/db/db.js',
  '/hcp-web/masterdb2/db/fsa-store.js',
  '/hcp-web/masterdb2/db/schema.js',
  '/hcp-web/masterdb2/db/workers.js',
  '/hcp-web/masterdb2/db/import-packet.js',
  '/hcp-web/masterdb2/db/wsbc-import.js',
  '/hcp-web/masterdb2/db/wsbc-export.js',

  // Shared modules
  '/hcp-web/shared/packet/schema.js',
  '/hcp-web/shared/classification/engine.js',
  '/hcp-web/shared/components/noc-picker.js',
  '/hcp-web/shared/components/brand-logo.js',
  '/hcp-web/shared/validation/thresholds.js',
  '/hcp-web/shared/validation/reconcile-import.js',
  '/hcp-web/shared/time-utils.js',
  '/hcp-web/shared/auth-utils.js',
  '/hcp-web/shared/referral-form.js',

  // Data
  '/hcp-web/shared/wsbc-noc.json',
  '/hcp-web/shared/rules/AB.json',
  '/hcp-web/shared/rules/BC.json',
  '/hcp-web/shared/rules/SK.json',

  // Static assets
  '/hcp-web/shared/techtool%20banner.png',
  '/hcp-web/favicon.ico',
]

// ── Install: cache all assets, activate immediately ───────────────────────────
// skipWaiting ensures no stuck "waiting" state — new SW is always active.
// Safe without clients.claim(): navigations (including refreshes) are intercepted
// by the active SW regardless. No forcible takeover of already-open pages.

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: delete old caches ───────────────────────────────────────────────

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  )
})

// ── Fetch: cache-first, fall back to network ──────────────────────────────────

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
    })
  )
})

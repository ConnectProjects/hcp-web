const CACHE = 'hcp-masterdb-v2'

const APP_SHELL = [
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  '../shared/components/brand-logo.png',
  './db/sqlite.js',
  './db/schema.js',
  './db/companies.js',
  './db/employees.js',
  './db/tests.js',
  './db/packets.js',
  './screens/dashboard.js',
  './screens/companies.js',
  './screens/company-detail.js',
  './screens/employees.js',
  './screens/generate-packet.js',
  './screens/incoming.js',
  './screens/import-confirm.js',
  './screens/schedule.js',
  './screens/settings.js',
  '../shared/classification/engine.js',
  '../shared/validation/thresholds.js',
  '../shared/packet/schema.js',
  '../shared/auth/msal-stub.js',
  '../shared/rules/AB.json',
  '../shared/rules/BC.json',
  '../shared/rules/SK.json',
  '../shared/counsel/AB.json',
  '../shared/counsel/BC.json',
  '../shared/counsel/SK.json'
]

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = e.request.url
  if (url.includes('graph.microsoft.com') || url.includes('login.microsoftonline.com') ||
      url.includes('cdn.jsdelivr.net')) return
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)))
})

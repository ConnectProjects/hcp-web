const CACHE_NAME = 'techtool-v2';

// Add only the absolute essentials here
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // we use .addAll but wrap it to stay safe if a file is missing
      return Promise.allSettled(ASSETS_TO_CACHE.map(url => cache.add(url)));
    })
  );
});

self.addEventListener('fetch', (event) => {
  // If it's a browser extension or a non-http request, ignore it
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached file OR fetch from network
      return response || fetch(event.request).catch(() => {
        // If network fails and it's not in cache, just fail gracefully
        return new Response('Network error occurred', { status: 408 });
      });
    })
  );
});
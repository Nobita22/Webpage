importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Immediately activate the new service worker
workbox.core.skipWaiting();
workbox.core.clientsClaim();

if (workbox) {
  console.log('Workbox is loaded');

  // Precache files with explicit revision to ensure update on change
  workbox.precaching.precacheAndRoute([
    { url: '/index.html', revision: '3' },      // Increment revision on file update
    { url: '/manifest.json', revision: '3' },
    { url: '/icon2.png', revision: '1' },
    // Add other assets here with revisioning as needed
  ]);

  // Cache images with StaleWhileRevalidate strategy
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'image-cache',
    })
  );

  // Cache CSS and JS files with CacheFirst strategy, max age 7 days
  workbox.routing.registerRoute(
    ({ url }) => url.origin === self.location.origin &&
                 (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')),
    new workbox.strategies.CacheFirst({
      cacheName: 'static-resources',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        }),
      ],
    })
  );

  // Network-first strategy for navigation requests (pages)
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
        }),
      ],
    })
  );

} else {
  console.log('Workbox failed to load');
}

// Clean up old caches on activate
self.addEventListener('activate', event => {
  const currentCaches = [
    workbox.core.cacheNames.precache,
    'image-cache',
    'static-resources',
    'pages-cache',
  ];
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cacheName => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[Service Worker] Deleting outdated cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      )
    )
  );
});

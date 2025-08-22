importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Immediately activate new service worker and take control of clients
workbox.core.skipWaiting();
workbox.core.clientsClaim();

if (workbox) {
  console.log('Workbox loaded');

  // Precache app shell files with revisioning to force updates
  workbox.precaching.precacheAndRoute([
    { url: '/Webpage/index.html', revision: '2' },
    { url: '/Webpage/manifest.json', revision: '2' },
    { url: '/Webpage/icon2.png', revision: '1' },
    // Add other static assets with revision numbers
  ]);

  // Cache images with StaleWhileRevalidate strategy
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'image-cache',
    })
  );

  // Cache JS, CSS, other static assets (CacheFirst with max age)
  workbox.routing.registerRoute(
    ({ url }) => url.origin === self.location.origin &&
                 (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')),
    new workbox.strategies.CacheFirst({
      cacheName: 'static-assets',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        }),
      ],
    })
  );

  // Use Network First strategy for navigation requests (HTML pages)
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

// Clean up old caches during activation
self.addEventListener('activate', event => {
  const currentCaches = [
    workbox.core.cacheNames.precache,
    'image-cache',
    'static-assets',
    'pages-cache'
  ];
  event.waitUntil(
    caches.keys().then(cacheNames => 
      Promise.all(
        cacheNames.map(cacheName => {
          if (!currentCaches.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      )
    )
  );
});

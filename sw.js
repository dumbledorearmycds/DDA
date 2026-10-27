const CACHE_NAME = 'dda-hub-v247';

// Essential static assets to pre-cache on install
// Note: All CSS and JavaScript for the application are self-contained within index.html.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './images/apple-touch-icon.png',
  './images/topbar_crest.webp',
  './images/Spin_exit_image.jpg',
  './css/main.css',
  './css/suggestions.css',
  './css/spin-wheel.css',
  './js/data/cards-data.js',
  './js/firebase/firebase-service.js',
  './js/core/door-intro.js',
  './js/core/bridge.js',
  './js/ui/how-to-guide.js',
  './js/ui/action-runner.js',
  './js/multiplayer/multiplayer.js',
  './js/core/sw-register.js',
  './js/game/spin-wheel.bundle.js',
  './js/game/game.js',
  './assets/audio/door-open.mp3',
  './assets/audio/wheel-tick.mp3',
  './assets/audio/wheel-final-click.wav',
  './assets/audio/wheel-spin.wav',
  './assets/audio/reward-reveal.wav'
];

// Install event: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up any older caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// Skip waiting message handler from sw-register.js prompt
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event:
// - ONLY manage local static assets, cached resources, and static Firebase SDK modules
// - CRITICAL: NEVER intercept Firestore, Realtime Database, Google APIs, Cloudinary, or any third-party streaming/API calls!
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. NEVER intercept third-party APIs, database streams, or cloud backends!
  // Allowing the service worker to intercept streaming/polling Firestore/RTDB calls
  // breaks WebChannel and marks the client offline.
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isFirebaseStaticSDK = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');

  if (!isSameOrigin && !isGoogleFont && !isFirebaseStaticSDK) {
    return; // Pass through natively to network without Service Worker interference
  }

  // 2. Navigation / HTML requests: Stale-While-Revalidate (Instant app launch)
  // Delivers pre-cached index.html in sub-50ms; revalidates over network in background.
  const isHTMLRequest =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/');

  if (isHTMLRequest) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const cachedPromise = cachedResponse
          ? Promise.resolve(cachedResponse)
          : caches.match('./index.html').then((m) => m || caches.match('./'));

        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
                cache.put('./index.html', responseToCache.clone());
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline or network error: cache match will be served
          });

        return cachedPromise.then((matched) => {
          return matched || networkFetch;
        });
      })
    );
    return;
  }

  // 3. Static Assets (Same-origin CSS, JS, images, audio, Google Fonts & Firebase static SDK): Cache-First, fallback to Network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback: try matching without search query params for local assets
        return caches.match(event.request, { ignoreSearch: true });
      });
    })
  );
});

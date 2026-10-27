const CACHE_NAME = 'dda-hub-v242';

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

// Fetch event:
// - ONLY manage local static assets and cached resources
// - CRITICAL: NEVER intercept Firestore, Realtime Database, Google APIs, Cloudinary, or any third-party streaming/API calls!
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. NEVER intercept third-party APIs, database streams, or cloud backends!
  // Allowing the service worker to intercept streaming/polling Firestore/RTDB calls
  // breaks WebChannel and marks the client offline.
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (!isSameOrigin && !isGoogleFont) {
    return; // Pass through natively to network without Service Worker interference
  }

  // 2. Navigation / HTML requests: Network-First with Cache Fallback
  const isHTMLRequest =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/');

  if (isHTMLRequest) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('./index.html') || caches.match('./');
          });
        })
    );
    return;
  }

  // 3. Same-origin Static Assets (CSS, JS, images, audio): Cache-First, fallback to Network
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

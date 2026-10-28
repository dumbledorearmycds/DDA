const CACHE_NAME = 'dda-hub-v263';

// Essential static assets to pre-cache on install
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './images/apple-touch-icon.png',
  './images/topbar_crest.webp',
  './images/Spin_exit_image.jpg',
  './images/da_gateway_banner.webp',
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

// Critical core assets that MUST be in cache for instant UI rendering
const CRITICAL_PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/main.css',
  './js/core/door-intro.js'
];

// Install event: pre-cache static assets reliably
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. First ensure critical shell assets are cached
      try {
        await cache.addAll(CRITICAL_PRECACHE_ASSETS);
      } catch (e) {
        console.warn('[SW] Core precache warning:', e);
      }

      // 2. Pre-cache secondary assets without blocking install on network jitter
      const secondaryAssets = ASSETS_TO_CACHE.filter(
        (url) => !CRITICAL_PRECACHE_ASSETS.includes(url)
      );

      await Promise.allSettled(
        secondaryAssets.map(async (url) => {
          try {
            const res = await fetch(url);
            if (res && res.ok) {
              await cache.put(url, res);
            }
          } catch (e) {}
        })
      );
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

  // 2. Navigation / HTML requests: Cache-First with Background Revalidation (Instant App Launch)
  // Delivers pre-cached index.html in sub-10ms; revalidates over network in background.
  const isHTMLRequest =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/');

  if (isHTMLRequest) {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME);

          // 1. Instant cache match
          const cachedHTML =
            (await cache.match(event.request, { ignoreSearch: true })) ||
            (await cache.match('./index.html', { ignoreSearch: true })) ||
            (await cache.match('./', { ignoreSearch: true })) ||
            (await caches.match('./index.html', { ignoreSearch: true }));

          // 2. Background revalidation fetch
          const networkPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.ok) {
                // Must clone BEFORE consuming with cache.put!
                const cloneForReq = networkResponse.clone();
                const cloneForIndex = networkResponse.clone();
                cache.put(event.request, cloneForReq);
                cache.put('./index.html', cloneForIndex);
              }
              return networkResponse;
            })
            .catch(() => null);

          // Serve cached HTML immediately if available!
          if (cachedHTML) {
            return cachedHTML;
          }

          // If not in cache yet, wait for network
          const fresh = await networkPromise;
          if (fresh) {
            return fresh;
          }
        } catch (e) {}

        // Failsafe: if cache and network both fail, try global match or fresh fetch
        const fallback = await caches.match('./index.html', { ignoreSearch: true });
        if (fallback) return fallback;

        return fetch(event.request);
      })()
    );
    return;
  }

  // 3. Static Assets (Same-origin CSS, JS, images, audio, Google Fonts & Firebase static SDK): Cache-First, fallback to Network
  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);

        // Check local cache or any active cache first
        const cached =
          (await cache.match(event.request, { ignoreSearch: true })) ||
          (await caches.match(event.request, { ignoreSearch: true }));

        if (cached) {
          return cached;
        }

        // Fetch from network, clone, and store in cache
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          cache.put(event.request, clone);
        }
        return networkResponse;
      } catch (err) {
        // Offline fallback: try matching with ignoreSearch across all caches
        const fallback = await caches.match(event.request, { ignoreSearch: true });
        if (fallback) return fallback;
        throw err;
      }
    })()
  );
});

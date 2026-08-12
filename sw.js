const CACHE_NAME = 'bbm-kppd-v9';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap'
];

// Install Event — Cache Static Resources
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Caching static assets');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[Service Worker] Static assets caching partial fail:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate Event — Cleanup Old Caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event — Stale While Revalidate Strategy for Local Assets
self.addEventListener('fetch', event => {
    // Bypass non-GET requests or Google Apps Script API calls from cache
    if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                // Fix: cache juga CORS responses (Google Fonts, CDN assets)
                if (networkResponse && networkResponse.status === 200 &&
                    (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Fix: offline fallback — return cached index.html untuk navigation requests
                if (cachedResponse) return cachedResponse;
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return cachedResponse;
            });

            return cachedResponse || fetchPromise;
        })
    );
});

// Notification Click Handler Event
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                        break;
                    }
                }
                return client.focus();
            }
            return clients.openWindow('./index.html');
        })
    );
});

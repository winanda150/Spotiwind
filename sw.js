/**
 * Spotiwind Progressive Web App (PWA) Service Worker
 * Enables 100% Offline Playback & Seamless Offline Browsing
 */

const APP_SHELL_CACHE = 'spotiwind-app-shell-v1';
const AUDIO_CACHE = 'spotiwind-offline-audio-v1';

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/frontend/src/assets/css/index.css',
    '/frontend/src/assets/js/index.js',
    '/frontend/src/pages/home-mobile.html',
    '/frontend/src/pages/home-desktop.html',
    '/frontend/src/pages/library-mobile.html',
    '/frontend/src/pages/search-mobile.html',
    '/frontend/src/pages/windflow-mobile.html',
    '/frontend/src/pages/account-mobile.html',
    '/frontend/src/pages/artist-mobile.html',
    '/frontend/src/pages/auth-mobile.html',
    '/frontend/src/pages/notifications-mobile.html',
    '/frontend/src/assets/css/home-mobile.css',
    '/frontend/src/assets/css/home-desktop.css',
    '/frontend/src/assets/css/library-mobile.css',
    '/frontend/src/assets/css/search-mobile.css',
    '/frontend/src/assets/css/windflow-mobile.css',
    '/frontend/src/assets/css/account-mobile.css',
    '/frontend/src/assets/css/artist-mobile.css',
    '/frontend/src/assets/css/auth-mobile.css',
    '/frontend/src/assets/css/notifications-mobile.css',
    '/frontend/src/assets/js/home-mobile.js',
    '/frontend/src/assets/js/home-desktop.js',
    '/frontend/src/assets/js/library-mobile.js',
    '/frontend/src/assets/js/search-mobile.js',
    '/frontend/src/assets/js/windflow-mobile.js',
    '/frontend/src/assets/js/account-mobile.js',
    '/frontend/src/assets/js/artist-mobile.js',
    '/frontend/src/assets/js/auth-mobile.js',
    '/frontend/src/assets/js/firebase-config.js',
    '/frontend/src/services/offlineAudioService.js',
    '/frontend/src/services/libraryService.js',
    '/frontend/src/services/catalogService.js',
    '/frontend/src/services/favoriteService.js',
    '/frontend/src/services/playerService.js',
    '/frontend/src/services/profileService.js',
    '/frontend/src/services/activityService.js',
    '/frontend/src/services/presenceService.js',
    '/frontend/src/services/notificationService.js',
    '/frontend/src/services/jamendoService.js',
    '/frontend/public/Elemen/Logo/Spotiwind.webp',
    '/frontend/public/Elemen/Logo/Spotiwind.ico'
];

// Install: Pre-cache App Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(APP_SHELL_CACHE).then(async (cache) => {
            console.log('[SW] Pre-caching Spotiwind App Shell...');
            // Cache items individually so one missing asset doesn't fail the entire install
            await Promise.allSettled(
                PRECACHE_ASSETS.map((url) =>
                    fetch(url)
                        .then((res) => {
                            if (res.ok) return cache.put(url, res);
                        })
                        .catch(() => {})
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== APP_SHELL_CACHE && key !== AUDIO_CACHE) {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Stale-While-Revalidate & Offline Audio Cache
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Bypass non-GET requests and Firebase Realtime/Firestore web sockets
    if (request.method !== 'GET') return;
    if (url.protocol.startsWith('chrome-extension')) return;

    // 2. Firebase live database / Auth / Google APIs bypass
    if (
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com')
    ) {
        return;
    }

    // 3. Audio & Media files: Check Offline Audio Cache first
    if (
        request.destination === 'audio' ||
        url.pathname.endsWith('.mp3') ||
        url.pathname.endsWith('.ogg') ||
        url.pathname.endsWith('.m4a')
    ) {
        event.respondWith(
            caches.open(AUDIO_CACHE).then(async (audioCache) => {
                const cachedAudio = await audioCache.match(request);
                if (cachedAudio) return cachedAudio;
                return fetch(request).catch(() => new Response('', { status: 404, statusText: 'Offline Audio Not Found' }));
            })
        );
        return;
    }

    // 4. Same-origin assets, HTML pages, JS modules, CSS, Fonts, and CDN scripts: Cache First with Network Fallback
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'error') {
                        const responseToCache = networkResponse.clone();
                        caches.open(APP_SHELL_CACHE).then((cache) => {
                            cache.put(request, responseToCache).catch(() => {});
                        });
                    }
                    return networkResponse;
                })
                .catch((err) => {
                    // If offline and request is for an HTML page, fallback to cached home page
                    if (request.headers.get('accept')?.includes('text/html') || request.destination === 'document') {
                        return cachedResponse || caches.match('/frontend/src/pages/home-mobile.html') || caches.match('/index.html');
                    }
                    return cachedResponse || new Response('Offline', { status: 503, statusText: 'Offline' });
                });

            return cachedResponse || fetchPromise;
        })
    );
});
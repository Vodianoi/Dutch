/*
 *  Service worker: the game opens without network (solo games), and installs as an app.
 *  - Files of the game: network first (a new version shows up right away), the saved copy when offline
 *  - PixiJS, GSAP and fonts (pinned versions on CDNs): saved copy first, they never change
 */
const CACHE = 'dutch-v1';
const SHELL = ['./', 'index.html', 'index.js', 'src/css/styles.css', 'manifest.webmanifest', 'icons/icon-192.png'];
const PINNED = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (PINNED.test(request.url)) {
        event.respondWith(caches.match(request).then(hit => hit ?? fetch(request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE).then(cache => cache.put(request, copy));
            }
            return response;
        })));
        return;
    }
    // Only this site's files (not the PeerJS server, not other pages of the domain)
    if (url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    event.respondWith(fetch(request).then(response => {
        if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
    }).catch(() => caches.match(request, {ignoreSearch: true}).then(hit => hit ?? caches.match('./'))
        .then(hit => hit ?? new Response('Hors ligne', {status: 503}))));
});

/* Service worker: lets the app open and work without internet,
   so it stays fast and reliable on a phone with a poor signal. */

const CACHE = 'till-slips-v2';
const FILES = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.match(event.request).then(hit =>
            hit || fetch(event.request).then(res => {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => {});
                return res;
            }).catch(() => caches.match('./index.html'))
        )
    );
});

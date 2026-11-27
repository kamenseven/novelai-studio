// Minimal offline shell cache. API calls always go to the network.

const VERSION = 'nai-studio-v15';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/env.js',
  './js/auth.js',
  './js/util.js',
  './js/api.js',
  './js/payload.js',
  './js/prompt.js',
  './js/promptassist.js',
  './js/state.js',
  './js/ui.js',
  './js/actions.js',
  './js/plugins.js',
  './js/styles.js',
  './js/tags.js',
  './js/views/generate.js',
  './js/views/gallery.js',
  './js/views/batch.js',
  './js/views/tools.js',
  './js/views/settings.js',
  './plugins/index.js',
  './plugins/example-frame.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // NovelAI API & CDNs: network only
  if (url.pathname.endsWith('/sw.js')) return;
  if (url.pathname.endsWith('/env')) return; // token file must always be fresh

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});

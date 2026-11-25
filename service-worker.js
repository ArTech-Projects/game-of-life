/**
 * The Game of Life V2 — offline shell service worker (M6).
 *
 * Registered as a module worker so the cache list comes from
 * `js/core/pwa.js`. Strategy: versioned, cache-first for the whole app shell
 * (HTML, CSS, JS, manifest and all 44 PNG icons). Bump
 * PWA_CACHE_VERSION to ship a new shell; `activate` removes every older
 * `gol-v2-*` cache and any legacy `gol-shell-*` cache.
 *
 * Cache version: gol-v2-m6-final13.
 *
 * Service workers only run on http(s); the app intentionally skips
 * registration under file:// and still works without a worker.
 */

import {
  PWA_CACHE_PREFIX,
  PWA_CACHE_VERSION,
  PWA_LEGACY_CACHE_PREFIXES,
  PWA_OFFLINE_PAGE,
  PWA_PRECACHE,
} from './js/core/pwa.js';

/** Resolves to `gol-v2-m6-final13`; bump PWA_CACHE_VERSION in js/core/pwa.js. */
const CACHE_NAME = PWA_CACHE_VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PWA_PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (
            key.startsWith(PWA_CACHE_PREFIX)
            || PWA_LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
          ) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match(PWA_OFFLINE_PAGE);
          }
          return Response.error();
        });
    }),
  );
});

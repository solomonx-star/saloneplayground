// The service worker: keeps the app on the phone, so after the first visit it opens from the phone instead of
// downloading again, and the games already opened once can be played with no connection (online play still needs
// one). Registered by AppUpdates.tsx in production only.
//
// Nothing is downloaded ahead of time: a file is kept the first time the page uses it, so a player who only opens
// Ludo never pays for Touch's game engine. What is kept:
// - /_next/static: the app's code and styles. Their names change with every release, so a kept file never goes out
//   of date: served from the phone, never asked for again. Old releases' files are trimmed (MAX_STATIC).
// - Pages: from the network, so a player online always gets the latest release; from the phone when the network
//   fails or takes longer than PAGE_TIMEOUT_MS (a slow mobile connection), and the network's copy then replaces the
//   kept one for next time. A newer release is offered with a RELOAD prompt (AppUpdates.tsx).
// - Other files of this site (icons, images): from the phone, refreshed in the background.
// Never kept: the game server (another address), the admin dashboard, requests other than GET, and Next.js's own
// data requests for in-app navigation (when offline those fall back to loading the page, which is kept).
//
// Change VERSION whenever this file changes in a way that should drop what phones have kept.
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const FILES = `files-${VERSION}`;
const MAX_STATIC = 200;
const MAX_PAGES = 30;
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener("install", () => {
  // This file only decides what to keep, so a new version can take over at once.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC, PAGES, FILES]);
    for (const name of await caches.keys()) if (!keep.has(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/socket.io") || url.pathname === "/sw.js") return;
  if (url.searchParams.has("_rsc") || request.headers.get("RSC")) return;

  if (url.pathname.startsWith("/_next/static/")) event.respondWith(fromPhoneFirst(request));
  else if (request.mode === "navigate") event.respondWith(page(event));
  else if (!url.pathname.startsWith("/_next/")) event.respondWith(fromPhoneThenRefresh(request, event));
});

// The app's code and styles: never change under the same name.
async function fromPhoneFirst(request) {
  const cache = await caches.open(STATIC);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache, MAX_STATIC);
  }
  return response;
}

// A page: the network's copy if it comes in time, otherwise the kept one; the network's copy is kept either way.
async function page(event) {
  const { request } = event;
  const cache = await caches.open(PAGES);
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
      await trim(cache, MAX_PAGES);
    }
    return response;
  });
  // Keep the service worker alive until the network's copy is kept, even if the kept one was shown first.
  event.waitUntil(network.catch(() => undefined));
  const kept = await cache.match(request, { ignoreSearch: true });
  if (!kept) return network.catch(() => offline());
  const late = new Promise((resolve) => setTimeout(() => resolve(kept), PAGE_TIMEOUT_MS));
  // A server error is no better than no connection: show the kept copy.
  return Promise.race([network.then((response) => (response.status >= 500 ? kept : response), () => kept), late]);
}

async function fromPhoneThenRefresh(request, event) {
  const cache = await caches.open(FILES);
  const kept = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  });
  if (kept) { event.waitUntil(network.catch(() => undefined)); return kept; }
  return network;
}

// Drops the oldest entries (the cache lists them in the order they were added) beyond `max`.
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

// A page never opened before, with no connection.
function offline() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Salone Playground</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#174b38;color:#f5f4e9;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 16px;color:#cfdccd;max-width:32ch}a{color:#d9ec84}</style></head>
<body><main><h1>No connection</h1><p>This page has not been opened on this phone yet, so it needs a connection the first time. Games you have opened before work without one.</p><a href="/">Back to the games</a></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

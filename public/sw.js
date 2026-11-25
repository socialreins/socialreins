// SocialReins service worker: only an offline fallback for page loads.
// It never stores a page, an API answer or anything the signed-in app shows: the only cached files are the ones listed
// below, which are public and the same for everybody. Every other request goes to the network untouched, because this
// worker does not call respondWith for it.
// Change the cache name whenever PRECACHE changes; old caches are deleted on activate.
const CACHE = "sr-shell-v1";
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

// A new version waits until every open page has closed, so it takes over on the next load.
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE))));

self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sr-") && k !== CACHE).map((k) => caches.delete(k))))
      // Control the page that registered this worker straight away, so the first visit works offline too.
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (e) => {
  const r = e.request;
  // Page loads only (GET): sign-in redirects, forms, uploads, API calls and assets all pass through.
  if (r.mode !== "navigate" || r.method !== "GET") return;
  // Network first. The fallback shows only when the request itself fails, not on a 4xx or 5xx answer.
  e.respondWith(fetch(r).catch(() => caches.match("/offline.html")));
});

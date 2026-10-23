// Service Worker untuk Design-Lokal Prepress Portal (PWA)
const CACHE_NAME = "desainlokal-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/desain-lokal-mark.svg"
];

// Install: Cache aset statis inti
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: Bersihkan cache versi lama & ambil alih client
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Tangani rute dinamis & statis
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Jangan cache API atau permintaan non-GET
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Permintaan navigasi HTML (SPA routing): Network-first dengan fallback ke cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone));
          }
          return response;
        })
        .catch(() => caches.match("/index.html") || caches.match("/"))
    );
    return;
  }

  // Aset statis (JS, CSS, font, image, SVG): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

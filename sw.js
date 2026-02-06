const CACHE = "commit-day-v3"; // <-- меняй версию при обновлениях

const ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(ASSETS);
        self.skipWaiting();
    })());
});

self.addEventListener("activate", (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))));
        self.clients.claim();
    })());
});

// App-shell offline: сперва cache, потом сеть, fallback на index.html
self.addEventListener("fetch", (e) => {
    e.respondWith((async () => {
        const req = e.request;

        // navigation (открытие страниц) — всегда отдаём index.html из кэша офлайн
        if (req.mode === "navigate") {
            const cached = await caches.match("./index.html");
            if (cached) return cached;
        }

        // остальное: cache-first
        const cached = await caches.match(req);
        if (cached) return cached;

        try {
            const res = await fetch(req);
            return res;
        } catch {
            return new Response("", { status: 503, statusText: "Offline" });
        }
    })());
});

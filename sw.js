// Свежий интерфейс после деплоя: сначала сеть, кэш — только запасной вариант.
const CACHE = 'infusion-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      // no-store обходит 10-минутный кэш GitHub Pages и кэш браузера.
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok && response.status === 200 && !response.redirected && response.type === 'basic' && !request.headers.has('range')) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        } catch { /* кэш может быть недоступен или переполнен */ }
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});

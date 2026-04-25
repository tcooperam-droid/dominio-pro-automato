// Service Worker desabilitado em desenvolvimento.
// Este SW se desregistra automaticamente para evitar cache de versões antigas.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      const clients = await self.clients.matchAll();
      await self.registration.unregister();
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});

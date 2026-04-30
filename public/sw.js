// sw.js — Service Worker para Domínio Pro PWA
// Garante que todas as rotas SPA funcionem offline e após background

const CACHE_NAME = "dominio-pro-v1";

// Arquivos essenciais para o shell do app funcionar offline
const SHELL_ASSETS = [
  "/",
  "/index.html",
];

// Instala e faz cache do shell imediatamente
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
});

// Ativa e limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Intercepta requisições
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições externas (Supabase, APIs, etc.)
  if (url.origin !== self.location.origin) return;

  // Ignora requisições de assets com extensão (js, css, png, etc.)
  // Essas são servidas normalmente da rede com cache
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);

  if (hasExtension) {
    // Assets: network first, fallback cache
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Rotas de navegação SPA (/agenda, /financeiro, /clientes, etc.)
  // Sempre serve o index.html — o router do React resolve a rota
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match("/index.html").then((cached) => {
        // Tenta buscar versão atualizada em paralelo
        const networkFetch = fetch("/index.html")
          .then((response) => {
            cache.put("/index.html", response.clone());
            return response;
          })
          .catch(() => null);

        // Serve o cache imediatamente se disponível (evita 404 no background)
        return cached || networkFetch;
      })
    )
  );
});

// Recebe mensagem para forçar update
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

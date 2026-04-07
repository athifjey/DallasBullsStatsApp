const APP_VERSION = '__APP_VERSION__';
const CACHE = `dallas-bulls-${APP_VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/logo.png',
  './assets/team-banner.jpg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Let non-same-origin traffic bypass this worker.
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // Keep HTML and JS fresh on every reload using network-first.
  const isDocument = event.request.mode === 'navigate' || event.request.destination === 'document';
  const isScript = event.request.destination === 'script';

  if (isDocument || isScript) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) {
          return cached;
        }
        return new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Cache-first for static assets (images/icons/etc.).
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      return cached;
    }

    const response = await fetch(event.request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});

self.addEventListener('push', event => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = payload.title || 'Dallas Bulls Stats';
  const body = payload.body || 'A new update is available.';
  const url = payload.url || './index.html';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: './assets/logo.png',
    badge: './assets/logo.png',
    tag: payload.tag || 'dallas-bulls-push',
    data: { url },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const rawUrl = (event.notification.data && event.notification.data.url) || './index.html';
  const normalizedTargetUrl = (() => {
    try {
      const parsed = new URL(rawUrl, self.location.origin);
      if (parsed.origin !== self.location.origin) {
        return './index.html';
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return './index.html';
    }
  })();

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        client.navigate(normalizedTargetUrl);
        return client.focus();
      }
    }

    if (clients.openWindow) {
      return clients.openWindow(normalizedTargetUrl);
    }
    return null;
  })());
});

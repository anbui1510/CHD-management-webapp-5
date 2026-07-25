/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('push', (event: PushEvent) => {
  const fallback = {
    title: 'CHD Management',
    body: 'Bạn có thông báo mới',
    url: '/',
    notificationKey: '',
  };

  let payload = fallback;
  try {
    payload = event.data?.json() ?? fallback;
  } catch {
    payload = {
      ...fallback,
      body: event.data?.text() || fallback.body,
    };
  }

  const options = {
    body: payload.body,
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: payload.notificationKey || 'chd-notification',
    renotify: true,
    data: {
      url: payload.url || '/',
      notificationKey: payload.notificationKey || '',
    },
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(payload.title || fallback.title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = String(event.notification.data?.url || '/');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        const desiredUrl = new URL(targetUrl, self.location.origin).href;
        if ('focus' in client) {
          if ('navigate' in client && typeof (client as WindowClient).navigate === 'function') {
            void (client as WindowClient).navigate(desiredUrl);
            return client.focus();
          }
          client.postMessage({ type: 'CHD_OPEN_URL', url: desiredUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(new URL(targetUrl, self.location.origin).href);
      }
      return undefined;
    })
  );
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

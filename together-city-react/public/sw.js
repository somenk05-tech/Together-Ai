/* Together City service worker — receives Web Push and opens the right chat. */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: 'Together City', body: event.data ? event.data.text() : 'New message' };
  }
  const title = payload.title || 'Together City';
  const conversationId = payload.conversationId || '';
  const options = {
    body: payload.body || 'New message',
    icon: payload.icon || '/favicon.svg',
    badge: '/favicon.svg',
    tag: conversationId ? `chat-${conversationId}` : 'chat',
    renotify: true,
    data: { conversationId },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cid = event.notification.data && event.notification.data.conversationId;
  const url = cid ? `/chats?c=${cid}` : '/chats';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if we have one, else open a new one.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});

/* Together City service worker — receives Web Push and opens what it is about. */

/**
 * A NEW WORKER THAT NEVER ACTIVATES IS A FIX THAT NEVER SHIPS (re-audit,
 * 29 Aug).
 *
 * A fetched service worker installs into the WAITING state and takes over only
 * once every tab and installed PWA window for the origin has closed. Push and
 * notificationclick are delivered to the ACTIVE worker — so the tag and
 * destination fixes below would have reached nobody who already had the old
 * one, which after a first deploy is everybody, and for a phone with the app
 * pinned is close to for ever.
 *
 * `skipWaiting` on install and `clients.claim` on activate is the pair that
 * hands over immediately. It is safe HERE in a way it is not for a worker that
 * caches assets: this one caches nothing and serves no fetches, so there is no
 * old-bundle/new-worker mismatch to create. It only receives pushes and opens
 * a URL, and the newest version of that logic is always the one wanted.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/**
 * TWO THINGS THIS FILE USED TO GET WRONG (fifth audit, 29 Aug).
 *
 * THE TAG. It was `chat-${conversationId}` or, with no conversation, the
 * literal string 'chat'. Everything that is not a chat message — "It's a
 * match! 💫", "You have a new like 💛", "Someone connected to chat 💬", every
 * moderation verdict — is pushed with an empty conversationId, so all of them
 * shared one tag and REPLACED each other on the device. Two arriving while the
 * phone was locked destroyed the first, including the one notification the
 * product exists to send. The server now names the tag; grouping a chat by its
 * conversation is deliberate and stays, everything else is distinct.
 *
 * THE DESTINATION. `cid ? /chats?c=cid : (url || /chats)` put the conversation
 * FIRST, so a dating message — which has a conversation id — opened the CITY
 * Chats route. The dating thread is deliberately stripped from that list, so
 * the peer resolved to undefined and the thread rendered under a broken
 * header. The server had already computed `/dating/chats?c=…` and this threw
 * it away. An explicit url wins now; the conversation is the fallback.
 */
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
    // Server-named. A chat groups by its conversation; anything else is its
    // own notification and must not overwrite the one before it.
    tag: payload.tag || (conversationId ? `chat-${conversationId}` : `city-${Date.now()}`),
    renotify: true,
    data: { conversationId, url: payload.url || '' },
  };
  /* THE DEVICE DECIDES WHETHER IT IS ALREADY LOOKING.
     Suppression used to happen on the server, against one `presence:<userId>`
     key that ANY socket set — so a tab left open on a desk silenced push on the
     phone in your pocket for the whole day, and the toast fired at an
     unattended monitor. The server cannot answer "is this device watching"
     (nothing links a push endpoint to a socket), and the account-wide answer it
     could give failed in the direction that loses the notification. The device
     can answer it, and only for itself: if a window of this app is VISIBLE
     here, the live toast has already carried the news and a second copy is the
     same news twice. Every other device still gets its push. */
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const watching = clients.some((c) => c.visibilityState === 'visible');
      if (watching) return undefined;
      return self.registration.showNotification(title, options);
    }).catch(() => self.registration.showNotification(title, options)),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cid = event.notification.data && event.notification.data.conversationId;
  const direct = event.notification.data && event.notification.data.url;
  // The url the server chose, then the conversation, then the chats list.
  const url = direct || (cid ? `/chats?c=${cid}` : '/chats');
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

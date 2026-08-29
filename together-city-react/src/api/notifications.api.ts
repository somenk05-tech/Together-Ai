import { z } from 'zod';
import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './http';
import { NotificationSchema, type NotificationItem } from './schemas';
import { socketClient } from './socket';
import { WS } from './events';
import { useAuthed } from '@/store/useAuthed';

/** One page of the bell. See useNotifications for why the page is 50. */
export const NOTIFICATION_PAGE = 50;

export const notificationsApi = {
  /**
   * `cursor` is the `createdAt` AND `id` of the last item you already hold;
   * absent means the newest. Both halves, because two notifications can share
   * a millisecond and a timestamp-only cursor skips the second of them
   * permanently — which is the same unreachable row this paging was added to
   * remove (re-audit, 29 Aug).
   *
   * A full page is how you know there may be another. The response is a plain
   * array, deliberately: web and API deploy independently, and changing this
   * shape would break every older client for a paging feature.
   */
  list: (cursor?: { createdAt: string; id: string }, limit = NOTIFICATION_PAGE): Promise<NotificationItem[]> =>
    apiGet('/notifications', z.array(NotificationSchema), {
      params: {
        limit: String(limit),
        ...(cursor ? { cursor: cursor.createdAt, cursorId: cursor.id } : {}),
      },
    }),
  unreadCount: (): Promise<number> => apiGet('/notifications/unread-count', z.object({ count: z.number() })).then((r) => r.count),
  markRead: (id: string): Promise<void> => apiPost(`/notifications/${id}/read`, {}, z.object({ ok: z.boolean() })).then(() => undefined),
  markAllRead: (): Promise<void> => apiPost('/notifications/read-all', {}, z.object({ ok: z.boolean() })).then(() => undefined),
};

const LIST_KEY = ['notifications'] as const;
const COUNT_KEY = ['notifications', 'unread'] as const;
/** The Notifications page's paged read. A SIBLING of LIST_KEY rather than a
 *  child, so a bell invalidation does not refetch every page it holds. */
const PAGED_KEY = ['notifications-paged'] as const;
/** Everything a change to one notification has to refresh. */
const ALL_KEYS = [LIST_KEY, PAGED_KEY, COUNT_KEY];

export function useNotifications() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => notificationsApi.list() });
}

/**
 * THE REST OF THE BELL, WHICH HAD NO DOOR (fifth audit, 29 Aug).
 *
 * The service took a limit, the controller passed none, and the route offered
 * nothing else — so notification 51 was unreachable for the life of the
 * account. Keyset paging, not offset: notifications arrive while you are
 * reading them, and an offset page shifts under new rows.
 *
 * A SEPARATE HOOK rather than a change to `useNotifications`, because the
 * header reads that one on every screen and must stay one small request.
 */
export function useNotificationPages() {
  return useInfiniteQuery({
    /* NOT A CHILD OF LIST_KEY. `invalidateQueries({ queryKey: LIST_KEY })`
       prefix-matches, so `['notifications','paged']` was being refetched by
       every bell invalidation — including the one `useNotificationSync` fires
       for each arriving chat message — and an infinite query refetches all of
       its loaded pages. A sibling key, invalidated deliberately below.
       (re-audit, 29 Aug) */
    queryKey: PAGED_KEY,
    initialPageParam: undefined as { createdAt: string; id: string } | undefined,
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    // A short page is the end. A full one only means there MIGHT be more, which
    // is the honest thing a cursor can say without a second query.
    getNextPageParam: (last: NotificationItem[]) => {
      if (last.length < NOTIFICATION_PAGE) return undefined;
      const tail = last[last.length - 1];
      return tail ? { createdAt: tail.createdAt, id: tail.id } : undefined;
    },
    /* A CEILING ON THE REFETCH, because invalidation reloads EVERY loaded page
       of an infinite query, and `useNotificationSync` invalidates on every
       incoming chat message. Five pages is 250 notifications — past anything
       anybody scrolls — and it bounds one message to five requests rather than
       to however far somebody happened to scroll. */
    maxPages: 5,
  });
}
export function useUnreadNotificationCount() {
  // Same reason as chat and connections: the header badge mounts everywhere,
  // and a signed-out visitor has no unread anything. See useAuthed.
  const authed = useAuthed();
  return useQuery({ queryKey: COUNT_KEY, queryFn: () => notificationsApi.unreadCount(), enabled: authed, refetchInterval: 60_000 });
}
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      for (const key of ALL_KEYS) void qc.invalidateQueries({ queryKey: key });
    },
  });
}
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    // Optimistically zero the unread count (and clear the list highlights) so the
    // header badge vanishes the instant the Alerts panel is opened, before the
    // server round-trip. Rolls back on error.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: COUNT_KEY });
      const prevCount = qc.getQueryData<number>(COUNT_KEY);
      const prevList = qc.getQueryData<NotificationItem[]>(LIST_KEY);
      /* AND THE PAGED CACHE, which is what the Notifications page renders.
         The optimistic update was written for a flat list and kept writing to
         that key alone after the page moved to an infinite query — so the one
         screen the button lives on stopped clearing until the refetch landed
         (re-audit, 29 Aug). `getQueryData`/`setQueryData` are exact-key, so
         each cache is written in its own shape. */
      const prevPaged = qc.getQueryData<{ pages: NotificationItem[][]; pageParams: unknown[] }>(PAGED_KEY);
      qc.setQueryData<number>(COUNT_KEY, 0);
      if (prevList) qc.setQueryData<NotificationItem[]>(LIST_KEY, prevList.map((n) => ({ ...n, read: true })));
      if (prevPaged) {
        qc.setQueryData(PAGED_KEY, {
          ...prevPaged,
          pages: prevPaged.pages.map((page) => page.map((n) => ({ ...n, read: true }))),
        });
      }
      return { prevCount, prevList, prevPaged };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevCount !== undefined) qc.setQueryData(COUNT_KEY, ctx.prevCount);
      if (ctx?.prevList !== undefined) qc.setQueryData(LIST_KEY, ctx.prevList);
      if (ctx?.prevPaged !== undefined) qc.setQueryData(PAGED_KEY, ctx.prevPaged);
    },
    onSettled: () => {
      for (const key of ALL_KEYS) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Live notification sync: when the backend pushes a new notification (or an
 * updated unread count), refresh the bell + the Notifications page so nothing
 * needs a manual reload. Also fires `onNew` so the app can show a toast.
 */
export function useNotificationSync(onNew?: (n: NotificationItem) => void): void {
  const qc = useQueryClient();
  useEffect(() => {
    const offNew = socketClient.on<NotificationItem>(WS.NOTIFICATION_NEW, (n) => {
      /* The header's small read and the count, always. The PAGED cache is
         refreshed lazily instead — it is only mounted on the Notifications
         screen, and this event fires for every arriving chat message, so
         reloading every page a citizen has scrolled to on each one is a lot of
         requests for a screen that already shows the newest at the top. */
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      void qc.invalidateQueries({ queryKey: COUNT_KEY });
      void qc.invalidateQueries({ queryKey: PAGED_KEY, refetchType: 'active' });
      onNew?.(n);
    });
    const offCount = socketClient.on(WS.NOTIFICATION_COUNT, () => {
      void qc.invalidateQueries({ queryKey: COUNT_KEY });
    });
    return () => { offNew(); offCount(); };
  }, [qc, onNew]);
}

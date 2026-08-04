import { z } from 'zod';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './http';
import { NotificationSchema, type NotificationItem } from './schemas';
import { socketClient } from './socket';
import { WS } from './events';
import { useAuthed } from '@/store/useAuthed';

export const notificationsApi = {
  list: (): Promise<NotificationItem[]> => apiGet('/notifications', z.array(NotificationSchema)),
  unreadCount: (): Promise<number> => apiGet('/notifications/unread-count', z.object({ count: z.number() })).then((r) => r.count),
  markRead: (id: string): Promise<void> => apiPost(`/notifications/${id}/read`, {}, z.object({ ok: z.boolean() })).then(() => undefined),
  markAllRead: (): Promise<void> => apiPost('/notifications/read-all', {}, z.object({ ok: z.boolean() })).then(() => undefined),
};

const LIST_KEY = ['notifications'] as const;
const COUNT_KEY = ['notifications', 'unread'] as const;

export function useNotifications() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => notificationsApi.list() });
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
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      void qc.invalidateQueries({ queryKey: COUNT_KEY });
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
      qc.setQueryData<number>(COUNT_KEY, 0);
      if (prevList) qc.setQueryData<NotificationItem[]>(LIST_KEY, prevList.map((n) => ({ ...n, read: true })));
      return { prevCount, prevList };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevCount !== undefined) qc.setQueryData(COUNT_KEY, ctx.prevCount);
      if (ctx?.prevList !== undefined) qc.setQueryData(LIST_KEY, ctx.prevList);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      void qc.invalidateQueries({ queryKey: COUNT_KEY });
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
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      void qc.invalidateQueries({ queryKey: COUNT_KEY });
      onNew?.(n);
    });
    const offCount = socketClient.on(WS.NOTIFICATION_COUNT, () => {
      void qc.invalidateQueries({ queryKey: COUNT_KEY });
    });
    return () => { offNew(); offCount(); };
  }, [qc, onNew]);
}

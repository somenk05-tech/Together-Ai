import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './http';
import { NotificationSchema, type NotificationItem } from './schemas';

export const notificationsApi = {
  list: (): Promise<NotificationItem[]> => apiGet('/notifications', z.array(NotificationSchema)),
  markRead: (id: string): Promise<void> => apiPost(`/notifications/${id}/read`, {}, z.void()),
};

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => notificationsApi.list() });
}
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

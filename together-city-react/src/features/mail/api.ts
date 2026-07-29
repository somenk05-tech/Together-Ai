import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Folder = 'inbox' | 'sent' | 'starred' | 'trash';

export interface MailAccount {
  address: string; primaryEmail: string | null; phone: string | null;
  quotaBytes: number; usedBytes: number; usedPct: number;
  counts: { inbox: number; inboxUnread: number; sent: number; starred: number; trash: number; emailed: number };
}
export interface OutboxEntry {
  id: string; channel: 'email' | 'sms'; to: string | null; kind: string; subject: string;
  provider: string; providerMessageId: string | null; status: string; createdAt: string;
}
export interface MailItem {
  id: string; fromAddr: string; fromName: string; toAddr: string; toName: string;
  subject: string; snippet: string; sizeBytes: number; read: boolean; starred: boolean;
  system: boolean; folder: string; threadId?: string | null; createdAt: string;
}
export interface MailMessage extends MailItem { body: string }
export interface DirectoryEntry { handle: string; name: string; address: string }

export const mailApi = {
  account: () => api.get<MailAccount>('/mail/account').then((r) => r.data),
  directory: () => api.get<DirectoryEntry[]>('/mail/directory').then((r) => r.data),
  list: (folder: Folder) => api.get<MailItem[]>('/mail', { params: { folder } }).then((r) => r.data),
  get: (id: string) => api.get<MailMessage>(`/mail/${id}`).then((r) => r.data),
  thread: (threadId: string) => api.get<MailMessage[]>(`/mail/thread/${threadId}`).then((r) => r.data),
  send: (input: { to: string; subject: string; body: string; threadId?: string; attachmentFileIds?: string[] }) => api.post<MailItem[]>('/mail/send', input).then((r) => r.data),
  threadAttachments: (threadId: string) =>
    api.get<{ items: Array<{ id: string; name: string; mimeType: string | null; sizeBytes: number }> }>(`/mail/thread/${threadId}/attachments`).then((r) => r.data),
  attachmentUrl: (threadId: string, fileId: string) =>
    api.get<{ url: string; name: string }>(`/mail/thread/${threadId}/attachments/${fileId}/url`).then((r) => r.data),
  flag: (id: string, input: { starred?: boolean; read?: boolean }) => api.post(`/mail/${id}/flag`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/mail/${id}`).then((r) => r.data),
  outbox: () => api.get<OutboxEntry[]>('/mail/outbox').then((r) => r.data),
  setPrimary: (input: { email?: string; phone?: string }) => api.post<MailAccount>('/mail/primary', input).then((r) => r.data),
};

export function useMailAccount() {
  return useQuery({ queryKey: ['mail', 'account'], queryFn: () => mailApi.account() });
}
export function useOutbox() {
  return useQuery({ queryKey: ['mail', 'outbox'], queryFn: () => mailApi.outbox() });
}
export function useSetPrimary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email?: string; phone?: string }) => mailApi.setPrimary(v),
    onSuccess: (acct) => { qc.setQueryData(['mail', 'account'], acct); },
  });
}
export function useDirectory() {
  return useQuery({ queryKey: ['mail', 'directory'], queryFn: () => mailApi.directory() });
}
export function useMailList(folder: Folder) {
  return useQuery({ queryKey: ['mail', 'list', folder], queryFn: () => mailApi.list(folder) });
}
export function useMailMessage(id: string) {
  return useQuery({ queryKey: ['mail', 'msg', id], queryFn: () => mailApi.get(id), enabled: !!id });
}
export function useMailThread(threadId?: string | null) {
  return useQuery({
    queryKey: ['mail', 'thread', threadId],
    queryFn: () => mailApi.thread(threadId as string),
    enabled: !!threadId,
  });
}
export function useSendMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { to: string; subject: string; body: string; threadId?: string; attachmentFileIds?: string[] }) => mailApi.send(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mail'] }); },
  });
}
export function useFlagMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; starred?: boolean; read?: boolean }) => mailApi.flag(v.id, { starred: v.starred, read: v.read }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mail'] }); },
  });
}
export function useRemoveMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mailApi.remove(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mail'] }); },
  });
}

export const humanBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB']; let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
};
export const mailTime = (iso: string): string => {
  const d = new Date(iso); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
export const initials = (name: string): string => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const avatarHue = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };

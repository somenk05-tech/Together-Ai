import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * `failed` is new (p21, FE-14.1). Sent used to mean "we tried" — a message the
 * provider refused was written to Sent before dispatch and left there, so the
 * sender got an error and a Sent copy of the same message.
 */
/**
 * `unsent` is one room holding drafts AND failed mail: two states, one
 * question — what is still waiting on me? `draft` and `failed` remain
 * addressable on their own for counts and the retry path.
 */
export type Folder = 'inbox' | 'sent' | 'draft' | 'failed' | 'unsent' | 'starred' | 'trash';

export interface MailAccount {
  address: string; primaryEmail: string | null; phone: string | null;
  quotaBytes: number; usedBytes: number; usedPct: number;
  counts: { inbox: number; inboxUnread: number; sent: number; draft: number; failed: number; unsent: number; starred: number; trash: number; emailed: number };
}
export interface OutboxEntry {
  id: string; channel: 'email' | 'sms'; to: string | null; kind: string; subject: string;
  provider: string; providerMessageId: string | null; status: string; createdAt: string;
}
export interface MailItem {
  id: string; fromAddr: string; fromName: string; toAddr: string; toName: string;
  /** Openly copied — shown to every reader. */
  ccAddrs?: string | null;
  /** Blind-copied. Only ever present on your own Sent copy. */
  bccAddrs?: string | null;
  subject: string; snippet: string; sizeBytes: number; read: boolean; starred: boolean;
  system: boolean; folder: string; threadId?: string | null; createdAt: string;
  /** Why the provider refused it, in its own words. Null on anything in Sent. */
  failureReason?: string | null;
  /** The project this conversation is filed under, or null for All Email.
   *  Carried on every row so a list can draw the chip without a second ask. */
  projectId?: string | null;
}

/**
 * A ROOM INSIDE THE MAILBOX.
 *
 * `total` excludes Trash, `unread` counts the project's Inbox, and `last` is
 * what the card says happened most recently — who, which way round, and when.
 * `address` is present only when the citizen switched the sub-address on,
 * because an address nobody has turned on is not one they can hand out.
 */
export interface MailProject {
  id: string; name: string; key: string;
  subAddress: boolean; address: string | null; archived: boolean;
  createdAt: string; total: number; unread: number;
  last: { who: string; outbound: boolean; at: string } | null;
}

/** Fifty per citizen, counted out loud from the first one rather than sprung
 *  at the limit. Mirrors PROJECT_CAP in the API's mail dto. */
export const PROJECT_CAP = 50;
export interface MailMessage extends MailItem { body: string }
export interface DirectoryEntry { handle: string; name: string; address: string }

export const mailApi = {
  account: () => api.get<MailAccount>('/mail/account').then((r) => r.data),
  directory: () => api.get<DirectoryEntry[]>('/mail/directory').then((r) => r.data),
  list: (folder: Folder, q?: string, project?: string) =>
    api.get<MailItem[]>('/mail', {
      params: { folder, ...(q ? { q } : {}), ...(project ? { project } : {}) },
    }).then((r) => r.data),
  projects: () => api.get<MailProject[]>('/mail/projects').then((r) => r.data),
  createProject: (input: { name: string; key: string; subAddress: boolean }) =>
    api.post<{ projects: MailProject[]; created: string }>('/mail/projects', input).then((r) => r.data),
  updateProject: (id: string, input: { name?: string; subAddress?: boolean; archived?: boolean }) =>
    api.post<MailProject[]>(`/mail/projects/${id}`, input).then((r) => r.data),
  deleteProject: (id: string) =>
    api.delete<{ ok: boolean; released: number; projects: MailProject[] }>(`/mail/projects/${id}`).then((r) => r.data),
  /** Move a whole conversation into a project, or out of one (null). */
  fileThread: (input: { threadId: string; projectId: string | null }) =>
    api.post<{ ok: boolean; moved: number }>('/mail/file', input).then((r) => r.data),
  get: (id: string) => api.get<MailMessage>(`/mail/${id}`).then((r) => r.data),
  thread: (threadId: string) => api.get<MailMessage[]>(`/mail/thread/${threadId}`).then((r) => r.data),
  send: (input: { to: string; cc?: string[]; bcc?: string[]; subject: string; body: string; threadId?: string; attachmentFileIds?: string[]; draftId?: string; projectId?: string }) =>
    api.post<MailItem[]>('/mail/send', input).then((r) => r.data),
  saveDraft: (input: { id?: string; to: string; subject: string; body: string; threadId?: string }) =>
    api.post<MailMessage>('/mail/draft', input).then((r) => r.data),
  discardDraft: (id: string) => api.delete<MailItem[]>(`/mail/draft/${id}`).then((r) => r.data),
  retry: (id: string) => api.post<MailItem[]>(`/mail/${id}/retry`, {}).then((r) => r.data),
  threadAttachments: (threadId: string) =>
    api.get<{ items: Array<{ id: string; name: string; mimeType: string | null; sizeBytes: number }> }>(`/mail/thread/${threadId}/attachments`).then((r) => r.data),
  attachmentUrl: (threadId: string, fileId: string) =>
    api.get<{ url: string; name: string }>(`/mail/thread/${threadId}/attachments/${fileId}/url`).then((r) => r.data),
  flag: (id: string, input: { starred?: boolean; read?: boolean }) => api.post<{ ok: boolean }>(`/mail/${id}/flag`, input).then((r) => r.data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/mail/${id}`).then((r) => r.data),
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
export function useMailProjects() {
  return useQuery({ queryKey: ['mail', 'projects'], queryFn: () => mailApi.projects() });
}
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; key: string; subAddress: boolean }) => mailApi.createProject(v),
    onSuccess: (r) => { qc.setQueryData(['mail', 'projects'], r.projects); },
  });
}
export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name?: string; subAddress?: boolean; archived?: boolean }) =>
      mailApi.updateProject(v.id, { name: v.name, subAddress: v.subAddress, archived: v.archived }),
    onSuccess: (projects) => { qc.setQueryData(['mail', 'projects'], projects); },
  });
}
/** Closes the room. The mail returns to All Email — `released` says how much,
 *  so the client can state it rather than leave somebody guessing. */
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mailApi.deleteProject(id),
    onSuccess: (r) => { qc.setQueryData(['mail', 'projects'], r.projects); void qc.invalidateQueries({ queryKey: ['mail', 'list'] }); },
  });
}
/** Move a conversation into a project, or out of one. Invalidates every list:
 *  the thread leaves one scoped mailbox and appears in another, and the chip
 *  in All Email changes on the same move. */
export function useFileThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { threadId: string; projectId: string | null }) => mailApi.fileThread(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mail'] }); },
  });
}

export function useMailList(folder: Folder, q?: string, project?: string) {
  const needle = (q ?? '').trim();
  return useQuery({
    // The needle is part of the key, so a search is a cache entry rather than a
    // refetch of the folder — clearing the box shows the folder again instantly
    // and going back to a search does not re-ask.
    queryKey: ['mail', 'list', folder, needle, project ?? ''],
    queryFn: () => mailApi.list(folder, needle || undefined, project),
    // A folder rendered while somebody is still typing is a list flickering
    // under their hands. The page debounces before it changes this argument;
    // holding the previous rows meanwhile keeps the screen still.
    placeholderData: (prev) => prev,
  });
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
    mutationFn: (v: { to: string; cc?: string[]; bcc?: string[]; subject: string; body: string; threadId?: string; attachmentFileIds?: string[]; draftId?: string; projectId?: string }) => mailApi.send(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mail'] }); },
  });
}

/**
 * Autosave. Deliberately NOT invalidating the mail queries on every keystroke —
 * a folder list refetching while somebody types is work nobody asked for, and
 * the composer already holds the only copy that matters. The Unsent folder
 * refetches when it is next opened.
 */
export function useSaveDraft() {
  return useMutation({
    mutationFn: (v: { id?: string; to: string; subject: string; body: string; threadId?: string }) => mailApi.saveDraft(v),
  });
}
export function useDiscardDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mailApi.discardDraft(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mail'] }); },
  });
}
export function useRetryMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mailApi.retry(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mail'] });
    },
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

/** The password is held by the Dev page and sent as a header, never stored. */
const withPassword = (password: string) => ({ headers: { 'x-dev-password': password } });

export type ChannelKey = 'youtube' | 'instagram' | 'threads' | 'tv';
export type PlatformKey = Exclude<ChannelKey, 'tv'>;
export type TopicKey = 'dating' | 'health' | 'fitness' | 'pets' | 'astrology' | 'world';

export interface ChannelState {
  key: ChannelKey;
  label: string;
  /** Every app variable is set, so Connect can work. */
  configured: boolean;
  /** The names that are not — never a value, never a length. */
  missing: string[];
  obtain: string[];
  limit: string;
}
export interface TopicInfo { key: TopicKey; label: string; hubPath: string; hashtags: string[]; disclaimer: string | null }
export interface AccountState {
  platform: PlatformKey;
  topic: TopicKey;
  /** Who the slot is for: the channel handle or @username. */
  expected: string;
  connected: boolean;
  handle: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
}
export interface DeskState { channels: ChannelState[]; topics: TopicInfo[]; accounts: AccountState[] }

export interface MediaTarget {
  id: string;
  channel: ChannelKey;
  state: 'pending' | 'skipped' | 'publishing' | 'posted' | 'failed';
  skipReason: string | null;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
  notice: string | null;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
}
export interface MediaPost {
  id: string;
  topic: TopicKey;
  title: string | null;
  caption: string;
  privacy: string;
  tvPostId: string | null;
  state: 'draft' | 'publishing' | 'done' | 'failed';
  createdAt: string;
  updatedAt: string;
  targets: MediaTarget[];
}
export interface Draft { title: string; description: string; tags: string[]; caption: string; threadsText: string }
export interface NewVideo extends Draft {
  topic: TopicKey;
  storageKey: string;
  note?: string;
  privacy: 'public' | 'unlisted' | 'private';
  aiDisclosure: boolean;
  channels: ChannelKey[];
  publish: boolean;
}

export const mediaApi = {
  desk: (password: string) =>
    api.get<DeskState>('/dev/media/channels', withPassword(password)).then((r) => r.data),
  list: (password: string) =>
    api.get<MediaPost[]>('/dev/media', withPassword(password)).then((r) => r.data),
  suggest: (password: string, body: { topic: TopicKey; note: string; fileName: string }) =>
    api.post<Draft>('/dev/media/suggest', body, withPassword(password)).then((r) => r.data),
  create: (password: string, body: NewVideo) =>
    api.post<MediaPost>('/dev/media', body, withPassword(password)).then((r) => r.data),
  publish: (password: string, id: string) =>
    api.post<MediaPost>(`/dev/media/${id}/publish`, {}, withPassword(password)).then((r) => r.data),
  retry: (password: string, id: string, channelKey: string) =>
    api.post<MediaPost>(`/dev/media/${id}/retry/${channelKey}`, {}, withPassword(password)).then((r) => r.data),
  remove: (password: string, id: string) =>
    api.delete<{ removed: string }>(`/dev/media/${id}`, withPassword(password)).then((r) => r.data),
  connect: (password: string, platform: PlatformKey, topic: TopicKey) =>
    api.post<{ url: string }>('/dev/media/connect', { platform, topic }, withPassword(password)).then((r) => r.data),
  finish: (password: string, code: string, state: string) =>
    api.post<AccountState>('/dev/media/connect/finish', { code, state }, withPassword(password)).then((r) => r.data),
  disconnect: (password: string, platform: PlatformKey, topic: TopicKey) =>
    api.delete<{ connected: false }>(`/dev/media/accounts/${platform}/${topic}`, withPassword(password)).then((r) => r.data),
};

export function useDesk(password: string | null) {
  return useQuery({
    queryKey: ['dev', 'media', 'desk'],
    queryFn: () => mediaApi.desk(password as string),
    enabled: Boolean(password),
    retry: false,
  });
}

/** Re-read every 15 seconds while anything is still going out. */
export function useMediaPosts(password: string | null) {
  return useQuery({
    queryKey: ['dev', 'media', 'posts'],
    queryFn: () => mediaApi.list(password as string),
    enabled: Boolean(password),
    retry: false,
    refetchInterval: (q) => (q.state.data?.some((p) => p.state === 'publishing') ? 15_000 : false),
  });
}

export function useMediaAction(password: string | null) {
  const qc = useQueryClient();
  const done = () => { void qc.invalidateQueries({ queryKey: ['dev', 'media'] }); };
  const pw = password as string;
  return {
    create: useMutation({ mutationFn: (b: NewVideo) => mediaApi.create(pw, b), onSuccess: done }),
    publish: useMutation({ mutationFn: (id: string) => mediaApi.publish(pw, id), onSuccess: done }),
    retry: useMutation({ mutationFn: (v: { id: string; channel: string }) => mediaApi.retry(pw, v.id, v.channel), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => mediaApi.remove(pw, id), onSuccess: done }),
    disconnect: useMutation({ mutationFn: (v: { platform: PlatformKey; topic: TopicKey }) => mediaApi.disconnect(pw, v.platform, v.topic), onSuccess: done }),
    finish: useMutation({ mutationFn: (v: { code: string; state: string }) => mediaApi.finish(pw, v.code, v.state), onSuccess: done }),
  };
}

/** What the pop-up page posts back to the desk. */
export interface SignInMessage { type: 'tc-social-signin'; code: string | null; state: string | null; error: string | null }
export const SIGNIN_MESSAGE = 'tc-social-signin';

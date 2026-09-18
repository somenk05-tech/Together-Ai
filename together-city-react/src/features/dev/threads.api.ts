import { useMutation, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';
import type { TopicKey } from './media.api';

/**
 * ── THE THREADS DESK, AS THE PAGE CALLS IT (owner, 18 Sep) ──────────────────
 * Text only, one topic at a time. Both routes are behind the page password,
 * like the rest of /dev.
 */
const withPassword = (password: string) => ({ headers: { 'x-dev-password': password } });

/** Threads takes 500 characters; the first post keeps room for the hub link. */
export const THREADS_LIMIT = 500;
export const LINK_ROOM = 60;

export interface ThreadDraft { text: string; followUps: string[] }
export interface ThreadInput {
  topic: TopicKey;
  text: string;
  followUps: string[];
  hubLink: boolean;
  note?: string;
}
export interface ThreadPosted {
  id: string;
  url: string;
  posted: number;
  of: number;
  notice: string | null;
  topic: string;
  handle: string;
}

export const threadsApi = {
  suggest: (password: string, body: { topic: TopicKey; note: string }) =>
    api.post<ThreadDraft>('/dev/media/threads/suggest', body, withPassword(password)).then((r) => r.data),
  post: (password: string, body: ThreadInput) =>
    api.post<ThreadPosted>('/dev/media/threads', body, withPassword(password)).then((r) => r.data),
};

export function usePostThread(password: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ThreadInput) => threadsApi.post(password, body),
    onSuccess: () => {
      /* It is a post like any other: the desk list and the analytics both
         count it, so both are asked again. */
      void qc.invalidateQueries({ queryKey: ['dev', 'media'] });
      void qc.invalidateQueries({ queryKey: ['dev', 'analytics'] });
    },
  });
}

import { http as api } from '@/api/client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Thought {
  id: string;
  title: string | null;
  body: string;
  mood: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
export interface ThoughtPage { items: Thought[]; nextCursor: string | null }

export interface ThoughtInput {
  title?: string;
  body: string;
  mood?: string;
  tags?: string[];
}

/**
 * What a PATCH may carry. Mirrors UpdateThoughtSchema: title and mood are
 * NULLABLE here and not on create, because clearing a title is a thing you can
 * do to a thought that already has one. Sending undefined would leave the old
 * value in place, which is the difference between "I didn't touch it" and "I
 * want it gone" — the schema draws that line and so does this type.
 */
export interface ThoughtUpdate {
  title?: string | null;
  body?: string;
  mood?: string | null;
  tags?: string[];
}

/** Mirrors dto/thoughts.dto.ts. Kept here so the form can stop you before the
 *  server has to, and so the two limits are visibly the same number. */
export const TAG_MAX = 8;
export const TAG_LEN = 24;

export const thoughtsApi = {
  list: (q?: string, cursor?: string) =>
    api.get<ThoughtPage>('/thoughts', {
      params: { ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) },
    }).then((r) => r.data),
  create: (input: ThoughtInput) => api.post<Thought>('/thoughts', input).then((r) => r.data),
  update: (id: string, input: ThoughtUpdate) => api.patch<Thought>(`/thoughts/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete<{ ok: true }>(`/thoughts/${id}`).then((r) => r.data),
};

const KEY = ['thoughts'];

/**
 * The journal as an INFINITE query, so "show more" reaches past the first page.
 *
 * It was a plain useQuery that read `items` and dropped `nextCursor`, so a
 * journal stopped at twenty entries and said nothing about the rest. The same
 * bug was found and fixed in the social feed (`social/api.ts useFeed`); this is
 * the other place it was living, and it mattered more here — a feed you have
 * scrolled past is gone anyway, but the twenty-first thing you ever wrote down
 * is yours and it was simply not on the page.
 */
export function useThoughts(q?: string) {
  return useInfiniteQuery({
    queryKey: [...KEY, q ?? ''],
    queryFn: ({ pageParam }) => thoughtsApi.list(q, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
export function useCreateThought() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ThoughtInput) => thoughtsApi.create(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
export function useUpdateThought() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; input: ThoughtUpdate }) => thoughtsApi.update(v.id, v.input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
export function useDeleteThought() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => thoughtsApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export const thoughtsApi = {
  list: (q?: string) =>
    api.get<ThoughtPage>('/thoughts', { params: q ? { q } : undefined }).then((r) => r.data),
  create: (input: ThoughtInput) => api.post<Thought>('/thoughts', input).then((r) => r.data),
  update: (id: string, input: Partial<ThoughtInput>) => api.patch<Thought>(`/thoughts/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete<{ ok: true }>(`/thoughts/${id}`).then((r) => r.data),
};

const KEY = ['thoughts'];

export function useThoughts(q?: string) {
  return useQuery({ queryKey: [...KEY, q ?? ''], queryFn: () => thoughtsApi.list(q) });
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
    mutationFn: (v: { id: string; input: Partial<ThoughtInput> }) => thoughtsApi.update(v.id, v.input),
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

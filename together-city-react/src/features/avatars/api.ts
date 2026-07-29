import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Mirrors the backend catalogue. The server is the source of truth — this type
 *  is deliberately loose so a new option appears in the picker without a
 *  frontend release. */
export type AvatarInputs = Record<string, string>;

export interface AvatarOptions {
  skinTone: string[];
  hairStyle: string[];
  hairColour: string[];
  eyeColour: string[];
  facialHair: string[];
  accessory: string[];
  expression: string[];
  background: string[];
  defaults: AvatarInputs;
  /** 'deterministic' — drawn from the choices; 'ai' — a model made it. */
  generatedBy: 'deterministic' | 'ai';
  provider: string;
  /** False when a live preview would cost money. The picker must respect it. */
  previewable: boolean;
}

export interface Avatar {
  id: string;
  status: 'queued' | 'ready' | 'failed';
  inputs: AvatarInputs;
  isSelected: boolean;
  error: string | null;
  generatedBy: 'deterministic' | 'ai';
  createdAt: string;
}

export interface AvatarAsset {
  url: string;
  expiresInSec: number | null;
  generatedBy: string;
}

export const avatarsApi = {
  options: () => api.get<AvatarOptions>('/avatars/options').then((r) => r.data),
  list: () => api.get<Avatar[]>('/avatars').then((r) => r.data),
  preview: (inputs: AvatarInputs) =>
    api.post<{ dataUrl: string; generatedBy: string }>('/avatars/preview', inputs).then((r) => r.data),
  create: (inputs: AvatarInputs) => api.post<Avatar>('/avatars', inputs).then((r) => r.data),
  asset: (id: string) => api.get<AvatarAsset>(`/avatars/${id}/asset`).then((r) => r.data),
  select: (id: string) => api.post<Avatar>(`/avatars/${id}/select`, {}).then((r) => r.data),
  deselect: () => api.post<{ ok: true }>('/avatars/deselect', {}).then((r) => r.data),
  remove: (id: string) => api.delete<{ ok: true }>(`/avatars/${id}`).then((r) => r.data),
};

const KEY = ['avatars'];

export function useAvatarOptions() {
  // The catalogue changes on deploy, not during a session.
  return useQuery({ queryKey: [...KEY, 'options'], queryFn: avatarsApi.options, staleTime: 60 * 60 * 1000 });
}

export function useAvatars() {
  return useQuery({ queryKey: KEY, queryFn: avatarsApi.list });
}

/** The picture for one saved avatar. Signed links expire, so this refetches. */
export function useAvatarAsset(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'asset', id],
    queryFn: () => avatarsApi.asset(id as string),
    enabled: Boolean(id),
    staleTime: 4 * 60 * 1000,
  });
}

/**
 * The live preview.
 *
 * Keyed by the choices themselves, so flipping back to an earlier combination
 * is instant and costs no request at all — and `enabled` honours the server's
 * `previewable`, which will be false the day a paid model is behind this.
 */
export function useAvatarPreview(inputs: AvatarInputs, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'preview', inputs],
    queryFn: () => avatarsApi.preview(inputs),
    enabled,
    staleTime: Infinity,
  });
}

export function useCreateAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inputs: AvatarInputs) => avatarsApi.create(inputs),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
export function useSelectAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => avatarsApi.select(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
export function useDeselectAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => avatarsApi.deselect(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
export function useDeleteAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => avatarsApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

import { http as api } from '@/api/client';
import { useMutation, useQuery } from '@tanstack/react-query';

export type CallType = 'audio' | 'video' | 'avatar';
export type CallStatus = 'ringing' | 'active' | 'ended';

export interface CallParticipant {
  userId: string;
  role: 'caller' | 'callee';
  joinedAt: string | null;
  leftAt: string | null;
  present: boolean;
}

export interface Call {
  id: string;
  conversationId: string;
  createdById: string;
  type: CallType;
  status: CallStatus;
  avatarId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  endedReason: 'completed' | 'declined' | 'missed' | 'cancelled' | null;
  durationSeconds: number | null;
  createdAt: string;
  participants: CallParticipant[];
}

export interface IceConfig {
  iceServers: RTCIceServer[];
  /** False when no TURN relay is configured — some networks will never connect. */
  relayAvailable: boolean;
  /** Plain-language explanation to show the citizen when something is missing. */
  note: string | null;
}

export const callsApi = {
  ice: () => api.get<IceConfig>('/calls/ice').then((r) => r.data),
  get: (id: string) => api.get<Call>(`/calls/${id}`).then((r) => r.data),
  history: (conversationId?: string) =>
    api.get<Call[]>('/calls', { params: conversationId ? { conversationId } : undefined }).then((r) => r.data),
  start: (conversationId: string, type: CallType, avatarId?: string) =>
    api.post<Call>('/calls', { conversationId, type, ...(avatarId ? { avatarId } : {}) }).then((r) => r.data),
  join: (id: string) => api.post<Call>(`/calls/${id}/join`, {}).then((r) => r.data),
  leave: (id: string) => api.post<Call>(`/calls/${id}/leave`, {}).then((r) => r.data),
  end: (id: string) => api.post<Call>(`/calls/${id}/end`, {}).then((r) => r.data),
};

/** Fetched once and reused: a rotated TURN credential matters, but not within
 *  the seconds a call takes to set up. */
export function useIceConfig() {
  return useQuery({ queryKey: ['calls', 'ice'], queryFn: callsApi.ice, staleTime: 10 * 60 * 1000 });
}

export function useCallHistory(conversationId?: string) {
  return useQuery({
    queryKey: ['calls', 'history', conversationId ?? 'all'],
    queryFn: () => callsApi.history(conversationId),
  });
}

export function useStartCall() {
  return useMutation({
    mutationFn: (v: { conversationId: string; type: CallType; avatarId?: string }) =>
      callsApi.start(v.conversationId, v.type, v.avatarId),
  });
}

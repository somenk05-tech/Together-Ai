import { http as api } from '@/api/client';

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
  /** The call ringing for you right now, or null — ring recovery for tabs
   *  that were not alive when the CALL_RINGING frame was emitted. */
  ringing: () => api.get<Call | null>('/calls/ringing').then((r) => r.data),
  get: (id: string) => api.get<Call>(`/calls/${id}`).then((r) => r.data),
  history: (conversationId?: string) =>
    api.get<Call[]>('/calls', { params: conversationId ? { conversationId } : undefined }).then((r) => r.data),
  start: (conversationId: string, type: CallType, avatarId?: string) =>
    api.post<Call>('/calls', { conversationId, type, ...(avatarId ? { avatarId } : {}) }).then((r) => r.data),
  join: (id: string) => api.post<Call>(`/calls/${id}/join`, {}).then((r) => r.data),
  leave: (id: string) => api.post<Call>(`/calls/${id}/leave`, {}).then((r) => r.data),
  end: (id: string) => api.post<Call>(`/calls/${id}/end`, {}).then((r) => r.data),
};

/*
 * There were three hooks here — useIceConfig, useCallHistory and useStartCall —
 * and nothing imported any of them. Calls work, and they work by calling
 * callsApi.* directly from CallCenter.tsx: it holds the ICE config in a ref for
 * the life of a call rather than in the query cache, because a rotated TURN
 * credential matters and re-reading a cached one mid-call does not help.
 *
 * They are deleted rather than wired up. A second, cached way to start a call
 * sitting next to the real one is how somebody later fixes a bug in the wrong
 * place — which is the specific mistake dead-export-audit.mjs was written after.
 * If a call-history screen is ever built, useCallHistory is four lines and can
 * come back with a caller.
 */

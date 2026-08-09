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

/**
 * IS THIS ACTUALLY A CALL?
 *
 * Calls is the one feature that skips the `apiGet` + zod chokepoint every other
 * endpoint goes through, so both places a call enters this app took whatever
 * arrived and cast it. The visible consequence was a full-screen ringing
 * dialog reading "INCOMING UNDEFINED CALL" from "Someone", whose Answer button
 * called `join(undefined)` — produced by any truthy non-Call body: an HTML
 * error page or interstitial returned 200, a service-worker-cached index.html,
 * or a partial socket frame.
 *
 * A guard, not a schema library, because the fix has to be the same shape at
 * both entry points and one of them is a socket frame that never touches http.
 * The fields checked are exactly the ones the ringing UI reads and the Answer
 * button needs; anything failing this is not something to render, it is
 * something to drop.
 */
export function isCall(value: unknown): value is Call {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<Call>;
  return typeof c.id === 'string' && c.id.length > 0
    && typeof c.conversationId === 'string'
    && typeof c.createdById === 'string'
    && (c.type === 'audio' || c.type === 'video' || c.type === 'avatar')
    && (c.status === 'ringing' || c.status === 'active' || c.status === 'ended');
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

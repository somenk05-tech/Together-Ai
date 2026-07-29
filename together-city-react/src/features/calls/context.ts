import { createContext, useContext } from 'react';
import type { Call, CallType } from './api';

/**
 * The context lives apart from the provider component so the module exports
 * only values, not a mix of a component and a hook — which is what React Fast
 * Refresh needs in order to hot-reload the call overlay rather than remount it.
 * Remounting it mid-call would drop the peer connection.
 */
export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'connected';

export interface CallCenterValue {
  phase: CallPhase;
  call: Call | null;
  /** Ring a conversation. */
  start: (conversationId: string, type: CallType) => Promise<void>;
  busy: boolean;
}

export const CallCenterContext = createContext<CallCenterValue | null>(null);

export function useCallCenter(): CallCenterValue {
  const ctx = useContext(CallCenterContext);
  if (!ctx) throw new Error('useCallCenter must be used inside <CallCenter>');
  return ctx;
}

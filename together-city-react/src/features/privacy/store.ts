import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PERMISSION_DEFAULTS } from './consent.config';

interface PrivacyState {
  tosAccepted: boolean;
  acks: Record<string, boolean>;        // hub key → acknowledged the consent screen
  prefs: Record<string, boolean>;       // permission key → opted in
  hydrated: boolean;                    // merged server state at least once
  acceptTos: () => void;
  ackHub: (hub: string) => void;
  setPref: (key: string, value: boolean) => void;
  mergeServer: (s: { tosAccepted?: boolean; acks?: Record<string, boolean>; prefs?: Record<string, boolean> }) => void;
}

/**
 * Consent + granular-permission state (audit 2.2). Client-persisted so the
 * consent gate works instantly and per-device even if the backend is briefly
 * unreachable; the api layer syncs it to the server for cross-device durability.
 */
export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      tosAccepted: false,
      acks: {},
      prefs: { ...PERMISSION_DEFAULTS },
      hydrated: false,
      acceptTos: () => set({ tosAccepted: true }),
      ackHub: (hub) => set((s) => ({ acks: { ...s.acks, [hub]: true } })),
      setPref: (key, value) => set((s) => ({ prefs: { ...s.prefs, [key]: value } })),
      mergeServer: (server) =>
        set((s) => ({
          // Server wins for tos + acks (durable record); prefs merge server over defaults, keeping any local change already made this session.
          tosAccepted: s.tosAccepted || Boolean(server.tosAccepted),
          acks: { ...server.acks, ...s.acks },
          prefs: { ...PERMISSION_DEFAULTS, ...server.prefs, ...s.prefs },
          hydrated: true,
        })),
    }),
    {
      name: 'tc-privacy-v1',
      // Persist the actual consent record, but NOT `hydrated` — so every fresh
      // load re-verifies against the server before a gate could show, picking up
      // a consent given on another device even after this device once hydrated.
      partialize: (s) => ({ tosAccepted: s.tosAccepted, acks: s.acks, prefs: s.prefs }),
    },
  ),
);

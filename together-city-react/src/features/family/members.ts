import { useEffect, useState } from 'react';

/**
 * Family membership — mirrors the vanilla site's localStorage model.
 * The Connect page manages disabled / removed members and guests; every other
 * family page derives its headcount (N) from these same keys, so plans and
 * grocery baskets re-portion automatically. No backend endpoint exists for this.
 */
export type MemberId = string;
export type Need = 'protein' | 'calcium' | 'fibre' | 'iron';

export interface Member {
  id: MemberId;
  name: string;
  role: string;
  initial: string;
  targetKcal: number;
  need: Need;
  veg: boolean;
  online: boolean;
}

/**
 * The household starts as just you. Real family members are added via the
 * Connect page (by Together City ID) — no fake demo people.
 */
export const MEMBERS: Member[] = [
  { id: 'you', name: 'You', role: 'You · Admin', initial: 'Y', targetKcal: 2000, need: 'protein', veg: false, online: true },
];
const ADMIN_ID = 'you';

export const NEED_LABEL: Record<Need, string> = { protein: 'protein', calcium: 'calcium', fibre: 'high-fibre', iron: 'iron' };

export const KEYS = {
  disabled: 'tc:family:disabled',
  removed: 'tc:family:removed',
  guests: 'tc:family:guests',
} as const;

export interface Guest { id: string; name: string }

function readList<T = string>(key: string): T[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
function writeList(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

export interface FamilyState {
  disabled: MemberId[];
  removed: MemberId[];
  guests: Guest[];
}

export function readFamily(): FamilyState {
  return {
    disabled: readList<MemberId>(KEYS.disabled),
    removed: readList<MemberId>(KEYS.removed),
    guests: readList<Guest>(KEYS.guests),
  };
}

/** Connected (not removed) members. */
export function connectedMembers(f: FamilyState): Member[] {
  return MEMBERS.filter((m) => m.id === ADMIN_ID || f.removed.indexOf(m.id) < 0);
}

/** Members actively included in meals (admin always counts). */
export function activeMembers(f: FamilyState): Member[] {
  return MEMBERS.filter((m) => m.id === ADMIN_ID || (f.removed.indexOf(m.id) < 0 && f.disabled.indexOf(m.id) < 0));
}

/** People we cook for: you + active connected members + guests. */
export function headcount(f: FamilyState): number {
  return activeMembers(f).length + f.guests.length;
}

/**
 * Reactive family state that stays in sync across pages (storage events + a
 * custom event fired on local writes).
 */
export function useFamily() {
  const [state, setState] = useState<FamilyState>(readFamily);

  useEffect(() => {
    const refresh = () => setState(readFamily());
    window.addEventListener('storage', refresh);
    window.addEventListener('tc:family:change', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('tc:family:change', refresh);
    };
  }, []);

  const persist = (next: FamilyState) => {
    writeList(KEYS.disabled, next.disabled);
    writeList(KEYS.removed, next.removed);
    writeList(KEYS.guests, next.guests);
    setState(next);
    window.dispatchEvent(new Event('tc:family:change'));
  };

  return {
    state,
    setDisabled(id: MemberId, off: boolean) {
      const disabled = off
        ? Array.from(new Set([...state.disabled, id]))
        : state.disabled.filter((x) => x !== id);
      persist({ ...state, disabled });
    },
    removeMember(id: MemberId) {
      persist({
        ...state,
        removed: Array.from(new Set([...state.removed, id])),
        disabled: state.disabled.filter((x) => x !== id),
      });
    },
    addGuest(name: string) {
      persist({ ...state, guests: [...state.guests, { id: 'g' + Date.now(), name }] });
    },
    removeGuest(gid: string) {
      persist({ ...state, guests: state.guests.filter((g) => g.id !== gid) });
    },
  };
}

/** Deterministic seed from a member id (matches the vanilla memSeed). */
export function memSeed(id: string): number {
  let s = 0;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
  return s;
}

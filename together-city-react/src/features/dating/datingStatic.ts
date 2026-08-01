/**
 * Shared types + the signed-in resident's identity for the Dating hub's
 * Activity flow.
 *
 * This file once carried the static site's seeded candidate pool and
 * activities (invented people — Ananya Rao, Kabir Nair, …). Deleted 1 Aug
 * 2026: nothing imported them, and the live pages read the API. Only what
 * live code imports remains.
 */

export interface Candidate {
  name: string;
  handle: string;
  color: string;
  age: number;
  city: string;
  /** Pre-computed compatibility % shown on the host's request cards. */
  matchScore: number;
  badge?: string;
}

export interface Joiner {
  name: string;
  handle: string;
  color: string;
  age: number;
  city: string;
  status: 'requested' | 'approved' | 'declined';
}

export interface Activity {
  id: string;
  host: { name: string; handle: string; color: string; city: string };
  category: string;
  title: string;
  when: string;
  place: string;
  note?: string;
  spots: number;
  joiners: Joiner[];
}

/** The signed-in resident's identity in the Activity flow. */
export const ME = { name: 'You', handle: '@me', color: '#b0503e', city: 'Mumbai' } as const;

export function initials(name: string): string {
  return (name || '?').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
}


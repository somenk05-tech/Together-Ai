/**
 * Static seed data for the Dating hub's client-only sub-pages
 * (Activity Dating, Match Chat, Match Detail).
 *
 * Ported from the static site's `tc-dating.js` candidate pool + seeded
 * activities. These flows have no backend endpoints — the original ran
 * entirely on localStorage — so we reproduce the seeded content locally.
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

export const CATEGORY_ICON: Record<string, string> = {
  Movie: '🎬', Comedy: '🎤', Trip: '🧳', Food: '🍽', Music: '🎧',
  Sports: '🏸', Outdoors: '🥾', Coffee: '☕', Art: '🎨',
};

export const CANDIDATES: Candidate[] = [
  { name: 'Ananya Rao', handle: '@ananya', age: 29, city: 'Mumbai', color: '#b0503e', matchScore: 86, badge: 'Elite Match' },
  { name: 'Kabir Nair', handle: '@kabir', age: 32, city: 'Mumbai', color: '#2e5c3f', matchScore: 83, badge: 'Strong Match' },
  { name: 'Meera Iyer', handle: '@meera', age: 30, city: 'Bengaluru', color: '#b08d3e', matchScore: 79, badge: 'Good Match' },
  { name: 'Sara Khan', handle: '@sarak', age: 28, city: 'Mumbai', color: '#3a6ea5', matchScore: 88, badge: 'Elite Match' },
  { name: 'Rhea Sharma', handle: '@rhea', age: 27, city: 'Bengaluru', color: '#b76e79', matchScore: 81, badge: 'Strong Match' },
  { name: 'Arjun Menon', handle: '@arjunm', age: 31, city: 'Mumbai', color: '#4a7a8c', matchScore: 84, badge: 'Strong Match' },
];

export function candByHandle(h: string): Candidate | null {
  return CANDIDATES.find((c) => c.handle === h) ?? null;
}

function hostCard(handle: string): Activity['host'] {
  const c = candByHandle(handle);
  return c
    ? { name: c.name, handle: c.handle, color: c.color, city: c.city }
    : { name: 'Member', handle, color: '#888', city: '' };
}

export const SEED_ACTIVITIES: Activity[] = [
  { id: 'a1', host: hostCard('@ananya'), category: 'Movie', title: "Let's watch Odyssey in IMAX", when: 'Sat, 8:00 PM', place: 'PVR Phoenix, Kurla', note: "Grabbing dinner after if it's a vibe.", spots: 1, joiners: [] },
  { id: 'a2', host: hostCard('@kabir'), category: 'Comedy', title: 'Standup night at Canvas Laugh Club', when: 'Fri, 9:00 PM', place: 'Lower Parel, Mumbai', note: 'Two great line-ups back to back.', spots: 2, joiners: [] },
  { id: 'a3', host: hostCard('@meera'), category: 'Trip', title: 'Weekend trip to Coorg', when: 'Next Sat–Sun', place: 'Bengaluru → Coorg', note: 'Coffee estates, easy treks, good company.', spots: 3, joiners: [] },
  { id: 'a4', host: hostCard('@arjunm'), category: 'Food', title: 'Sunday brunch & board games', when: 'Sun, 12:00 PM', place: 'Bandra, Mumbai', note: 'Bring your competitive side.', spots: 2, joiners: [] },
];

/** The signed-in resident's identity in the Activity flow. */
export const ME = { name: 'You', handle: '@me', color: '#b0503e', city: 'Mumbai' } as const;

export function initials(name: string): string {
  return (name || '?').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
}

/** Stable masked identity code per handle — mirrors the static site. */
export function maskCode(h: string): string {
  let n = 0;
  for (let i = 0; i < h.length; i++) n = (n * 31 + h.charCodeAt(i)) % 9000;
  return 'Match #' + (1000 + n);
}

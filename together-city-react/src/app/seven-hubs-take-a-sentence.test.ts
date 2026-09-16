import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS, NAV } from '@/config/hubs';
import { districtName } from '@/pages/Home';
import { DESTINATIONS } from '@/nav/registry';

/**
 * SEVEN HUBS TAKE A SENTENCE FOR A NAME (owner, 16 Sep).
 *
 * The title and the cards say what the hub does for you; the header keeps the
 * short word so it still fits on a phone.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(resolve(HERE, '..', p), 'utf8');

const NAMES = {
  beauty: ['Personal Hair & Skin Specialist', 'Beauty'],
  fitness: ['Personal Trainer', 'Fitness'],
  nutrition: ['Private Nutritionist', 'Nutrition'],
  medical: ['Secure Medical Records', 'Medical'],
  dating: ['Find Your Perfect Match', 'Matchmaking'],
  astrology: ['Personal Astrologer', 'Astrology'],
  pets: ['For Your Pets', 'Pets'],
} as const;

describe('seven hubs take a sentence for a name', () => {
  for (const [key, [title, word]] of Object.entries(NAMES)) {
    const k = key as keyof typeof NAMES;
    it(`${word}: the title and the card say "${title}", the header still says "${word}"`, () => {
      expect(HUBS[k].name).toBe(title);
      expect(districtName(k)).toBe(title);
      expect(NAV.find((n) => n.key === k)?.label).toBe(word);
    });

    it(`${word}: is still found by typing its short word`, () => {
      const rooms = DESTINATIONS.filter((d) => d.kind === 'page' && d.hub === k);
      expect(rooms.length).toBeGreaterThan(0);
      for (const r of rooms) expect(r.keywords).toContain(word.toLowerCase());
    });
  }

  it('puts the same names on the home tiles', () => {
    const home = src('pages/Home.tsx');
    for (const [title] of Object.values(NAMES)) {
      if (title === 'For Your Pets') continue; // Pets has no tile yet
      expect(home).toContain(`title: '${title}'`);
    }
  });

  it('does not say "Explore" in front of a name that is already a sentence', () => {
    expect(src('pages/HubLanding.tsx'))
      .toMatch(/cfg\.name\.includes\(' '\) \? <i>\{cfg\.name\}<\/i> : <>Explore <i>\{cfg\.name\}<\/i><\/>/);
  });
});

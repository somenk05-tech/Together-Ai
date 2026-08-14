import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDay, saveDay, clearDay, today, type StoredTurn } from '@/features/chat/mira/day';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');

/**
 * A localStorage that behaves like the real one in the two ways that matter:
 * it stores strings, and it can refuse.
 */
function fakeStorage() {
  const map = new Map<string, string>();
  let refuse = false;
  return {
    refuseEverything() { refuse = true; },
    get size() { return map.size; },
    api: {
      getItem: (k: string) => (refuse ? (() => { throw new Error('denied'); })() : map.get(k) ?? null),
      setItem: (k: string, v: string) => { if (refuse) throw new Error('quota'); map.set(k, v); },
      removeItem: (k: string) => { if (refuse) throw new Error('denied'); map.delete(k); },
    },
  };
}

const TURNS: StoredTurn[] = [
  { who: 'you', text: 'whats my balance' },
  { who: 'mira', text: '₹4,120.', levity: 3 },
  { who: 'you', text: 'take me to budgets' },
  { who: 'mira', text: 'That’s Budgets.', goto: { label: 'Budgets', path: '/financial/budgets' } },
];

describe('Mira remembers the day, and only the day', () => {
  let fake: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    fake = fakeStorage();
    (globalThis as { window?: unknown }).window = { localStorage: fake.api };
  });
  afterEach(() => { delete (globalThis as { window?: unknown }).window; });

  it('gives back what it was given, inside the same day', () => {
    saveDay(TURNS);
    expect(loadDay()).toEqual(TURNS);
  });

  /**
   * YESTERDAY IS DROPPED BEFORE IT IS READ.
   *
   * This is the whole design: the record carries the day it was written, so
   * expiry is a comparison at read time rather than a timer, a cleanup job or a
   * cron. Nothing has to run for the day to end — which is what makes "a day"
   * true instead of aspirational.
   */
  it('drops a record written on another day', () => {
    const yesterday = new Date('2026-08-13T10:00:00');
    saveDay(TURNS, yesterday);
    expect(loadDay(new Date('2026-08-14T10:00:00'))).toEqual([]);
    // …and it is gone, not merely ignored. An ignored record comes back the
    // moment a clock or a timezone moves.
    expect(fake.size).toBe(0);
  });

  /** Midnight is THEIRS. `toISOString()` is UTC, which would end the day at
   *  5:30am in the city this application is for. */
  it('uses the local calendar day, not UTC', () => {
    const lateEvening = new Date(2026, 7, 14, 23, 30);
    expect(today(lateEvening)).toBe('2026-08-14');
    const justAfter = new Date(2026, 7, 15, 0, 30);
    expect(today(justAfter)).toBe('2026-08-15');
  });

  /** Anything that is not the shape we wrote is an old format, and this is a
   *  cache of a conversation rather than a record anybody is owed. */
  it('drops a record it cannot parse rather than crashing on it', () => {
    fake.api.setItem('mira.day', JSON.stringify({ day: today(), turns: [{ who: 'somebody-else' }] }));
    expect(loadDay()).toEqual([]);
    fake.api.setItem('mira.day', 'not json at all');
    expect(loadDay()).toEqual([]);
  });

  it('caps a runaway thread rather than filling the quota', () => {
    const many: StoredTurn[] = Array.from({ length: 260 }, (_, i) => ({ who: 'you' as const, text: `q${i}` }));
    saveDay(many);
    const back = loadDay();
    expect(back).toHaveLength(200);
    // The tail is kept, not the head — the recent end of a conversation is the
    // part somebody came back for.
    expect(back[back.length - 1].text).toBe('q259');
  });

  it('forgets on request', () => {
    saveDay(TURNS);
    clearDay();
    expect(loadDay()).toEqual([]);
  });

  /**
   * AND STORAGE THAT REFUSES DOES NOT TAKE THE CHAT HUB WITH IT.
   *
   * Safari's private mode throws from setItem, a full quota throws, and some
   * privacy extensions throw from getItem. Losing a day of history is a
   * disappointment; an unhandled throw inside a render is a blank hub.
   */
  it('survives storage that throws at every call', () => {
    fake.refuseEverything();
    expect(() => saveDay(TURNS)).not.toThrow();
    expect(loadDay()).toEqual([]);
    expect(() => clearDay()).not.toThrow();
  });

  /** …and no storage at all, which is what the server render and this very
   *  test file's node environment both see. */
  it('survives having no window', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadDay()).toEqual([]);
    expect(() => saveDay(TURNS)).not.toThrow();
  });

  /**
   * THE LIMIT IS IN THE PRODUCT, NOT ONLY IN A COMMENT.
   *
   * `one-bag.test.ts` bans localStorage for the shopping bag because a bag in
   * the browser is a bag one device knows about. The same objection is true
   * here and is being answered rather than dodged: the thread says so on the
   * screen. If that sentence ever goes, this feature quietly starts lying
   * about what it keeps.
   */
  it('tells the citizen, on the screen, that this is one device and one day', () => {
    const thread = read('src/features/chat/mira/MiraThread.tsx');
    expect(thread).toMatch(/Today[^<]*this device/i);
  });
});

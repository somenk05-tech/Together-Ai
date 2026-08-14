import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daySeed, firstOpenToday, clearDay, today } from '@/features/chat/mira/day';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    api: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    },
    map,
  };
}

describe('she says what kind of day she is having — once', () => {
  let fake: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    fake = fakeStorage();
    (globalThis as { window?: unknown }).window = { localStorage: fake.api };
  });
  afterEach(() => { delete (globalThis as { window?: unknown }).window; });

  /**
   * ONCE A DAY, NOT ONCE A SESSION.
   *
   * Somebody who opens the app nine times before lunch does not need telling
   * nine times what kind of day she is having. That is a catchphrase, and
   * catchphrases are how a character dies. The CALL is what marks the day, so
   * the second one is false even though nothing else happened in between.
   */
  it('is the first open today, and then it is not', () => {
    expect(firstOpenToday()).toBe(true);
    expect(firstOpenToday()).toBe(false);
    expect(firstOpenToday()).toBe(false);
  });

  it('comes round again tomorrow', () => {
    expect(firstOpenToday(new Date(2026, 7, 14, 9))).toBe(true);
    expect(firstOpenToday(new Date(2026, 7, 14, 23))).toBe(false);
    expect(firstOpenToday(new Date(2026, 7, 15, 1))).toBe(true);
  });

  it('forgetting today forgets the greeting too', () => {
    expect(firstOpenToday()).toBe(true);
    clearDay();
    // Otherwise "Forget today" leaves her half-remembering: no conversation,
    // but still convinced she has already said hello.
    expect(firstOpenToday()).toBe(true);
  });

  /** No storage at all — the server render, and this suite's own node
   *  environment. She greets rather than staying silent, which is the right way
   *  to fail for something whose whole job is to say hello. */
  it('greets when there is nowhere to remember', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(firstOpenToday()).toBe(true);
  });
});

/**
 * THE SEED IS THE MOOD, AND IT MUST LAST AS LONG AS THE MOOD DOES.
 *
 * It was `Math.random()` held in a ref, so she was a different character on
 * every page load: announce "Wide awake and slightly dangerous", refresh, get
 * somebody else. A mood that survives less time than the tab is not a mood.
 */
describe('the day chooses which Mira turns up', () => {
  let fake: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    fake = fakeStorage();
    (globalThis as { window?: unknown }).window = { localStorage: fake.api };
  });
  afterEach(() => { delete (globalThis as { window?: unknown }).window; });

  it('is the same all day, however many times it is asked', () => {
    const a = daySeed(new Date(2026, 7, 14, 9));
    const b = daySeed(new Date(2026, 7, 14, 23, 59));
    expect(a).toBe(b);
  });

  it('changes with the day', () => {
    const a = daySeed(new Date(2026, 7, 14, 12));
    const b = daySeed(new Date(2026, 7, 15, 12));
    expect(a).not.toBe(b);
  });

  /** A mood is hers WITH YOU, not the day's horoscope — two people opening the
   *  app on the same morning should not meet the same Mira. */
  it('is not the same for two devices on the same date', () => {
    const mine = daySeed(new Date(2026, 7, 14, 12));
    const other = fakeStorage();
    (globalThis as { window?: unknown }).window = { localStorage: other.api };
    const theirs = daySeed(new Date(2026, 7, 14, 12));
    expect(mine).not.toBe(theirs);
  });

  it('is a non-negative integer the API will accept', () => {
    const s = daySeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(10_000_000);
  });

  it('survives having no storage', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => daySeed()).not.toThrow();
    expect(Number.isInteger(daySeed())).toBe(true);
  });

  it('is keyed to the same local day everything else is', () => {
    expect(today(new Date(2026, 7, 14, 23, 30))).toBe('2026-08-14');
  });
});

/**
 * AND THE BADGE AND THE ANSWERS AGREE.
 *
 * `greeting.ts` prefers a mood's own openers rather than appending them to a
 * shared pool, precisely so the badge and the line beneath it are the same
 * character. That argument fails one level up if the greeting and the answers
 * are seeded differently — she would announce one Mira and deliver another.
 */
describe('one seed reaches both', () => {
  const thread = strip(read('features/chat/mira/MiraThread.tsx'));

  it('sends the day seed to the greeting and to every ask', () => {
    expect(thread).toMatch(/const seed = useRef\(daySeed\(\)\)/);
    expect(thread).toMatch(/useMiraGreeting\(\{[\s\S]*?seed: seed\.current/);
    expect(thread).toMatch(/useMiraAsk\(\{[\s\S]*?seed: seed\.current/);
  });

  it('never re-rolls it', () => {
    expect(thread).not.toMatch(/Math\.random/);
  });

  /** Asked once per mount, because asking is what marks the day as greeted.
   *  Called during render instead, it would mark the day on a re-render and the
   *  badge would vanish mid-look. */
  it('asks whether it is the first open exactly once', () => {
    expect(thread).toMatch(/const firstOfDay = useRef\(firstOpenToday\(\)\)/);
  });

  it('renders the mood, and does not invent one when there is none', () => {
    expect(thread).toMatch(/greeting\.data\?\.hello && <p className="miramood">/);
    expect(thread).toMatch(/greeting\.data\?\.ask && <p className="miraask">/);
  });
});

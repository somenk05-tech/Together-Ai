import { moodFor, profileFor, tilted, allMoodLines, MOODS, ALL_MOODS, STILL } from './mood';
import { violations } from './voice';
import { greet } from './greeting';

describe('every line any mood can produce is in voice', () => {
  it.each(allMoodLines())('%j', (line) => {
    expect(violations(line)).toEqual([]);
  });
});

describe('mood is colour, levity is permission — and colour never wins', () => {
  it('no mood can lift levity above what the governor allowed', () => {
    // The single most important assertion in this file. A mood system is
    // exactly the sort of thing that reintroduces a joke into a distress turn
    // by the side door.
    for (const m of ALL_MOODS) {
      expect(tilted(m, 0)).toBe(0);
      expect(tilted(m, 2)).toBeLessThanOrEqual(2);
      expect(tilted(m, 3)).toBeLessThanOrEqual(3);
    }
  });

  it('a mood may make her quieter than she is allowed to be', () => {
    expect(tilted('brisk', 3)).toBeLessThan(3);
    expect(tilted('quiet', 3)).toBeLessThan(3);
  });

  it('at L0 every mood collapses to the same still register', () => {
    for (const m of ALL_MOODS) {
      expect(profileFor(m, 0)).toBe(STILL);
    }
    // And the still register is not secretly one of the playful ones.
    expect(STILL.opens.join(' ')).not.toMatch(/suspicious|fire|Tuesday|decisions|trouble/i);
  });
});

describe('a mood is chosen, not rolled', () => {
  it('the same session gets the same mood', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(moodFor({ seed, hour: 14 })).toBe(moodFor({ seed, hour: 14 }));
    }
  });

  it('different sessions vary', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => moodFor({ seed: i, hour: 14 })));
    expect(seen.size).toBeGreaterThan(2);
  });

  it('an explicit request always wins', () => {
    expect(moodFor({ seed: 3, hour: 14, requested: 'brisk' })).toBe('brisk');
    expect(moodFor({ seed: 3, hour: 3, requested: 'mischievous' })).toBe('mischievous');
  });

  it('after a hard session she is quiet, whatever the seed', () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(moodFor({ seed, hour: 14, lastSessionDistressed: true })).toBe('quiet');
    }
  });

  it('the small hours skew low-key', () => {
    for (let seed = 0; seed < 10; seed++) {
      expect(['quiet', 'wry']).toContain(moodFor({ seed, hour: 3 }));
    }
  });
});

describe('rhythm is most of what a mood actually is', () => {
  it('each mood has a distinct sentence length', () => {
    const lens = ALL_MOODS.map((m) => MOODS[m].words);
    expect(new Set(lens).size).toBeGreaterThan(3);
  });

  it('brisk and quiet are the shortest; warm is the longest', () => {
    expect(MOODS.brisk.words).toBeLessThan(MOODS.warm.words);
    expect(MOODS.quiet.words).toBeLessThan(MOODS.warm.words);
  });
});

describe('she says what mood she is in — once a day', () => {
  const base = { weeksKnown: 52, hour: 14, seed: 5, dial: 1 as const };

  it('announces it on the first open of the day', () => {
    const out = greet({ ...base, firstOfDay: true, mood: 'mischievous' });
    expect(out.hello).toBe(MOODS.mischievous.blurb);
  });

  it('and does NOT announce it on the ninth open before lunch', () => {
    // Nine times in a morning is a catchphrase, and catchphrases are how a
    // character dies.
    const out = greet({ ...base, firstOfDay: false, mood: 'mischievous' });
    expect(out.hello).not.toBe(MOODS.mischievous.blurb);
  });

  it('after a hard session the announcement is honest, not cheerful', () => {
    const out = greet({ ...base, firstOfDay: true, lastSessionDistressed: true });
    expect(out.level).toBe(0);
    expect(out.hello).toBe(STILL.blurb);
    expect(out.hello).not.toMatch(/trouble|dangerous|good one/i);
  });

  it('the mood comes back with the greeting so the session can hold it', () => {
    const out = greet({ ...base, firstOfDay: true });
    expect(ALL_MOODS).toContain(out.mood);
    expect(greet({ ...base, firstOfDay: true }).mood).toBe(out.mood);
  });
});

describe('the mood reaches the opening line too', () => {
  it('a mischievous session can open with a mischievous line', () => {
    const asks = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      asks.add(greet({ weeksKnown: 52, hour: 14, seed, dial: 1, mood: 'mischievous' }).ask);
    }
    expect([...asks].some((a) => MOODS.mischievous.opens.includes(a))).toBe(true);
  });

  it('but never below L2 — a quiet register carries no colour', () => {
    for (let seed = 0; seed < 40; seed++) {
      const out = greet({ weeksKnown: 52, hour: 14, seed, dial: 0, mood: 'mischievous' });
      expect(out.level).toBe(1);
      expect(MOODS.mischievous.opens).not.toContain(out.ask);
    }
  });
});

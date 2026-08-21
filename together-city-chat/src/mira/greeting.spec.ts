import { greet, greetingLevel, allGreetings, FOURTH_WALL_EVERY, type GreetingInput } from './greeting';
import { MOODS } from './mood';
import { violations } from './voice';

const g = (over: Partial<GreetingInput> = {}): GreetingInput => ({
  weeksKnown: 52, hour: 14, seed: 0, dial: 1, ...over,
});

describe('every line she can ever open with is in voice', () => {
  // The sweep, not a sample. A greeting is the most-read sentence in the
  // product — it is seen by everyone, every session, before anything else —
  // so a bad one is the most expensive possible bad line.
  it.each(allGreetings())('%j', (line) => {
    expect(violations(line)).toEqual([]);
  });

  it('none of them is the banned call-centre greeting', () => {
    for (const l of allGreetings()) {
      expect(l).not.toMatch(/how (can|may) I (help|assist)/i);
    }
  });

  it('every line says something — none is a bare hello', () => {
    for (const l of allGreetings()) expect(l.trim().length).toBeGreaterThan(8);
  });
});

describe('playful from the first session', () => {
  // Inverted by the owner, 14 Aug — see levity.ts. Kept rather than deleted so
  // the reversal is legible.
  it('she opens playful on day one', () => {
    expect(greetingLevel(g({ weeksKnown: 0 }))).toBeGreaterThanOrEqual(3);
  });

  it('and how long they have known her changes nothing', () => {
    expect(greetingLevel(g({ weeksKnown: 0 }))).toBe(greetingLevel(g({ weeksKnown: 300 })));
  });

  it('their "less" setting is still the way out', () => {
    // The mitigation for a first-session joke that misses: one tap, and it holds.
    expect(greetingLevel(g({ weeksKnown: 0, dial: 0 }))).toBe(1);
  });
});

describe('the case it exists for', () => {
  it('a distressed last session opens plain, however long they have known her', () => {
    const out = greet(g({ weeksKnown: 300, dial: 2, lastSessionDistressed: true }));
    expect(out.level).toBe(0);
    expect(out.ask).not.toMatch(/suspicious|score|fire|breaking|parent|sleep/i);
  });

  it('and no seed can shake a joke out of it', () => {
    for (let seed = 0; seed < 60; seed++) {
      const out = greet(g({ weeksKnown: 300, dial: 2, lastSessionDistressed: true, seed }));
      expect(out.level).toBe(0);
    }
  });
});

describe('the dampers', () => {
  it('the small hours take the edge off, not the warmth', () => {
    for (const hour of [0, 3, 5]) expect(greetingLevel(g({ hour }))).toBe(2);
  });

  it('their "less" setting holds at L1 forever', () => {
    expect(greetingLevel(g({ weeksKnown: 500, dial: 0 }))).toBe(1);
  });
});

describe('a level is a ceiling, not a target', () => {
  it('an L3 citizen still gets plain openings sometimes', () => {
    // A character who is always on is exhausting by Thursday. Draw across 30
    // seeds and assert the pool genuinely includes the quiet lines.
    const asks = new Set<string>();
    for (let seed = 0; seed < 30; seed++) asks.add(greet(g({ weeksKnown: 20, seed })).ask);
    expect(asks.size).toBeGreaterThan(4);
    expect([...asks].some((a) => /What are we fixing today|What’s first/.test(a))).toBe(true);
  });

  it('is reproducible — the same session gets the same greeting', () => {
    const a = greet(g({ seed: 7 }));
    const b = greet(g({ seed: 7 }));
    expect(a).toEqual(b);
  });
});

describe('the fourth wall is rate-limited in code', () => {
  it('does not fire before it is due', () => {
    const out = greet(g({ weeksKnown: 20, sessionsSinceFourthWall: FOURTH_WALL_EVERY - 1 }));
    expect(out.ask).not.toMatch(/don’t sleep/);
  });

  it('fires when it is due', () => {
    const out = greet(g({ weeksKnown: 20, sessionsSinceFourthWall: FOURTH_WALL_EVERY }));
    expect(out.ask).toMatch(/don’t sleep/);
  });

  it('never fires below L3 — not even when overdue', () => {
    // dial:0 is now the only way below L3, since the week ramp is gone.
    const out = greet(g({ dial: 0, sessionsSinceFourthWall: 9999 }));
    expect(out.ask).not.toMatch(/don’t sleep/);
  });

  it('is rare by construction', () => {
    // If somebody lowers this, the line stops landing. Make them say so.
    expect(FOURTH_WALL_EVERY).toBeGreaterThanOrEqual(20);
  });
});

describe('teases target choices, never the person', () => {
  /**
   * Two lists, not one — and the split was forced by a false positive.
   *
   * The first draft was a single word list containing "broke", and it fired on
   * "Back already. I'm flattered. What broke?" — a line about a THING breaking,
   * which is exactly the tease-a-choice register this rule is meant to protect.
   *
   * That is the same correction `shared/voice.ts` has already made twice, and
   * its comment says why: a guard that fires on good writing is one somebody
   * switches off. So the unambiguous slurs stay bare, and the words that are
   * only insults when aimed at a person are matched only when aimed at one.
   */
  const ALWAYS = /\b(fat|obese|thin|ugly|stupid|idiot|lazy|useless|pathetic|hopeless)\b/i;
  const ONLY_ABOUT_YOU = /\byou(?:'re| are|r)\s+(?:so\s+|such a\s+|too\s+)?(?:broke|poor|slow|old|failing|behind|a mess|terrible at)\b/i;

  it('never an unambiguous insult', () => {
    for (const l of allGreetings()) expect(l).not.toMatch(ALWAYS);
  });

  it('never aims a circumstance word at the person', () => {
    for (const l of allGreetings()) expect(l).not.toMatch(ONLY_ABOUT_YOU);
  });

  it('the narrowed rule still catches the thing it is for', () => {
    // Proven against planted copy rather than trusted. An untripped guard
    // proves nothing — the reason the allergen ratchet in this repo was
    // re-proven by mutation.
    expect("You're broke and you know it").toMatch(ONLY_ABOUT_YOU);
    expect('Morning, lazy').toMatch(ALWAYS);
    expect('What broke?').not.toMatch(ONLY_ABOUT_YOU);
    expect('What broke?').not.toMatch(ALWAYS);
  });
});

describe('she does not claim what she was never given', () => {
  /**
   * Three lines were removed for this, and they were the funniest three. The
   * input carries a mood, an hour, a dial, a seed and two counters — no
   * calendar, no unread count, no last topic. Every one of those sentences was
   * an invention about the citizen's own data in the first line of the session.
   */
  it('no opening line reads her calendar, her workload or last Tuesday', () => {
    for (const l of allGreetings()) {
      expect(l).not.toMatch(/calendar|on fire|from tuesday|unread|three things/i);
    }
  });

  it('and no seed shakes one out of her', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const hour of [2, 9, 14, 20]) {
        const out = greet(g({ seed, hour, dial: 2 }));
        expect(`${out.hello} ${out.ask}`).not.toMatch(/calendar|on fire|from tuesday/i);
      }
    }
  });
});

describe('a time-of-day line is said at that time of day', () => {
  /** "Evening" fired at nine in the morning, because the line sat in the pool
   *  and was drawn from the seed with no reference to the hour at all. */
  it('never says morning or evening in the afternoon', () => {
    for (let seed = 0; seed < 60; seed++) {
      const out = greet(g({ seed, hour: 14 }));
      expect(`${out.hello} ${out.ask}`).not.toMatch(/morning|evening|up early/i);
    }
  });

  it('but does say them at the hour they belong to', () => {
    const evening = new Set<string>();
    for (let seed = 0; seed < 60; seed++) evening.add(greet(g({ seed, hour: 20 })).ask);
    expect([...evening]).toContain('Anything left over from today?');

    const early = new Set<string>();
    for (let seed = 0; seed < 60; seed++) early.add(greet(g({ seed, hour: 7 })).ask);
    expect([...early]).toContain('You’re up early. Suspicious.');
  });
});

describe('every line she owns is reachable', () => {
  /**
   * `useMood` spent `seed % 3` and the pick spent `seed % opens.length`, and
   * every mood but one has exactly three openers — so the two conditions were
   * reading the same digit and `opens[0]` was unreachable for four of her six
   * moods. A line nobody can be shown is a line that is not in the product.
   */
  it.each(Object.keys(MOODS))('%s can open with any of its own lines', (mood) => {
    const said = new Set<string>();
    for (let seed = 0; seed < 90; seed++) {
      said.add(greet(g({ seed, mood: mood as keyof typeof MOODS })).ask);
    }
    for (const open of MOODS[mood as keyof typeof MOODS].opens) expect([...said]).toContain(open);
  });
});

describe('she stops repeating herself', () => {
  it('says which line it was, and says the same thing about the same session', () => {
    const a = greet(g({ seed: 7 }));
    expect(a.id).toBeTruthy();
    expect(greet(g({ seed: 7 })).id).toBe(a.id);
  });

  it('skips a line the caller says she has just used', () => {
    const first = greet(g({ seed: 4 }));
    const again = greet(g({ seed: 4, exclude: [first.id] }));
    expect(again.id).not.toBe(first.id);
    expect(again.ask).not.toBe(first.ask);
  });

  /**
   * THE LOOP THIS ENDS. Mood cycled on 7 and the line on 3 — a period of 42.
   * Forty-five consecutive sessions produced twenty-four distinct openings and
   * then repeated them exactly, in order.
   */
  it('does not repeat inside a window of ten sessions', () => {
    const recent: string[] = [];
    const seen: string[] = [];
    for (let seed = 0; seed < 45; seed++) {
      const out = greet(g({ seed, exclude: recent }));
      expect(recent).not.toContain(out.id);
      seen.push(out.id);
      recent.unshift(out.id);
      recent.length = Math.min(recent.length, 10);
    }
    expect(new Set(seen).size).toBeGreaterThan(24);  // the old ceiling, over the same 45 sessions
  });

  it('still opens her mouth when everything has been said recently', () => {
    // A citizen who has seen all of it still gets a greeting. Repeating the
    // oldest line is the least bad of the options left.
    const all = Array.from({ length: 200 }, (_, seed) => greet(g({ seed })).id);
    const out = greet(g({ seed: 3, exclude: [...new Set(all)] }));
    expect(out.ask.length).toBeGreaterThan(0);
  });
});

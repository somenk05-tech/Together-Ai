import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  basisFor, basisLabel, formatRange, inRangeSummary, matchedToCitizen,
  panelRangeNote, statusAgainst, type RangeBasis,
} from './range-basis';

const general = (n: number): RangeBasis[] => Array.from({ length: n }, () => 'general-adult' as const);
const own = (n: number): RangeBasis[] => Array.from({ length: n }, () => 'own-report' as const);

describe('panelRangeNote', () => {
  it('names what the band is not matched to, rather than saying it is approximate', () => {
    const note = panelRangeNote(general(9))!;
    expect(note).toMatch(/sex at birth/);
    expect(note).toMatch(/age/);
    expect(note).toMatch(/lab that ran your test/);
  });

  it('goes away entirely once every range came from the citizen’s own report', () => {
    expect(panelRangeNote(own(9))).toBeNull();
    expect(panelRangeNote([])).toBeNull();
  });

  it('counts the general ones when a panel is mixed, instead of tarring all of them', () => {
    const note = panelRangeNote([...own(6), ...general(2)])!;
    expect(note).toMatch(/^2 of these 8 ranges/);
  });

  it('does not say "2 of these 2" when every range is general', () => {
    expect(panelRangeNote(general(2))!).toMatch(/^These are general adult ranges/);
  });
});

describe('inRangeSummary', () => {
  it('never says "within range" without naming the range it was within', () => {
    const clean = inRangeSummary({ bases: general(9), outOfRange: 0 });
    expect(clean).toBe('All 9 markers fell inside our general adult ranges.');
    expect(clean).not.toMatch(/^All measured markers are within range/);
  });

  it('says whose range it was when the range was the citizen’s own', () => {
    expect(inRangeSummary({ bases: own(4), outOfRange: 0 }))
      .toBe('All 4 markers fell inside the ranges printed on your report.');
  });

  it('does not report an unread panel as a clear one', () => {
    // The bug this guards: a report we could not parse produced zero markers,
    // zero of them out of range, and a green tick.
    const empty = inRangeSummary({ bases: [], outOfRange: 0 });
    expect(empty).toMatch(/nothing to say/);
    expect(empty).not.toMatch(/All /);
  });

  it('states a flag plainly, with no hedge borrowed from the band caveat', () => {
    const one = inRangeSummary({ bases: general(9), outOfRange: 1 });
    expect(one).toBe('1 marker of 9 came back outside its range.');
    expect(one).not.toMatch(/general|approximate|roughly|may/);

    expect(inRangeSummary({ bases: general(9), outOfRange: 3 }))
      .toBe('3 markers of 9 came back outside their range.');
  });

  it('gets the singular right on a one-marker panel', () => {
    expect(inRangeSummary({ bases: general(1), outOfRange: 0 }))
      .toBe('All 1 marker fell inside our general adult ranges.');
  });
});

describe('basis attribution', () => {
  it('only calls a range matched to the citizen when it came from their report', () => {
    expect(matchedToCitizen('own-report')).toBe(true);
    expect(matchedToCitizen('general-adult')).toBe(false);
  });

  it('labels each basis in the words the citizen would use', () => {
    expect(basisLabel('own-report')).toBe('your report’s range');
    expect(basisLabel('general-adult')).toBe('general adult range');
  });
});

describe('the claim this module exists to remove', () => {
  it('is not reachable from any input', () => {
    const banned = /All measured markers are within range|every measured marker is in range/i;
    const inputs: Array<{ bases: RangeBasis[]; outOfRange: number }> = [
      { bases: [], outOfRange: 0 },
      { bases: general(1), outOfRange: 0 },
      { bases: general(20), outOfRange: 0 },
      { bases: own(20), outOfRange: 0 },
      { bases: [...own(3), ...general(3)], outOfRange: 0 },
      { bases: general(9), outOfRange: 9 },
    ];
    for (const i of inputs) {
      expect(inRangeSummary(i)).not.toMatch(banned);
      expect(panelRangeNote(i.bases) ?? '').not.toMatch(banned);
    }
  });
});

/**
 * A sentence removed from one page comes back on another. This is the same
 * source-scan shape as `route-reach.spec.ts` and `wallet-pricing.spec.ts`: the
 * claim is banned from the web package, not just from the two files that had it.
 */
const WEB_SRC = join(__dirname, '..', '..', '..', 'together-city-react', 'src');

function webFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) webFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const describeOrSkip = existsSync(WEB_SRC) ? describe : describe.skip;

describeOrSkip('the web package does not claim a range it does not have', () => {
  // Each pattern is a sentence that told a citizen their results cleared THEIR
  // range, using a band we apply to every adult. A man at haemoglobin 12.4 is
  // anaemic and clears 12–17.5; he was shown a green tick.
  const BANNED = [
    /All measured markers are within range/i,
    /every measured marker is in range/i,
  ];

  it('has none of the banned claims left in it', () => {
    const found: string[] = [];
    for (const file of webFiles(WEB_SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of BANNED) {
        if (pattern.test(text)) found.push(`${file.slice(WEB_SRC.length + 1)}: ${pattern}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('is actually reading the web package, not an empty directory', () => {
    // Without this, a wrong path would make the guard above pass forever.
    expect(webFiles(WEB_SRC).length).toBeGreaterThan(100);
  });
});

describe('basisFor — the seam BE-3.2a left open', () => {
  it('is the citizen’s own only when an interval was actually stored', () => {
    expect(basisFor({ low: 13, high: 17 })).toBe('own-report');
    expect(basisFor({ low: null, high: 5 })).toBe('own-report');
    expect(basisFor({ low: 40, high: null })).toBe('own-report');
  });
  it('reads a pre-BE-3.2b row — two nulls — as the general band', () => {
    expect(basisFor({ low: null, high: null })).toBe('general-adult');
    expect(basisFor(null)).toBe('general-adult');
    expect(basisFor(undefined)).toBe('general-adult');
  });
});

describe('formatRange', () => {
  it('writes a one-sided bound the way the lab wrote it', () => {
    expect(formatRange({ low: 13, high: 17 })).toBe('13–17');
    expect(formatRange({ low: null, high: 5 })).toBe('< 5');
    expect(formatRange({ low: 40, high: null })).toBe('> 40');
  });
});

describe('statusAgainst — the status cannot disagree with the range shown', () => {
  it('judges against the interval it is given', () => {
    expect(statusAgainst(12.4, { low: 13, high: 17 })).toBe('low');
    expect(statusAgainst(14, { low: 13, high: 17 })).toBe('normal');
    expect(statusAgainst(18, { low: 13, high: 17 })).toBe('high');
  });
  it('is the whole point: the man the general band called normal', () => {
    // Haemoglobin 12.4 clears the union band 12–17.5 and fails a male 13–17.
    expect(statusAgainst(12.4, { low: 12, high: 17.5 })).toBe('normal');
    expect(statusAgainst(12.4, { low: 13, high: 17 })).toBe('low');
  });
  it('lets a one-sided bound constrain one side only', () => {
    expect(statusAgainst(0.1, { low: null, high: 5 })).toBe('normal');
    expect(statusAgainst(9, { low: null, high: 5 })).toBe('high');
    expect(statusAgainst(10, { low: 40, high: null })).toBe('low');
    expect(statusAgainst(900, { low: 40, high: null })).toBe('normal');
  });
});

describe('the caveat lifts exactly when it stops applying', () => {
  it('goes away once every band on the panel is the citizen’s own', () => {
    expect(panelRangeNote(['own-report', 'own-report'])).toBeNull();
    expect(inRangeSummary({ bases: ['own-report', 'own-report'], outOfRange: 0 }))
      .toBe('All 2 markers fell inside the ranges printed on your report.');
  });
  it('stays, and counts, on a mixed panel', () => {
    const note = panelRangeNote(['own-report', 'general-adult', 'own-report'])!;
    expect(note).toMatch(/^1 of these 3 ranges/);
  });
});

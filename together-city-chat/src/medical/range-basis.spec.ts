import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  basisLabel, inRangeSummary, matchedToCitizen, panelRangeNote, type RangeBasis,
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

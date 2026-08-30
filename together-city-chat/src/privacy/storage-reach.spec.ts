import { readFileSync } from 'fs';
import { join } from 'path';
import { STORAGE_COLUMNS, ourObjects } from './storage-reach';
import { PURGE_RULES } from './purge-plan';

/**
 * ── EVERY COLUMN THAT COULD NAME A FILE IS CLASSIFIED ───────────────────────
 *
 * The companion to purge-plan.spec.ts, on the dimension it could not see.
 *
 * That spec asks "is every model carrying a citizen's id classified?" and fails
 * the build when one is not. It is a good question and it found a great deal.
 * It could not have found any of the five leaks of 30 Aug, because each was
 * invisible for a reason the question does not reach: the model had no citizen
 * column (PostMedia); or the row was destroyed early so the purge never saw it
 * (a nulled fileKey, a nulled resumeUrl, posts deleted at soft-delete); or the
 * file was in the PUBLIC bucket as a URL, a shape the purge plan had no
 * vocabulary for at all.
 *
 * So this one reads schema.prisma for every column whose NAME could plausibly
 * name a file, and fails when one is not in the registry. It cannot tell
 * whether a classification is right — only that somebody made one. Same bargain
 * purge-plan.ts strikes in its own words: "Getting that decision wrong is still
 * possible; forgetting to make it is not."
 */

const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

/** Every model → the columns whose name ends in Key or Url. */
function candidates(): Array<{ model: string; column: string }> {
  const out: Array<{ model: string; column: string }> = [];
  for (const [, model, body] of SCHEMA.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
      const m = /^(\w+)\s+\S/.exec(t);
      if (m && /(key|url)$/i.test(m[1])) out.push({ model, column: m[1] });
    }
  }
  return out;
}

describe('every column that could name a file has been thought about', () => {
  it('classifies each one', () => {
    const known = new Set(STORAGE_COLUMNS.map((c) => `${c.model}.${c.column}`));
    const missing = candidates()
      .map((c) => `${c.model}.${c.column}`)
      .filter((k) => !known.has(k));

    if (missing.length) {
      throw new Error(
        '\nThese columns look like they could name a file and are not classified:\n\n'
        + missing.map((m) => `    ${m}`).join('\n')
        + '\n\nAdd each to STORAGE_COLUMNS in storage-reach.ts saying what it HOLDS —\n'
        + 'a file in our private vault, a file in our public bucket, a link to\n'
        + 'somewhere else, a data: payload in the row, or a key that has nothing to\n'
        + 'do with files. If it is one of ours, say what CARRIES IT AWAY, in words.\n'
        + '"Something must" is the belief that produced five separate leaks.\n',
      );
    }
    expect(missing).toEqual([]);
  });

  it('lists nothing that is not in the schema', () => {
    // A registry that outlives its columns rots into reassurance.
    const real = new Set(candidates().map((c) => `${c.model}.${c.column}`));
    const stale = STORAGE_COLUMNS
      .map((c) => `${c.model}.${c.column}`)
      .filter((k) => !real.has(k));
    expect(stale).toEqual([]);
  });

  /**
   * THE ASSERTION THAT WOULD HAVE CAUGHT ALL FIVE. Every file we actually
   * hold has to name the thing that removes it. A blank here is a leak with
   * nobody's name on it.
   */
  it('names what carries away every file we hold', () => {
    const silent = ourObjects()
      .filter((c) => !c.carriedAwayBy || c.carriedAwayBy.trim().length < 15)
      .map((c) => `${c.model}.${c.column}`);
    expect(silent).toEqual([]);
  });

  it('gives every column a reason', () => {
    const unexplained = STORAGE_COLUMNS
      .filter((c) => c.reason.trim().length < 15)
      .map((c) => `${c.model}.${c.column}`);
    expect(unexplained).toEqual([]);
  });

  it('has no duplicate entries', () => {
    const keys = STORAGE_COLUMNS.map((c) => `${c.model}.${c.column}`);
    expect(keys.length).toBe(new Set(keys).size);
  });
});

/**
 * The four leaks that were closed on 30 Aug, asserted at the purge plan rather
 * than in prose — so that removing one of these clauses fails here rather than
 * quietly restoring the bug.
 */
describe('the purge plan carries the storage clauses that were missing', () => {
  const rule = (model: string) => PURGE_RULES.find((r) => r.model === model);

  it('takes a CV and its photograph with the job profile', () => {
    expect(rule('JobProfile')?.storageUrls).toEqual(expect.arrayContaining(['resumeUrl', 'photoUrl']));
  });

  it('takes a shopfront’s logo, menu scan and gallery with the listing', () => {
    const r = rule('ServiceListing');
    expect(r?.storageUrls).toEqual(expect.arrayContaining(['logoUrl', 'menuScanUrl']));
    expect(r?.storageUrlsJson).toEqual({ column: 'photosJson', field: 'url' });
  });

  it('takes a LEGACY medical document, which is a URL and not a key', () => {
    // The rule named fileKey only, so rows written before the private vault —
    // fileUrl set, fileKey null — were purged with the document still there.
    const r = rule('MedicalRecord');
    expect(r?.storageKey).toBe('fileKey');
    expect(r?.storageUrls).toEqual(['fileUrl']);
  });

  it('every rule with a storage clause is one the purge actually runs', () => {
    // `storageBearing()` filters `deletions()`, so a storage clause on a `keep`
    // rule is a clause that never fires — which reads, in a review, exactly
    // like one that does.
    for (const r of PURGE_RULES) {
      const hasClause = Boolean(r.storageKey || r.storageKeys || r.storageKeysJson || r.storageUrls || r.storageUrlsJson);
      if (hasClause) expect(r.action).toBe('purge');
    }
  });
});

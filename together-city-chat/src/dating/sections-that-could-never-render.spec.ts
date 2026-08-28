import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── FOUR SECTIONS THAT COULD NEVER RENDER, AND TWO LABELS THAT LIED ──
 *
 * New Members, Recently Active, People Nearby and Growing Community Picks were
 * gated on `sparse = used.size < 8`. `used` is filled by the three bands above,
 * which partition the page exactly, so `used.size === page.length`; with the
 * only caller asking for 200 the page is everybody, so `sparse` was true only
 * for a city of fewer than eight — and then `take()` skipped all of them for
 * being in `used` already. Empty in both directions.
 *
 * They stopped being reachable when the band truncation was removed. While the
 * bands hid people, a second pass under different headings surfaced them; once
 * the bands showed everybody, these four could only re-show the same faces.
 *
 * Deleted rather than repaired: repairing means deciding to show the same
 * person twice, under headings that assert what nothing checks — "Just joined
 * the city" and "Online now or active recently" were SORTS, not windows.
 */
const svc = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');

describe('sections that could never render', () => {
  it('is not shipping headings the gate could never open', () => {
    for (const label of ['New Members', 'Recently Active', 'People Nearby', 'Growing Community Picks']) {
      expect(svc).not.toContain(`label: '${label}'`);
    }
    expect(svc).not.toMatch(/const sparse = used\.size < 8;/);
  });

  it('is not asserting a recency nothing measures', () => {
    // The code, not the paragraph above it that records what was removed.
    const code = svc.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/Just joined the city/);
    expect(code).not.toMatch(/Online now or active recently/);
  });

  /**
   * The honest version of the same fact is one screen up and stays: the server
   * counts who clears the bar and the banner says so in the citizen's own city.
   */
  it('keeps the thin-market signal that is actually computed', () => {
    expect(svc).toMatch(/lowDensity: ranked\.filter\(\(s\) => s\.card\.score >= MATCH_THRESHOLD\)\.length < 6/);
    expect(svc).toMatch(/idealCount: ranked\.filter/);
  });

  /** Their three reads went with them; `city` stays, ranking ties on it. */
  it('stops selecting the columns only those sections read', () => {
    const discover = svc.slice(svc.indexOf('private async discoverUncached'), svc.indexOf('// Photos for the cards that are actually going out'));
    expect(discover).not.toMatch(/lastSeen/);
    expect(discover).not.toMatch(/onlineStatus/);
    expect(discover).toMatch(/city: \(candDX\.city \?\? ''\)\.trim\(\)\.toLowerCase\(\)/);
  });
});

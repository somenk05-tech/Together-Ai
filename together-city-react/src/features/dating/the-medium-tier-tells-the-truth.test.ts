import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ── FOUR SENTENCES AND A SWITCH, FROM THE FOURTH AUDIT ──
 *
 * Small findings, one theme: a control or a sentence that described something
 * the code did not do. None of them is a blocker; together they are most of
 * what a citizen actually bumps into.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const profile = read('./pages/DatingProfile.tsx');
const safety = read('./components/SafetyMenu.tsx');
const stats = read('./pages/DatingAdminStats.tsx');

describe('the medium tier tells the truth', () => {
  /**
   * The slider shows 100 km before it is touched, and `prefDistanceKm` was
   * written only by its onChange — so ticking the deal breaker and trusting the
   * number on screen produced no boundary at all.
   */
  it('ticking Distance writes the distance that was on the screen', () => {
    expect(profile).toMatch(/const tickDealBreaker = \(v: string\) => \{/);
    expect(profile).toMatch(/v === 'Distance' && next\.includes\(v\) && typeof dx\.prefDistanceKm !== 'number'/);
    expect(profile).toMatch(/prefDistanceKm: distanceKm/);
    // And the chips go through it, or the fix is unreachable.
    expect(profile).toMatch(/onClick=\{\(\) => tickDealBreaker\(v\)\}/);
  });

  it('sends people to the room the blocked list is actually in', () => {
    expect(safety).toMatch(/your blocked list in Settings/);
    expect(safety).not.toMatch(/blocked list in People/);
  });

  it('names both grants, and says restart rather than reload', () => {
    expect(stats).toMatch(/MODERATION_ADMINS/);
    expect(stats).toMatch(/CONSOLE_FOUNDERS/);
    expect(stats).toMatch(/restart it rather than reloading/);
    expect(stats).not.toMatch(/then reload\./);
  });

  it('does not call a dating conversation anonymous any more', () => {
    expect(stats).not.toMatch(/anonymous conversations/);
  });
});

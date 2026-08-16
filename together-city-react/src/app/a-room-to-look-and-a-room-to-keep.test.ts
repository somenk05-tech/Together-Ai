import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments stripped, so an absence check reads the code and not the essay
 *  above it — several of the assertions below are "this page does NOT do X". */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A ROOM TO LOOK IN, AND A ROOM TO KEEP ───────────────────────────────────
 *
 * The owner, 16 Aug: a Potential Matches section showing the entire public with
 * their compatibility percentage, and "when someone from potential matches
 * connect with each other they land at curated matches".
 *
 * Curated Matches used to be both rooms at once — the mutual matches, then the
 * ranked deck, then the histogram, then everyone else with a Like button. The
 * split is the change, and these are the three things that would quietly undo
 * it:
 *
 *   1. LIKING CREEPING BACK INTO CURATED. The moment that page can like
 *      somebody it is a browse surface again, and "mutual" stops being what the
 *      room means.
 *   2. A CAP ON THE BROWSE LIST. `discover()` carries a written decision that
 *      the old `take(_, 24)` was removed because "deciding who is worth talking
 *      to is the citizen's job and a silent truncation made that decision for
 *      them". A `.slice(0, n)` on this page would reinstate it client-side,
 *      invisibly, and pass every other gate.
 *   3. THE CARD FORKING. Two rooms drawing a person from two copies of the same
 *      component is how they start disagreeing about what a percentage is.
 *
 * The privacy rules are NOT re-asserted here — they live on the server and have
 * their own specs (connection exclusions, both-direction filters, per-candidate
 * threshold opt-in). What this pins is that the new page reads the endpoint
 * that enforces them rather than assembling a pool of its own.
 */
describe('a room to look in, and a room to keep', () => {
  const browse = code('features/dating/pages/DatingBrowse.tsx');
  const curated = code('features/dating/pages/DatingMatches.tsx');
  const cards = code('features/dating/components/MatchCards.tsx');
  const router = code('app/router.tsx');

  it('gives the dating hub four rooms, in the order the journey runs', () => {
    const items = HUBS.dating.items;
    expect(items.map((i) => i.path)).toEqual([
      '/dating/profile', '/dating/browse', '/dating/matches', '/dating/chats',
    ]);
    // one-bag pins contiguity across every hub; this pins THIS hub's numbering
    // so a later reshuffle cannot put the browse room after the keep room.
    expect(items.map((i) => i.index)).toEqual(['01', '02', '03', '04']);
    expect(items[1].label).toBe('Potential Matches');
    // Curated no longer advertises a percentage: nobody arrives there by
    // scoring well, only by being chosen back.
    expect(items[2].sub).not.toMatch(/75|%/);
    expect(router).toMatch(/path: '\/dating\/browse'/);
  });

  it('browses the pool through the endpoint that scores everybody', () => {
    // /dating/discover returns every eligible candidate with no floor and no
    // truncation. Building a pool any other way would mean a second engine.
    expect(browse).toMatch(/useDiscover\(kind, Boolean\(profile\.data\)\)/);
    expect(browse).not.toMatch(/useDatingStack/);
  });

  it('never silently truncates the list it was built to show in full', () => {
    // Any numeric slice of the candidate array is the removed `take(_, 24)`
    // coming back on the client. Grouping and sorting are fine; cutting is not.
    expect(browse).not.toMatch(/everyone\.slice\(/);
    expect(browse).not.toMatch(/\.slice\(0,\s*\d+\)/);
  });

  it('shows each person once, whatever the sections do', () => {
    expect(browse).toMatch(/const seen = new Set<string>\(\)/);
    expect(browse).toMatch(/if \(seen\.has\(m\.user\.id\)\) continue/);
  });

  it('keeps Curated to people who chose you back — and to nothing else', () => {
    expect(curated).toMatch(/stack\.data\?\.matched \?\? \[\]/);
    // No candidates, no top card, no histogram: those are the browse room's.
    expect(curated).not.toMatch(/\.candidates/);
    expect(curated).not.toMatch(/stack\.data\?\.top/);
    expect(curated).not.toMatch(/Distribution/);
    // And above all, no way to like from here.
    expect(curated).not.toMatch(/useLikeMatch|usePassMatch|useSuperLike|MatchCard\b/);
  });

  it('does not hide a match behind the conversation cap', () => {
    // The old page swapped the whole list for the engaged panel at capacity.
    // At capacity what is paused is starting something new, not seeing the
    // people who already chose you — so the panel is a sibling below, and the
    // matched branch is reached first.
    expect(curated).toMatch(/matched\.length > 0 \? \(/);
    expect(curated).toMatch(/\{atCapacity && !stack\.isLoading && !stack\.isError && \(/);
    expect(curated.indexOf('matched.length > 0 ? (')).toBeLessThan(curated.indexOf('{atCapacity &&'));
  });

  it('draws a person from one component in both rooms', () => {
    expect(browse).toMatch(/from '\.\.\/components\/MatchCards'/);
    expect(curated).toMatch(/from '\.\.\/components\/MatchCards'/);
    // The definitions live there and nowhere else.
    expect(cards).toMatch(/export function MatchCard\(/);
    expect(cards).toMatch(/export function MatchStack\(/);
    expect(browse).not.toMatch(/function MatchCard\(/);
    expect(curated).not.toMatch(/function MatchStack\(/);
  });

  it('names the journey on both sides, so nobody has to discover it', () => {
    // Browse → "you both like each other and they move next door"; Curated →
    // "the other room is where everyone is". A room whose only route in is an
    // event that happens to you needs to say so before it happens.
    expect(browse).toMatch(/to="\/dating\/matches"/);
    expect(curated).toMatch(/to="\/dating\/browse"/);
    expect(cards).toMatch(/They’re in Curated Matches now/);
  });

  it('counts the histogram off the list it sits above', () => {
    // /dating/discover sends no distribution. Counting the bands from the very
    // array being rendered means the summary cannot disagree with the list.
    expect(cards).toMatch(/export function bandsOf\(matches: CuratedMatch\[\]\): CompatibilityBand\[\]/);
    expect(browse).toMatch(/bands=\{bandsOf\(everyone\)\} total=\{everyone\.length\}/);
  });

  it('still refuses to invent a blank slate out of a failed read', () => {
    // Both pages: error branch BEFORE the empty branch, as everywhere else in
    // the city. "No one to show" said to somebody whose request failed is a
    // small, plausible, disheartening lie about their whole city.
    for (const [name, page] of [['browse', browse], ['curated', curated]] as const) {
      const err = page.indexOf('isError');
      const empty = page.indexOf('🌙');
      expect({ page: name, errorFirst: err !== -1 && empty !== -1 && err < empty })
        .toEqual({ page: name, errorFirst: true });
    }
  });
});

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
  // The band table moved out of the component file on 26 Aug — react-refresh
  // cannot hot-reload a file that exports both components and functions — and
  // this guard follows it there. What it pins is unchanged: one function, one
  // signature, counted off the list being rendered.
  const bands = code('features/dating/bands.ts');
  const router = code('app/router.tsx');

  it('gives the dating hub its rooms, in the order the journey runs, and the safety one last', () => {
    const items = HUBS.dating.items;
    expect(items.map((i) => i.path)).toEqual([
    /* Dating → Matchmaking, 31 Aug (owner). The rooms answer on /matchmaking
       now and /dating/* redirects to them, so every link in the app names the
       new address. */
      '/matchmaking/profile', '/matchmaking/browse', '/matchmaking/matches', '/matchmaking/chats', '/matchmaking/safety',
    ]);
    // one-bag pins contiguity across every hub; this pins THIS hub's numbering
    // so a later reshuffle cannot put the browse room after the keep room.
    expect(items.map((i) => i.index)).toEqual(['01', '02', '03', '04', '05']);
    /* THE SAFETY CENTRE IS ON THE RAIL (29 Aug). It was reachable from the ⋯
       report menu and from a block shown to somebody whose profile had been
       refused — both of which assume something has already gone wrong. It
       carries what is checked, what is not, and four numbers to call, which is
       reading somebody should be able to do before they need it. Last in the
       list deliberately: the journey is still introduce, look, keep, talk. */
    expect(items[4].label).toBe('Safety Centre');
    expect(items[1].label).toBe('Potential Matches');
    // Curated no longer advertises a percentage: nobody arrives there by
    // scoring well, only by being chosen back.
    expect(items[2].sub).not.toMatch(/75|%/);
    expect(router).toMatch(/path: '\/matchmaking\/browse'/);
  });

  it('browses the pool through the endpoint that scores everybody', () => {
    // /dating/discover scores every eligible candidate with no floor. Since
    // 26 Aug it is read a PAGE at a time — ranked server-side before the cut,
    // and the cut is said on screen — which is the opposite of the silent
    // take(_, 24) this file was written against. Building a pool any other
    // way would still mean a second engine.
    /* `isSavedProfile`, not `Boolean` — changed in cb055247 with the medium
       tier and the assertion left behind, so this was red on main. The
       distinction is the point of the change: a profile OBJECT is not a SAVED
       profile, and browsing on the strength of the first one shows the pool to
       somebody who has not finished introducing themselves. */
    expect(browse).toMatch(/useDiscover\(kind, isSavedProfile\(profile\.data\), limit\)/);
    expect(browse).not.toMatch(/useDatingStack/);
    // A page is honest only if the citizen can ask for the next one and can
    // see how much of the city they have seen.
    expect(browse).toMatch(/hasMore/);
    expect(browse).toMatch(/Show more — \$\{discover\.data\.shown\} of \$\{discover\.data\.totalDiscoverable\}/);
  });

  /**
   * AS MANY AS POSSIBLE, BEST ONE FIRST (owner, 26 Aug). Two halves:
   *
   * The page opens two hundred deep — in today's city that is everyone, at
   * scale it is the 200 best of a server-ranked pool, and "Show more" walks
   * the rest. A later hand shrinking this back to a few dozen would be
   * quietly re-deciding how much of the city a citizen may see at once.
   *
   * And the first card is the global best BY CONSTRUCTION, in both views:
   * `everyone` sorts descending before the bands group it, and the band
   * table opens at 90–100 — so banded view leads with the strongest; the
   * sparse-city view renders the server's sections in order, and every
   * tiered section is emitted score-descending. The sort lines are asserted
   * because they are the construction.
   */
  it('opens two hundred deep, and the strongest face is always the first card', () => {
    expect(browse).toMatch(/const BROWSE_PAGE = 200/);
    expect(browse).toMatch(/out\.sort\(\(a, b\) => b\.score - a\.score\)/);
    // The band table's first row is the top band, so grouped rendering
    // cannot lead with anything but the best.
    expect(bands).toMatch(/^const BAND_NAMES[\s\S]{0,80}\[90, 100/m);
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

  /**
   * AND THERE IS NO CAP TO HIDE ONE BEHIND (owner, 27 Aug: "let users have
   * unlimited conversations with curated matches... there should be no
   * limit").
   *
   * This guard used to hold the softer version of the same idea: three
   * conversations at once, with the panel that announced reaching the limit
   * placed BELOW the matches rather than instead of them. The limit itself is
   * gone now — from the page, from the payload, and from the connect
   * endpoint — so what is pinned is its absence, on the room where it was
   * most visible.
   */
  it('holds no conversation cap, anywhere in the room', () => {
    expect(curated).toMatch(/matched\.length > 0 \? \(/);
    for (const gone of ['atCapacity', 'chatCap', 'EngagedPanel']) {
      expect({ gone, inRoom: curated.includes(gone) }).toEqual({ gone, inRoom: false });
    }
    // And nothing in the hub still draws the panel or offers the type.
    expect(cards).not.toMatch(/EngagedPanel/);
    // `code` strips comments: the type file NAMES the fields it dropped.
    expect(code('features/dating/api.ts')).not.toMatch(/chatCap|atCapacity/);
  });

  /**
   * ONE BROWSE CARD, AND ONE CURATED CARD, AND NEITHER IS A COPY OF THE OTHER.
   *
   * This began as "both rooms draw a person from one component", which was
   * right while both rooms were drawing the same object. Since 27 Aug they are
   * not: the browse card is a full-bleed photograph you act on in place, and
   * the curated card is a door that ends at the person's own words. What still
   * must not happen is the browse card being re-implemented next door — that is
   * how two rooms start disagreeing about what a percentage means.
   */
  it('draws the browse card from one component, and never a second copy of it', () => {
    expect(browse).toMatch(/from '\.\.\/components\/MatchCards'/);
    // The definitions live there and nowhere else.
    expect(cards).toMatch(/export function MatchCard\(/);
    expect(cards).toMatch(/export function MatchStack\(/);
    expect(browse).not.toMatch(/function MatchCard\(/);
    expect(curated).not.toMatch(/function MatchCard\(|function MatchStack\(/);
    // Curated draws its own one card, and it is the door to the profile.
    expect(curated).toMatch(/function CuratedCard\(/);
    expect(curated).toMatch(/to=\{`\/matchmaking\/match\?u=\$\{match\.user\.id\}/);
  });

  it('names the journey on both sides, so nobody has to discover it', () => {
    // Browse → "you both like each other and they move next door"; Curated →
    // "the other room is where everyone is". A room whose only route in is an
    // event that happens to you needs to say so before it happens.
    expect(browse).toMatch(/to="\/matchmaking\/matches"/);
    expect(curated).toMatch(/to="\/matchmaking\/browse"/);
    expect(cards).toMatch(/They’re in Curated Matches now/);
  });

  it('counts the histogram off the list it sits above', () => {
    // /dating/discover sends no distribution. Counting the bands from the very
    // array being rendered means the summary cannot disagree with the list.
    expect(bands).toMatch(/export function bandsOf\(matches: CuratedMatch\[\]\): CompatibilityBand\[\]/);
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

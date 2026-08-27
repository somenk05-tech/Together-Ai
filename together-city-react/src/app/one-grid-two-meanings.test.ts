import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGNABLE_HUBS } from '@/config/services';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** A block comment is recognised only where one can START — line head, or just
 *  inside a JSX brace. The blunter version swallows a file from the first
 *  `image/*` or `auto-fill` onward and takes real code with it. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── ONE GRID, TWO MEANINGS ──────────────────────────────────────────────────
 *
 * The owner, 27 Aug, with a screenshot of their own "Build Together City
 * around your life" page: put this grid on the developer dashboard, where it
 * "overrides all the controls of the website at will".
 *
 * So there are now two pages drawing the same fourteen hubs as the same card
 * with the same switch, and they mean OPPOSITE THINGS:
 *
 *   · /profile — this citizen's copy of the city. Off means the doors leave
 *     THEIR header and drawer. The rooms keep answering. Nothing else happens
 *     to anybody.
 *   · /dev — the city. Off means the hub's API refuses, for EVERYONE, until
 *     somebody turns it back on.
 *
 * Identical layout carrying opposite consequences is a genuinely dangerous
 * thing to build, and it was built on purpose: an operator scanning for the
 * one hub that is off deserves the same glanceable grid a citizen gets. What
 * makes it safe is not the layout, it is everything around it — and that is
 * what this file pins, because every one of these is a line somebody could
 * "tidy up" into consistency with the citizen page without noticing what they
 * had done.
 */
describe('one grid, two meanings', () => {
  const dev = code('features/dev/pages/Dev.tsx');
  const citizen = code('features/profile/components/DesignYourServices.tsx');

  it('says the opposite of the citizen page, in the first sentence', () => {
    // The citizen's promise, which must NOT be repeated on the dev page.
    expect(citizen).toMatch(/Nothing is deleted — its rooms still answer/);
    expect(dev).toMatch(/These switches are the whole city, not your copy of it/);
    expect(dev).toMatch(/refuses that hub&rsquo;s API for every citizen/);
    // And it does not borrow the reassurance that belongs next door.
    expect(dev).not.toMatch(/its rooms still answer/);
  });

  /**
   * THE SWITCH ARMS, IT DOES NOT ACT. The citizen's switch takes effect the
   * moment it moves, which is right when the cost of a mistake is one hidden
   * menu link. Here the cost is a hub, so moving it opens the reason box and
   * the switch snaps back on cancel. A dev switch wired straight to the
   * mutation would look identical and be a different product.
   */
  it('arms the card rather than flipping the hub', () => {
    expect(dev).toMatch(/checked=\{arming \? !flag\.enabled : flag\.enabled\}/);
    expect(dev).toMatch(/onChange=\{\(\) => \(arming \? cancel\(\) : setArming\(true\)\)\}/);
    // The reason is still required, and still eight characters of it.
    expect(dev).toMatch(/reason\.trim\(\)\.length >= 8/);
    expect(dev).toMatch(/disabled=\{!ready \|\| setFlag\.isPending\}/);
  });

  it('shows the whole consequence at the moment of deciding, not a clamped line', () => {
    // Two lines while idle; the full sentence once armed. A truncated
    // "…for every citizen, including anyone mid-" is worse than no summary.
    expect(dev).toMatch(/display: arming \? 'block' : '-webkit-box'/);
  });

  /**
   * AND A HUB WITH NO SWITCH SAYS SO. Thirteen cards where the citizen sees
   * fourteen would read as "that one is permanent" — the opposite of the
   * truth for E-Commerce, which simply has no API of its own to refuse.
   */
  it('draws a card for the hubs that cannot be switched', () => {
    expect(dev).toMatch(/flags\.data\.unflaggable\.map\(\(h\) => <LockedCard/);
    expect(dev).toMatch(/function LockedCard\(/);
    expect(dev).toMatch(/no switch/);
  });

  it('counts what is off for everybody, not what the reader switched off', () => {
    expect(citizen).toMatch(/hubs on\./);
    expect(dev).toMatch(/refusing for every citizen right now/);
  });

  /**
   * The list the API duplicates in its own test. Fourteen here, fourteen
   * there; if a fifteenth hub is added, the API's guard fails until somebody
   * decides whether it gets a switch or a reason.
   */
  it('still has the fourteen hubs the API guard was written against', () => {
    expect([...DESIGNABLE_HUBS].sort()).toEqual([
      'astrology', 'beauty', 'dating', 'ecommerce', 'entertainment', 'financial',
      'fitness', 'jobs', 'medical', 'nutrition', 'pets', 'realestate', 'services',
      'social',
    ]);
  });
});

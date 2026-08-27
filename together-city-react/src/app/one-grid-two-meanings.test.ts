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
    // The citizen's promise, which must NOT be repeated on the KILL section.
    expect(citizen).toMatch(/Nothing is deleted — its rooms still answer/);
    expect(dev).toMatch(/These are the whole city, not your copy of it/);
    expect(dev).toMatch(/refuses that hub&rsquo;s API for every citizen/);
    expect(dev).not.toMatch(/its rooms still answer/);
  });

  /**
   * ── AND NOW THERE ARE THREE MEANINGS, NOT TWO (owner, 27 Aug) ─────────────
   *
   * "Visibility switches for the entire global website, so I can control
   * turning off or on a sector." So one sector now has three switches with the
   * same shape:
   *
   *   1. /profile — the citizen hides it from THEMSELVES. Rooms answer.
   *   2. /dev visibility — the operator hides it from EVERYONE. Rooms answer.
   *   3. /dev kill      — the operator CLOSES it for everyone. Rooms refuse.
   *
   * 2 and 3 sit on the same page under the same key, which is the dangerous
   * part: an operator reaching for a switch in an incident must not hide a
   * sector while believing they closed it. What keeps them apart is a separate
   * section, a separate heading, a separate card, and copy on the visibility
   * half that leads with what it does NOT do.
   */
  it('separates hiding from closing, in the words and in the wiring', () => {
    // Two headings, and the softer control comes first because it is the one
    // that gets used; the loud one is not the default reach.
    const vis = dev.indexOf('Visibility — what the site shows');
    const kill = dev.indexOf('Kill switches — what the API answers');
    expect({ vis: vis > -1, kill: kill > -1, order: vis < kill })
      .toEqual({ vis: true, kill: true, order: true });
    // The visibility copy's job is the disclaimer, not the feature.
    expect(dev).toMatch(/It hides; it does not close/);
    expect(dev).toMatch(/keeps answering every request\s+it always did/);
    expect(dev).toMatch(/they are deliberately not the same control/);
    // Two card components, neither able to take the other's row.
    expect(dev).toMatch(/function VisibilityCard\(\{ row, password \}: \{ row: VisibilityRow/);
    expect(dev).toMatch(/function FlagCard\(\{ flag, password \}: \{ flag: FlagRow/);
    // And the kind is ALWAYS stated on the wire — never inferred from the key,
    // because a sector answers to both under one name.
    expect(dev).toMatch(/kind: 'kill'/);
    expect(dev).toMatch(/kind: 'visibility'/);
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
    // One helper, worn by both card kinds — the clamp opening at the moment of
    // decision is the behaviour, and it must not diverge between them.
    expect(dev).toMatch(/const clamp2 = \(open: boolean\)/);
    expect(dev).toMatch(/display: open \? 'block' : '-webkit-box'/);
    expect((dev.match(/style=\{clamp2\(arming\)\}/g) ?? []).length).toBe(2);
  });

  /**
   * MIRA IS ON THE LIST, AND SHE IS NOT A HUB. The switch is about things with
   * doors, and she has five of them. Hiding them must not silence her: the
   * contract the owner set is visibility only, and every gate below is a
   * render gate rather than a call gate.
   */
  it('hides every one of Mira’s doors, and muzzles none of them', () => {
    for (const [file, needle] of [
      ['layouts/RootChrome.tsx', /\{miraShown && <MiraDock \/>\}/],
      ['features/chat/pages/Chats.tsx', /\{miraShown && <MiraRow /],
      ['features/dating/pages/DatingChats.tsx', /\{miraShown && \(/],
      ['features/daybook/pages/DayPage.tsx', /\{miraShown && <section className="dayb-mira">/],
    ] as const) {
      expect({ file, gated: needle.test(code(file)) }).toEqual({ file, gated: true });
    }
    // The hook exists once and says what it is for.
    expect(read('hooks/useCityDesign.ts')).toMatch(/export function useMiraShown\(\): boolean/);
    // Nothing anywhere stops her ANSWERING — that would be a kill switch, and
    // it was explicitly not what was asked for.
    expect(code('hooks/useCityDesign.ts')).not.toMatch(/\/mira/);
  });

  it('counts what is off for everybody, not what the reader switched off', () => {
    expect(citizen).toMatch(/hubs on\./);
    expect(dev).toMatch(/refusing for every citizen right now/);
    // And the visibility count says the distinction one more time, in the
    // place somebody glances at rather than reads.
    expect(dev).toMatch(/still answering, just not on the menu/);
  });

  /**
   * ONE DOOR, TWO HANDS, ONE ANSWER. Every render site asks `hubOn` and
   * nothing else, so the operator's switch has to be composed INTO it —
   * a second question at four call sites is three call sites that forget.
   */
  it('folds the operator’s switch into the same question the citizen’s answers', () => {
    const hook = code('hooks/useCityDesign.ts');
    expect(hook).toMatch(/hubOn: \(key: string\): boolean => !hidden\.has\(key\) && switches\.shown\(key\)/);
    expect(hook).toMatch(/queryFn: \(\) => api\.get<\{ off: string\[\] \}>\('\/visibility'\)/);
    // Fails open: the default with no data is an EMPTY off-list, so a failed
    // request draws the whole city rather than none of it.
    expect(hook).toMatch(/q\.data\?\.off \?\? \[\]/);
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

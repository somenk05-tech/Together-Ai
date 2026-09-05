import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV } from '@/config/hubs';
import { DESIGNABLE_HUBS } from '@/config/services';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE CITY IS YOURS TO DESIGN — and the design can only ever HIDE.
 *
 * Design Your Services (owner, 25 Aug) puts a switch on every hub with a door
 * on the street: off, and the hub leaves that citizen's header, drawer, home
 * surfaces and city grid. The two halves this file holds:
 *
 * 1. THE LIST IS DERIVED, NOT INVENTED. The designable hubs are exactly the
 *    street — NAV minus the citizen's own doors, plus Financial, which left
 *    the header (owner, 22 Aug) but still stands on the home map, the walk
 *    and the grid. A hub joining or leaving the street must fail here until
 *    the designable list answers for it.
 *
 * 2. HIDDEN IS NOT DELETED — Travel's rule, made per-citizen. Every filter is
 *    applied at render; NAV, the router and the command-palette registry stay
 *    whole, so a bookmark still opens and Mira can still take you anywhere.
 */
describe('the designable list is the street, derived', () => {
  it('is NAV minus the citizen’s own doors, plus Financial', () => {
    const street = new Set(NAV.map((n) => n.key as string));
    street.delete('mail');      // an action in the corner, not a service
    street.delete('personal');  // the citizen's own drawer
    street.add('financial');    // off the header, still on the home surfaces
    expect([...DESIGNABLE_HUBS].sort()).toEqual([...street].sort());
  });

  it('never offers the citizen’s own doors, or a hub with no street surface', () => {
    for (const key of ['mail', 'personal', 'travel']) {
      expect({ key, designable: (DESIGNABLE_HUBS as readonly string[]).includes(key) })
        .toEqual({ key, designable: false });
    }
  });

  it('mirrors the server’s copy of the list, key for key', () => {
    // The server refuses any key outside ITS list, so if the two drift a save
    // fails loudly in production. This makes the drift fail here first.
    const server = readFileSync(
      join(SRC, '..', '..', 'together-city-chat', 'src', 'profile', 'design-your-services.ts'),
      'utf8',
    );
    const literal = server.match(/DESIGNABLE_HUBS = \[([^\]]+)\] as const/)?.[1] ?? '';
    const serverKeys = [...literal.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(serverKeys.sort()).toEqual([...DESIGNABLE_HUBS].sort());
  });
});

describe('every street surface wears the same filter', () => {
  // The four surfaces that advertise hubs each consult the one hook. Grepping
  // for the call rather than rendering, in the tradition of planner-rail: the
  // page source is the artefact under test.
  for (const surface of ['layouts/Header.tsx', 'layouts/CityDrawer.tsx', 'pages/Hubs.tsx', 'pages/Home.tsx']) {
    it(`${surface} consults the citizen's design`, () => {
      const src = read(surface);
      expect(src).toMatch(/useCityDesign\(\)/);
      expect(src).toMatch(/hubOn\(/);
    });
  }

  it('the filter happens at render — NAV itself is never rewritten', () => {
    // The one full list stays full: every surface filters a COPY at render,
    // so the command palette, the burger and the tests all still see the
    // whole city. A .splice or reassignment on NAV would be the bug.
    expect(read('hooks/useCityDesign.ts')).not.toMatch(/NAV/);
  });
});

describe('hidden is not deleted', () => {
  it('the command palette still finds every hub — the registry never filters', () => {
    // Somebody who typed "astrology" at midnight after switching it off is
    // asking to go there, and the answer is the door, not a shrug.
    expect(read('nav/registry.ts')).not.toMatch(/useCityDesign/);
  });

  it('signed out, loading, or refused, the whole city stands', () => {
    const hook = read('hooks/useCityDesign.ts');
    // The query only runs signed in…
    expect(hook).toMatch(/enabled: authed/);
    // …and the OFF set is empty unless a loaded answer says otherwise, so the
    // two states "no design" and "we don't know" both render the full city.
    expect(hook).toMatch(/authed \? q\.data\?\.hidden \?\? \[\] : \[\]/);
  });
});

describe('the control room is on the profile', () => {
  it('the profile renders Design Your Services', () => {
    expect(read('features/profile/pages/Profile.tsx')).toMatch(/<DesignYourServices \/>/);
  });

  it('says what it does in the owner’s words', () => {
    const section = read('features/profile/components/DesignYourServices.tsx');
    expect(section).toMatch(/Build Together City around your life\./);
  });

  it('is switches, not a form — no Save button to forget', () => {
    const section = read('features/profile/components/DesignYourServices.tsx');
    expect(section).toMatch(/from '@\/components\/ui'/);
    expect(section).toMatch(/<Switch /);
    expect(section).not.toMatch(/>Save</);
  });

  /**
   * ── THE OPERATOR'S HAND COMES FIRST (owner, 5 Sep) ─────────────────────────
   * "If the developer switches something off the tab also vanishes from the
   * website" — and it had, everywhere but here: the header, drawer, home and
   * grid asked hubOn(), while this room listed DESIGNABLE_HUBS whole and
   * offered a Jobs switch for a hub nobody could see. Now the cards, the paths
   * and the count are drawn from the hubs the operator has left on; the
   * citizen's own choice is still saved in full, so the card comes back as
   * they left it when the operator turns the hub on again.
   */
  it('does not offer a hub the operator has switched off site-wide, and keeps the citizen’s answer for when it returns', () => {
    const section = read('features/profile/components/DesignYourServices.tsx');
    expect(section).toMatch(/const switches = useCitySwitches\(\)/);
    expect(section).toMatch(/const designable = DESIGNABLE_HUBS\.filter\(\(k\) => switches\.shown\(k\)\)/);
    expect(section).toMatch(/\{designable\.map\(\(key\) => \{/);
    expect(section).not.toMatch(/\{DESIGNABLE_HUBS\.map/);
    // The count and the sentence under the grid speak of the hubs on offer only.
    expect(section).toMatch(/const hiddenHere = \[\.\.\.hidden\]\.filter\(\(k\) => switches\.shown\(k\)\)/);
    expect(section).toMatch(/const onCount = designable\.length - hiddenHere\.length/);
    // But the save still carries the whole list — an operator-off hub the
    // citizen had hidden stays hidden in their record, not silently un-hidden.
    expect(section).toMatch(/design\.mutate\(DESIGNABLE_HUBS\.filter\(\(k\) => next\.has\(k\)\)\)/);
  });
});

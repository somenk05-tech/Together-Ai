import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADER_TABS, NAV, HUBS } from '@/config/hubs';
import { DESIGNABLE_HUBS } from '@/config/services';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE STREET HAS FOUR DOORS — owner, 7 Sep: "the top hub on the home page
 * needs to have only 4 things, and in this same order: Personalize, Digital
 * Store, Local Market, and Together City TV."
 *
 * Thirteen tabs became four. The interesting half, as with every other door
 * this city has closed since Travel left the street on 15 Aug, is what must
 * NOT happen: HIDDEN IS NOT DELETED. The other eleven keep their route, their
 * billboard on the walk, their tile in the foot grid, their building on the
 * map, their banner on Personalize, their switch on Design Your Services and
 * their entry in the command palette. What they lose is a menu entry.
 */
describe('the four doors, in the owner’s order', () => {
  it('is exactly four, and exactly these', () => {
    expect([...HEADER_TABS]).toEqual(['personalize', 'ecommerce', 'services', 'social']);
  });

  it('reads Personalize · Digital Store · Local Market · Together TV', () => {
    // The fourth was "Together City TV" until 7 Sep, when the owner shortened
    // it: the city's name is already on the masthead above the row, and a tab
    // that repeats it is the signature said twice.
    const label = (key: string) => NAV.find((n) => n.key === key)?.label;
    expect(HEADER_TABS.map(label))
      .toEqual(['Personalize', 'Digital Store', 'Local Market', 'Together TV']);
  });

  it('is the owner’s order, not the alphabet — so it is written down, not sorted', () => {
    /* Thirteen tabs were sorted because "the only scan order a stranger can
       predict is the alphabet". That is true of thirteen and false of four:
       four doors are recognised rather than scanned, and alphabetical would
       open the city on Digital Store — the answer before the question. */
    const labels = HEADER_TABS.map((key) => NAV.find((n) => n.key === key)?.label ?? '');
    expect([...labels].sort((a, b) => a.localeCompare(b))).not.toEqual(labels);
    expect(read('layouts/Header.tsx')).not.toMatch(/sort\(\(a, b\) => a\.label\.localeCompare/);
  });

  it('holds neither of the citizen’s own doors', () => {
    // Mail and Personal were never on this row — they live in the action bar,
    // and the drawer keeps them below its hairline.
    expect(HEADER_TABS).not.toContain('mail');
    expect(HEADER_TABS).not.toContain('personal');
  });
});

describe('every menu draws the same four', () => {
  /* CityDoors is the row under the QR on the home page (7 Sep). It is a menu
     like the other three and belongs in this loop for the same reason: four
     hard-coded links on the hero is how the fifth door gets added in three
     places and forgotten in the fourth. */
  for (const surface of ['layouts/Header.tsx', 'layouts/CityDrawer.tsx', 'pages/Hubs.tsx',
    'components/CityDoors.tsx']) {
    it(`${surface} draws HEADER_TABS, not NAV`, () => {
      const src = read(surface);
      expect(src).toMatch(/HEADER_TABS/);
      // A menu that walked NAV would be a second answer to "what is in this
      // city" — which is the whole failure this list exists to prevent.
      expect(src).not.toMatch(/NAV\s*\.?\s*filter\(/);
    });
  }

  it('the drawer keeps Personal and Mail below the hairline', () => {
    // They left the run above with the eleven; they are not the eleven. On a
    // phone this drawer is the only place Personal has a door at all.
    const drawer = read('layouts/CityDrawer.tsx');
    const own = drawer.slice(drawer.indexOf('aria-label="Your own pages"'));
    expect(own).toMatch(/to="\/personal"/);
    expect(own).toMatch(/to="\/mail"/);
  });

  it('still wears the citizen’s design, so a door switched off is still gone', () => {
    for (const surface of ['layouts/Header.tsx', 'layouts/CityDrawer.tsx', 'pages/Hubs.tsx',
      'components/CityDoors.tsx']) {
      expect({ surface, filtered: read(surface).includes('hubOn(n.key)') })
        .toEqual({ surface, filtered: true });
    }
  });
});

describe('the row under the code is the same four', () => {
  it('the home page draws it, right after the install block', () => {
    const home = read('pages/Home.tsx');
    const qr = home.indexOf('<InstallCity />');
    const doors = home.indexOf('<CityDoors />');
    expect(qr).toBeGreaterThan(-1);
    // After the code, not before it: the hero ends on somewhere to go.
    expect(doors).toBeGreaterThan(qr);
  });

  it('paints the owner’s bloom from one token, and the token lives in tokens.css', () => {
    // The reference is a white pill with a light behind the glass. The colour
    // is a single token so no second gradient can drift away from it, and it
    // is declared where colour is allowed to be written down.
    expect(read('index.css')).toMatch(/background: var\(--door-bloom\)/);
    expect(read('styles/tokens.css')).toMatch(/--door-bloom:/);
  });
});

describe('hidden is not deleted — the other eleven', () => {
  const eleven = NAV.map((n) => n.key)
    .filter((k) => !HEADER_TABS.includes(k) && k !== 'mail' && k !== 'personal');

  it('keeps every one of them in NAV, which is the one full list', () => {
    // The command palette, the route index and Design Your Services all read
    // NAV. Taking a hub off a menu must never take it off the list.
    expect(eleven.length).toBeGreaterThan(8);
    for (const key of eleven) {
      expect({ key, inNav: NAV.some((n) => n.key === key) }).toEqual({ key, inNav: true });
    }
  });

  it('keeps every designable one switchable on Design Your Services', () => {
    for (const key of eleven) {
      if (!(key in HUBS)) continue;
      expect({ key, designable: (DESIGNABLE_HUBS as readonly string[]).includes(key) })
        .toEqual({ key, designable: true });
    }
  });

  it('keeps them findable by name — the registry never filters', () => {
    expect(read('nav/registry.ts')).toMatch(/for \(const nav of NAV\)/);
    expect(read('nav/registry.ts')).not.toMatch(/HEADER_TABS/);
  });

  it('keeps their billboards on the walk', () => {
    const home = read('pages/Home.tsx');
    for (const key of ['astrology', 'beauty', 'fitness', 'medical', 'nutrition', 'pets', 'realestate', 'jobs']) {
      expect({ key, onTheWalk: home.includes(`key: '${key}'`) }).toEqual({ key, onTheWalk: true });
    }
  });
});

describe('Local Services is called Local Market', () => {
  it('on the street, in the hub, and on its billboard', () => {
    expect(NAV.find((n) => n.key === 'services')?.label).toBe('Local Market');
    expect(HUBS.services.name).toBe('Local Market');
    expect(read('pages/Home.tsx')).toMatch(/services: \{ name: 'Local Market'/);
  });

  it('keeps its key and its path, so every link already sent still opens', () => {
    // The rename is a word, not an identifier. Same call the Digital Store
    // made on 6 Sep, for the same reason.
    expect(NAV.find((n) => n.key === 'services')?.path).toBe('/services');
    expect(HUBS.services.backPath).toBe('/services');
    expect(read('app/router.tsx')).toMatch(/path: '\/services'/);
  });

  it('says the new word wherever a citizen reads it, on both sides of the wire', () => {
    const problems: string[] = [];
    for (const f of ['features/services/pages/Browse.tsx', 'features/services/pages/MyBusiness.tsx',
      'features/pay/pages/Invoices.tsx', 'features/pay/pages/CreateInvoice.tsx']) {
      if (/Local Services/.test(read(f))) problems.push(f);
    }
    const server = (p: string) => readFileSync(join(SRC, '..', '..', 'together-city-chat', 'src', p), 'utf8');
    if (!/SPEND_HUB = 'Local Market'/.test(server('commerce/payments.service.ts'))) problems.push('payments.service.ts');
    if (!/sector\('services', 'Local Market'\)/.test(server('dev/feature-flags.ts'))) problems.push('feature-flags.ts');
    expect(problems).toEqual([]);
  });
});

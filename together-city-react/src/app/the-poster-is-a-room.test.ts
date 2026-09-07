import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS, NAV, hubDoor, hubIsOpen } from '@/config/hubs';
import { DESIGNABLE_HUBS } from '@/config/services';
import { HUB_HERO, HUB_LINE } from '@/pages/HubLanding';
import { HUB_ICON } from '@/nav/registry';
import type { HubKey } from '@/types';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * THE POSTER IS A ROOM — owner, 7 Sep, with a poster of his own and Apple One
 * as the reference under it: "create a hub called personalize and add these
 * inside it, use the walk the hub images to create this personalize hub."
 *
 * Two halves, and the second is the one worth a test file.
 *
 * THE FIRST is ordinary: a fifteenth designable hub, which this codebase has
 * made cheap on purpose — a key, a tab in its alphabetical place, an accent,
 * an icon, a plate, a line, a switch on Design Your Services and the same
 * switch on the operator's board. Every one of those is asserted somewhere
 * else already; what is asserted here is that this hub answered all of them
 * rather than most of them.
 *
 * THE SECOND is that Personalize is the first hub in the city whose LANDING IS
 * ITS CONTENT. Every other door opens on a photograph with one way in beneath
 * it and a numbered rail behind that; this one opens on ten districts laid out
 * as banners, and it owns no rooms at all. That shape had to be given a name
 * (`door`) rather than a branch, or the walk would have linked the card to
 * `items[0]` — a room that does not exist — and shipped a dead card.
 */
describe('Personalize is a hub, answered on every surface', () => {
  it('has a config, and its tag is what is behind the door', () => {
    expect(HUBS.personalize).toBeTruthy();
    expect(HUBS.personalize.name).toBe('Personalize');
    expect(HUBS.personalize.backPath).toBe('/personalize');
  });

  it('takes its alphabetical place on the tab row, between Personal and Pets', () => {
    const labels = NAV.map((n) => n.label);
    const at = labels.indexOf('Personalize');
    expect(at).toBeGreaterThan(-1);
    expect(labels[at - 1]).toBe('Personal');
    expect(labels[at + 1]).toBe('Pets');
    // And the run is still in `localeCompare` order, which is what puts three
    // P words next to each other and is the reason this is asserted at all.
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });

  it('is a hub the citizen may switch off, on both sides of the wire', () => {
    expect(DESIGNABLE_HUBS).toContain('personalize');
    const server = readFileSync(
      join(SRC, '..', '..', 'together-city-chat', 'src', 'profile', 'design-your-services.ts'), 'utf8');
    expect(server).toMatch(/'personalize'/);
    // …and one the operator may close for everybody.
    const flags = readFileSync(
      join(SRC, '..', '..', 'together-city-chat', 'src', 'dev', 'feature-flags.ts'), 'utf8');
    expect(flags).toMatch(/sector\('personalize', 'Personalize'\)/);
  });

  it('has a glyph, a plate and a street line like every other district', () => {
    expect(HUB_ICON.personalize).toBeTruthy();
    expect(HUB_HERO.personalize).toBe('personalize-hub.webp');
    expect(HUB_LINE.personalize).toBeTruthy();
    expect(existsSync(join(APP, 'public/assets/img/personalize-hub.webp'))).toBe(true);
  });

  it('stands on the walk and in the foot grid', () => {
    const home = code('pages/Home.tsx');
    expect(home).toMatch(/key: 'personalize'/);
    expect(home).toMatch(/to: '\/personalize'/);
  });
});

describe('a hub whose landing is its content', () => {
  it('names its door, because it has no first room to be one', () => {
    expect(HUBS.personalize.items).toEqual([]);
    expect(hubDoor(HUBS.personalize)).toBe('/personalize');
    // Without the door it would be a facade — the branch that labels a hub
    // "coming soon" instead of linking it.
    expect(hubIsOpen(HUBS.personalize)).toBe(true);
  });

  it('changes nothing for the hubs that do have rooms', () => {
    for (const key of Object.keys(HUBS) as HubKey[]) {
      if (key === 'personalize') continue;
      const cfg = HUBS[key];
      expect({ key, door: hubDoor(cfg) }).toEqual({ key, door: cfg.items[0]?.path ?? cfg.backPath });
    }
  });

  it('opens on the page, not on a plate in front of it', () => {
    const router = code('app/router.tsx');
    expect(router).toMatch(/path: '\/personalize', element: <Personalize \/>/);
    expect(router).not.toMatch(/HubLanding hub="personalize"/);
  });
});

describe('the nine banners', () => {
  const page = code('pages/Personalize.tsx');
  const NINE = ['beauty', 'fitness', 'nutrition', 'medical', 'financial',
    'realestate', 'astrology', 'dating', 'pets'] as const;

  it('is the districts the owner drew, in his poster\u2019s order', () => {
    const listed = page.slice(page.indexOf('const BANNERS'));
    const keys = [...listed.slice(0, listed.indexOf('];')).matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...NINE]);
  });

  it('leaves out the four districts nothing personalises in', () => {
    // Jobs, Local Services, the Digital Store and Together City TV are all
    // real districts with real rooms; none of them is set up from a profile,
    // and a banner here would promise a form that does not exist.
    for (const absent of ['jobs', 'services', 'ecommerce', 'social']) {
      expect({ absent, listed: (NINE as readonly string[]).includes(absent) })
        .toEqual({ absent, listed: false });
    }
  });

  it('leaves Entertainment out until its banner is drawn, and says so', () => {
    /* The poster names ten and nine banners were commissioned. Standing the
       tenth up out of its walk tile would put one cropped photograph with a
       label bolted under it in a column of nine finished pieces. The absence
       is a decision, so it is written down where the list is. */
    expect((NINE as readonly string[]).includes('entertainment')).toBe(false);
    expect(read('pages/Personalize.tsx')).toMatch(/ENTERTAINMENT IS ABSENT/);
  });

  it('draws the owner\u2019s own banner, one finished file per district', () => {
    // "Use these images directly." One file per key, named by the key, so a
    // tenth banner is one line in the list and one file beside the others.
    expect(page).toMatch(/src=\{`\/assets\/img\/personalize\/\$\{key\}\.webp`\}/);
    const problems: string[] = [];
    for (const key of NINE) {
      const path = join(APP, 'public/assets/img/personalize', `${key}.webp`);
      if (!existsSync(path)) { problems.push(`missing ${key}.webp`); continue; }
      const kb = Math.round(statSync(path).size / 1024);
      // Nine on one page: a banner over 160 KB is a page nobody waits for.
      if (kb > 160) problems.push(`${key}.webp is ${kb} KB`);
    }
    expect(problems).toEqual([]);
  });

  it('writes nothing beside the picture, because the picture is written on', () => {
    /* Owner: "use these images directly and no need to write it separately."
       Every banner carries its own eyebrow, headline, sentence and icon row.
       A name and a line set on paper next to it is the same sentence twice. */
    expect(page).not.toMatch(/pz-card-name|pz-card-line|pz-card-say|pz-card-mark/);
    expect(page).not.toMatch(/districtLine|BANNER_LINE/);
    // The name still reaches a screen reader — through the link, not a label.
    expect(page).toMatch(/aria-label=\{districtName\(key\)\}/);
    expect(page).toMatch(/alt=""/);
  });

  it('opens the district\u2019s own landing, at the owner\u2019s call', () => {
    // Not the district's first room, which is what the walk does. This page is
    // "which parts of my life", so the answer is the district's own front door.
    expect(page).toMatch(/to=\{HUBS\[key\]\.backPath\}/);
  });

  it('is the citizen\u2019s city, not ours \u2014 a hub switched off has no banner', () => {
    expect(page).toMatch(/useCityDesign\(\)/);
    expect(page).toMatch(/BANNERS\.filter\(\(key\) => hubOn\(key\)\)/);
  });

  it('has no Personalize button \u2014 every banner is already a door', () => {
    // Owner, 7 Sep. The poster has a pill under the headline; on the page it
    // would say the room's own name a second time, which is the "Explore ___"
    // pill the walk dropped for the same reason.
    expect(page).not.toMatch(/btn-gold|>Personalize</);
  });
});

describe('the banner is the whole card', () => {
  const css = read('styles/relief.css');

  it('carries no furniture of its own \u2014 no paper, no label, no scrim', () => {
    expect(css).not.toMatch(/\.pz-card-art|\.pz-card-say|\.pz-card-name|\.pz-card-line/);
    expect(css).toMatch(/\.pz-card \{[^}]*aspect-ratio: 3 \/ 1/);
    expect(css).toMatch(/\.pz-card \{[^}]*overflow: hidden/);
  });

  it('runs one to a row, on a desk as well as on a phone', () => {
    // Two to a row is a paragraph of real copy at about four pixels tall.
    expect(css).toMatch(/\.pz-run \{ display: grid; grid-template-columns: 1fr;/);
  });

  it('holds the lockup while the column runs past it', () => {
    expect(css).toMatch(/\.pz-say \{ position: sticky/);
    // …and lets go of it on a phone, where there is no column beside it.
    expect(css).toMatch(/@media \(max-width: 899px\) \{[\s\S]*?\.pz-say \{ position: static; \}/);
  });
});

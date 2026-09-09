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

  it('stands in the foot grid — and came off the walk on the owner’s call (7 Sep)', () => {
    const home = code('pages/Home.tsx');
    expect(home).toMatch(/to: '\/personalize'/);
    /* THE WALK PLATE IS GONE, deliberately. This walk IS ten of the districts
       Personalize opens onto, at full width, one to a row — a plate
       advertising the room you are standing in is the walk's own table of
       contents laid on top of the walk. Everything else it had stands: the
       foot-grid tile above, the route, the glyph, the hero, the street line,
       the command palette and its switch on Design Your Services. */
    const panels = home.slice(home.indexOf('const PANELS: Panel[] = ['));
    expect(panels.slice(0, panels.indexOf('];'))).not.toMatch(/key: 'personalize'/);
  });
});

describe('the nine doors under the hall (owner, 8 Sep)', () => {
  const page = read('pages/Personalize.tsx');

  it('draws the home page\u2019s own pill, once per district, in the hall\u2019s order', () => {
    /* "Add these buttons on the personalize page too for all the services
       inside the personalize page." The same .door glass the home row uses —
       one definition, not a second pill that drifts from it — walked from BAYS
       so the row reads left to right exactly as the photograph above it. */
    const row = page.slice(page.indexOf('<nav className="doors pz-doors"'), page.indexOf('</nav>'));
    expect(row).toMatch(/BAYS\.filter/);
    expect(row).toMatch(/className="door"/);
    expect(row).toMatch(/className="door-bloom"/);
    expect(row).toMatch(/districtName\(bay\.key\)/);
    expect(read('index.css')).toMatch(/\.pz-doors \{/);
  });

  it('is not the bays said twice — it is the doors a phone can see', () => {
    // A bay is an invisible column over a photograph, and the bays come off a
    // phone entirely. These are visible on every device.
    expect(page).toMatch(/className="pz-bay"/);
    expect(page.indexOf('pz-doors')).toBeGreaterThan(page.indexOf('className="pz-bays"'));
  });

  it('puts the line under the photograph, and the doors under the line (owner, 8 Sep)', () => {
    /* "Add the personalization line below the master image and then the
       buttons." It was the first line of the sticky column beside the nine
       banners \u2014 a screen and a half below the picture it belongs to, so on a
       phone the page opened on a hall, then nine pills, and only then said
       what any of it was for. */
    const hall = page.indexOf('className="pz-hall"');
    const head = page.indexOf('pz-head-hall');
    const doors = page.indexOf('pz-doors');
    expect(head).toBeGreaterThan(hall);
    expect(doors).toBeGreaterThan(head);
  });

  it('is three to a line on a phone, every pill the same size', () => {
    /* Owner: "for mobile have three buttons in one line\u2026 all button sizes
       needs to be same." Equal columns give equal WIDTH; stretching the row
       gives equal HEIGHT, which is what keeps a two-line label from standing
       taller than its neighbours. */
    const css = read('index.css');
    const doors = css.slice(css.indexOf('.doors {'), css.indexOf('}', css.indexOf('.doors {')));
    expect(doors).toMatch(/display: grid/);
    expect(doors).toMatch(/align-items: stretch/);
    const pz = css.slice(css.indexOf('.pz-doors {'), css.indexOf('}', css.indexOf('.pz-doors {')));
    expect(pz).toMatch(/grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.pz-doors \.door \{ font-size: 10px/);
  });

  it('wears the citizen\u2019s design — a district switched off has no pill', () => {
    const row = page.slice(page.indexOf('<nav className="doors pz-doors"'), page.indexOf('</nav>'));
    expect(row).toMatch(/hubOn\(bay\.key\)/);
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

/**
 * ── THE NINE BANNERS CAME OFF (owner, 9 Sep) ────────────────────────────────
 *
 * "Remove these images and tabs from here too — only keep the buttons."
 *
 * This block asserted the banner run in nine ways: the owner's order, the
 * men's cut, one finished file per district, the walk's caption under each
 * picture, the door each one opened, and the citizen's own switches. All of it
 * described a grid of pictures that duplicated the nine glass pills one screen
 * above it — the page asked a citizen to choose from the same list twice, and
 * the second ask was four screens of scroll.
 *
 * WHAT IS ASSERTED NOW is that it left cleanly and took nothing with it that
 * the page still needs. The doors, the hall and its nine bays are unchanged
 * and still have their own blocks above and below this one.
 */
describe('the nine banners came off, and the doors did not', () => {
  const page = code('pages/Personalize.tsx');
  const css = read('styles/relief.css');

  it('draws no banner run, and keeps no list to draw one from', () => {
    expect(page).not.toMatch(/className="pz-run"/);
    expect(page).not.toMatch(/const BANNERS/);
    expect(page).not.toMatch(/const MENS_CUT/);
    expect(page).not.toMatch(/assets\/img\/personalize\/\$\{cut\}/);
  });

  it('keeps the pills, which were always the doors this page is for', () => {
    expect(page).toMatch(/className="doors pz-doors"/);
    expect(page).toMatch(/to=\{HUBS\[bay\.key\]\.backPath\}/);
    // …and still the citizen's own city: a district switched off has no pill.
    expect(page).toMatch(/BAYS\.filter\(\(bay\) => hubOn\(bay\.key\)\)/);
  });

  it('keeps the owner\u2019s words, which the pills cannot say for themselves', () => {
    /* Owner's call when the banners went: the lockup stays. It is the only
       place on the page that says what personalising BUYS. */
    expect(page).toMatch(/className="pz-say"/);
    expect(page).toMatch(/Personalize once, and Together City builds your own personalized store/);
    expect(page).toMatch(/Your preferences\. Your store\. Your city\./);
  });

  it('has no Personalize button \u2014 every door is already a door', () => {
    // Owner, 7 Sep. A pill saying the room's own name a second time.
    expect(page).not.toMatch(/btn-gold|>Personalize</);
  });

  it('leaves the pictures on disk, and the hall still choosing between two cuts', () => {
    /* Hidden is not deleted — Travel's rule since 15 Aug. The ten banner files
       stay in public/assets/img/personalize/ (the men's cut among them), and
       the HALL still reads the same answer it always did, so "update beauty
       for men users" (7 Sep) is unbroken where it is still drawn. */
    for (const f of ['beauty', 'beauty-male', 'fitness', 'pets']) {
      expect({ f, there: existsSync(join(SRC, `../public/assets/img/personalize/${f}.webp`)) })
        .toEqual({ f, there: true });
    }
    expect(page).toMatch(/hall-\$\{hall\}\.webp/);
  });

  it('grows no caption vocabulary of its own on the way out', () => {
    // The page never had one and must not gain one: the walk's foot was
    // borrowed, and it went back with the banners that wore it.
    expect(css).not.toMatch(/\.pz-card-art|\.pz-card-say|\.pz-card-name|\.pz-card-line/);
    expect(page).not.toMatch(/district-card-foot/);
    expect(page).not.toMatch(/BANNER_LINE/);
  });
});

describe('the hall at the top, and the nine bays in it', () => {
  const page = code('pages/Personalize.tsx');
  const css = read('styles/relief.css');
  const NINE = ['beauty', 'fitness', 'nutrition', 'medical', 'dating',
    'realestate', 'astrology', 'pets', 'financial'] as const;

  it('draws a hall for each of the two answers, and both files exist', () => {
    expect(page).toMatch(/hall-\$\{hall\}\.webp/);
    const problems: string[] = [];
    for (const which of ['male', 'female']) {
      const path = join(APP, 'public/assets/img/personalize', `hall-${which}.webp`);
      if (!existsSync(path)) { problems.push(`missing hall-${which}.webp`); continue; }
      const kb = Math.round(statSync(path).size / 1024);
      if (kb > 160) problems.push(`hall-${which}.webp is ${kb} KB`);
    }
    expect(problems).toEqual([]);
  });

  it('chooses the hall from the social answer, never the clinical one', () => {
    /* `resolvedGender` is the server's one answer — the split identity field
       where a citizen has one, the pre-split column where they do not.
       `sexAtBirth` is clinical, is never shown to another citizen, and has no
       business choosing a photograph. */
    expect(page).toMatch(/master\.data\?\.resolvedGender === 'Male'/);
    expect(page).not.toMatch(/sexAtBirth|genderIdentity/);
  });

  it('shows a picture on an answer and never on a guess', () => {
    // Anything that is not an explicit Male takes the other hall: signed out,
    // still loading, unanswered, non-binary, other. One is the default.
    expect(page).toMatch(/\? 'male' : 'female'/);
  });

  it('asks the server for the record only when somebody is signed in', () => {
    // /personalize is a page a signed-out visitor can stand on; firing the
    // master-profile query there is a 401 the page has no use for.
    expect(page).toMatch(/useMasterProfile\(authed\)/);
    expect(read('features/profile/hooks.ts')).toMatch(/useMasterProfile\(enabled = true\)/);
  });

  it('lays nine bays across the hall, in the picture’s own order', () => {
    const at = page.indexOf('const BAYS');
    const keys = [...page.slice(at, page.indexOf('];', at)).matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...NINE]);
  });

  it('covers the whole picture, edge to edge, with no bay overlapping another', () => {
    /* The widths are midpoints between neighbouring label centres, so they
       must sum to the picture. A gap is a label nothing opens; an overlap is
       a label that opens its neighbour. */
    const at = page.indexOf('const BAYS');
    const widths = [...page.slice(at, page.indexOf('];', at)).matchAll(/width: ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(9);
    expect(Math.round(widths.reduce((a, b) => a + b, 0) * 100) / 100).toBe(100);
  });

  it('opens the district’s own landing, and names it for a reader who cannot see it', () => {
    expect(page).toMatch(/to=\{HUBS\[bay\.key\]\.backPath\}/);
    expect(page).toMatch(/aria-label=\{districtName\(bay\.key\)\}/);
    // The picture carries every word, so the img itself is decorative.
    expect(page).toMatch(/className="no-case" src=\{`\/assets\/img\/personalize\/hall/);
  });

  it('draws a switched-off district but does not open it', () => {
    // A photograph cannot lose a room; a door can be closed.
    expect(page).toMatch(/hubOn\(bay\.key\)/);
    expect(page).toMatch(/className="pz-bay is-off"/);
    expect(css).toMatch(/\.pz-bay\.is-off \{ pointer-events: none; \}/);
  });

  it('lights a bay in the colour of the room it opens', () => {
    expect(css).toMatch(/\.pz-bay:hover \{ background: var\(--accent-soft\); \}/);
    expect(page).toMatch(/data-hub=\{bay\.key\}/);
  });

  it('draws nothing at all — a bay is invisible until a finger is on it', () => {
    /* Owner, 7 Sep: "there should not be any lines visible in the image." Nine
       transparent boxes over a photograph are the kind of thing that acquires
       a hairline the first time somebody debugs them, so the absence is
       asserted rather than assumed: at rest a bay has no ground, no edge and
       no fall. The hover wash and the keyboard outline are the only paint it
       is allowed, and both are answers to something the citizen is doing. */
    const at = css.indexOf('.pz-bay {');
    const rest = css.slice(at, css.indexOf('}', at));
    for (const forbidden of [/(^|;)\s*background:/, /(^|;)\s*border:/, /border-(top|right|bottom|left|color|style|width)/,
      /(^|;)\s*outline:/, /box-shadow/]) {
      expect({ forbidden: String(forbidden), found: forbidden.test(rest) })
        .toEqual({ forbidden: String(forbidden), found: false });
    }
    // …and the picture itself is not cased: the city's universal image rim
    // would draw a line round the hall, which is the same complaint.
    const hallAt = css.indexOf('.pz-hall img {');
    const hall = css.slice(hallAt, css.indexOf('}', hallAt));
    expect(hall).not.toMatch(/box-shadow|border:/);
    expect(page).toMatch(/className="no-case" src=\{`\/assets\/img\/personalize\/hall/);
  });

  it('takes the bays off a phone, where a ninth of the width is not a door', () => {
    expect(css).toMatch(/@media \(max-width: 899px\) \{[\s\S]*?\.pz-bays \{ display: none; \}/);
  });
});

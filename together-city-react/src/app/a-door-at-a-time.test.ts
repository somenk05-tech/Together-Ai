import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/** The API's copy of the room list, read as text from the other package. */
const FLAGS_FILE = join(SRC, '../../together-city-chat/src/dev/feature-flags.ts');

/**
 * ── ONE DOOR AT A TIME ──────────────────────────────────────────────────────
 *
 * Owner, 9 Sep: "Give me a hide-from-city button for each hub and each side hub
 * tab — for example Ask the Astrologer — all 01-06 in Astrology, the same for
 * the entire site and all hubs. I should be able to turn on and off for the
 * entire website."
 *
 * The sector switches have existed since 27 Aug. What is new is the level
 * below: the numbered rail down the left of every hub, each entry its own
 * switch, decided once for everybody on /dev.
 *
 * THE DRIFT THIS FILE EXISTS FOR. The rails live here, in config/hubs.ts; the
 * switches live in the API, because a key that can be written to a database
 * has to be a fixed list the server declares. Two lists, and the failure is
 * silent in both directions — a room added here with no switch there is a door
 * the operator cannot close, and a switch there for a room that no longer
 * exists is a control that does nothing and says nothing. So this test reads
 * BOTH and refuses to let them part.
 */
describe('every room on every rail has a switch', () => {
  const serverText = existsSync(FLAGS_FILE) ? readFileSync(FLAGS_FILE, 'utf8') : '';
  /* Room entries are written one per line as ['01', '/path', 'Label'] — the
     shape the generator emits and the only shape this reads. */
  const serverRooms = [...serverText.matchAll(/^\s*\['(\d\d)', '([^']+)', '((?:[^'\\]|\\.)*)'\],$/gm)]
    .map((m) => ({ index: m[1], path: m[2], label: m[3].replace(/\\'/g, "'") }));
  const railRooms = Object.entries(HUBS).flatMap(([hub, cfg]) =>
    cfg.items.map((i) => ({ hub, index: i.index, path: i.path, label: i.label })));

  it('reads the API\'s list at all', () => {
    /* If this fails first, the two below are meaningless rather than passing —
       an empty list matches nothing and would quietly assert nothing. */
    expect(serverText).not.toBe('');
    expect(serverRooms.length).toBeGreaterThan(100);
  });

  it('has a switch for every rail entry in the city', () => {
    const have = new Set(serverRooms.map((r) => r.path));
    const missing = railRooms.filter((r) => !have.has(r.path));
    expect(missing.map((r) => `${r.hub} ${r.index} ${r.path}`)).toEqual([]);
  });

  it('has no switch for a room that is not on a rail', () => {
    const have = new Set(railRooms.map((r) => r.path));
    const extra = serverRooms.filter((r) => !have.has(r.path));
    expect(extra.map((r) => r.path)).toEqual([]);
  });

  it('carries the same number and the same words the citizen reads', () => {
    /* The number is a reading order and the label is the door's name; an
       operator hiding "04 Gemstones" and a citizen looking at "04 Gemstones"
       must be looking at the same thing. */
    const byPath = new Map(serverRooms.map((r) => [r.path, r]));
    for (const room of railRooms) {
      expect(byPath.get(room.path)).toEqual({ index: room.index, path: room.path, label: room.label });
    }
  });

  it('gives every hub with a rail a sector switch to hang under', () => {
    /* Baby Care, Travel and Family Nutrition had rooms and no sector card
       before 9 Sep. A room under a sector nobody drew would be a switch on a
       page that never renders it. */
    const sectors = [...serverText.matchAll(/^\s*sector\('([a-z]+)'/gm)].map((m) => m[1]);
    for (const [hub, cfg] of Object.entries(HUBS)) {
      if (cfg.items.length === 0) continue;
      expect(sectors).toContain(hub);
    }
  });
});

describe('what a hidden room does to the city', () => {
  it('leaves the rail, without renumbering the doors that stay', () => {
    /* 01, 02, 04 is the honest picture of a rail with a room off it.
       Renumbering here would put a different number on the same door than the
       operator's page, the audit row and anybody's memory of it. */
    const side = code('layouts/Sidebar.tsx');
    expect(side).toMatch(/const items = hub\.items\.filter\(\(it\) => switches\.pageShown\(it\.path\)\)/);
    expect(side).toMatch(/\{items\.map\(\(it\) => \(/);
    expect(side).not.toMatch(/idx \+ 1|reindex|renumber/i);
  });

  it('takes the hub\'s own door with it when the door was that room', () => {
    /* `hubDoor` answers with the first room, and the first room is the one an
       operator is most likely to switch off. */
    const landing = code('pages/HubLanding.tsx');
    expect(landing).toMatch(/hubDoor\(\{ \.\.\.cfg, items: cfg\.items\.filter\(\(i\) => switches\.pageShown\(i\.path\)\) \}\)/);
  });

  it('leaves Search the city too, because the button says the city', () => {
    /* A room a citizen can still reach by typing its name into Search has been
       hidden from one menu, not from the city. */
    const palette = code('components/CommandPalette.tsx');
    expect(palette).toMatch(/switches\.pageShown\(d\.path\) && \(!d\.hub \|\| switches\.shown\(d\.hub\)\)/);
  });

  it('does not read the citizen\'s own design into the search', () => {
    /* Design Your Services is somebody tidying their own menus. If tidying a
       menu also deleted the room from search, they would have no way back to a
       hub they hid last month except by remembering its URL. */
    const palette = code('components/CommandPalette.tsx');
    expect(palette).not.toMatch(/useCityDesign\(\)|hubOn/);
  });

  it('fails open everywhere, including against a server that has never heard of rooms', () => {
    const hook = code('hooks/useCityDesign.ts');
    expect(hook).toMatch(/offPages \?\? \[\]/);
    expect(hook).toMatch(/pageShown: \(path: string\): boolean => !offPages\.has\(path\)/);
  });
});

describe('the operator\'s page', () => {
  const dev = code('features/dev/pages/Dev.tsx');

  it('draws the rooms folded inside their sector, not as a wall of switches', () => {
    expect(dev).toMatch(/<Fold /);
    expect(dev).toMatch(/Rooms on the \$\{row\.label\} rail/);
    expect(dev).toMatch(/rooms\.map\(\(r\) => <RoomSwitch/);
  });

  it('asks for the same ceremony a sector asks for', () => {
    /* The same ops.flags grant, the same eight-character reason, the same
       audit row. A control cheaper to press than to explain is how a rail
       loses a door nobody can account for. */
    /* Both kinds go through the one mutation, which is why they read as a
       ternary rather than as two call sites: 'page' hides, 'page-kill' closes. */
    expect(dev).toMatch(/kind: kill \? 'page-kill' : 'page'/);
    expect(dev).toMatch(/const ready = reason\.trim\(\)\.length >= 8/);
  });

  it('prints the path, because a label is not an identity', () => {
    expect(dev).toMatch(/<span style=\{roomPath\}>\{room\.key\}<\/span>/);
  });
});

/**
 * ── AND A KILL SWITCH FOR EACH TAB ──────────────────────────────────────────
 *
 * Owner, 9 Sep, after the hide switches shipped: "Create kill switches for each
 * tab."
 *
 * A hub's kill switch is a prefix match. A room's cannot be — six Astrology
 * rooms share /api/astrology — so the API side is a decorator on the handlers a
 * room owns, and the web side is a card in front of the page. This half of the
 * file holds the web side, and the one property that makes the pair honest:
 * every room's page closes, whether or not that room owns a route.
 */
describe('a closed room', () => {
  it('is gated in one place every page goes through', () => {
    /* A gate a route opts into is a gate the next route forgets, and the
       failure is invisible: the page renders and its requests 503. */
    const router = code('app/router.tsx');
    expect(router).toMatch(/const wrap = \(el: JSX\.Element\) => <ChunkBoundary><RoomGate>\{el\}<\/RoomGate><\/ChunkBoundary>/);
  });

  it('says it is closed rather than pretending it never existed', () => {
    const gate = code('components/RoomGate.tsx');
    expect(gate).toMatch(/This room is closed just now/);
    /* Not "no access", which sends somebody to support asking what they did;
       not "not found", which makes a returning citizen doubt their memory. */
    expect(gate).not.toMatch(/do not have access|does not exist|not found/i);
    expect(gate).toMatch(/Nothing you have saved here has been touched/);
  });

  it('fails open, so a slow switch list never closes a room', () => {
    const gate = code('components/RoomGate.tsx');
    expect(gate).toMatch(/if \(switches\.pageOpen\(pathname\)\) return <>\{children\}<\/>/);
    const hook = code('hooks/useCityDesign.ts');
    expect(hook).toMatch(/closedPages \?\? \[\]/);
    expect(hook).toMatch(/pageOpen: \(path: string\): boolean => !closedPages\.has\(path\)/);
  });
});

describe('the two switches a room has on /dev', () => {
  const dev = code('features/dev/pages/Dev.tsx');

  it('asks one question at a time', () => {
    /* Arming the second while the first is armed would put two reason boxes
       and two confirm buttons on one row. */
    expect(dev).toMatch(/useState<null \| 'hide' \| 'kill'>\(null\)/);
    expect(dev).toMatch(/kind: kill \? 'page-kill' : 'page'/);
  });

  it('names the routes the kill switch will refuse, before it is pressed', () => {
    expect(dev).toMatch(/the API refuses \{routes\.length\}/);
  });

  it('says plainly when a room owns no route of its own', () => {
    /* The E-Commerce precedent: a switch that describes itself accurately is
       worth more than one that overstates. 65 of the 108 rooms are in this
       case, and the card must not imply an API that will close. */
    expect(dev).toMatch(/This room owns no route of its own/);
  });
});

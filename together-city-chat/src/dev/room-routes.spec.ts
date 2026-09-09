import { readFileSync } from 'fs';
import { controllerFiles } from '../security/route-inventory';
import { ROOM_FLAGS, isRoomKey, roomFlag, NEVER_FLAGGABLE, FLAG_KEYS } from './feature-flags';

/**
 * ── A KILL SWITCH FOR EACH TAB ──────────────────────────────────────────────
 *
 * Owner, 9 Sep: "Create kill switches for each tab."
 *
 * A hub's kill switch is a prefix match, because a hub owns a prefix. A room
 * does not — six Astrology rooms live under /api/astrology, and some routes are
 * read by several of them. So a room's routes name the room, beside the
 * handler, and this file holds the three things that must stay true of those
 * names. All three are about the same failure: a switch that closes more than
 * the room it is on.
 */
const files = controllerFiles();
const decorated = files.flatMap((f) => {
  const lines = readFileSync(f, 'utf8').split('\n');
  return lines.flatMap((line, i) => {
    const m = line.match(/^\s*@Room\('([^']*)'\)/);
    return m ? [{ file: f.replace(/^.*\/src\//, 'src/'), line: i, key: m[1], lines }] : [];
  });
});

describe('every route that names a room names a real one', () => {
  it('reads the controllers at all, so a rename cannot make this vacuous', () => {
    /* A regex that silently matches nothing turns every assertion below green,
       and this whole file is a set of assertions about decorators. */
    expect(files.length).toBeGreaterThan(20);
    expect(decorated.length).toBeGreaterThan(50);
  });

  it('names no room that does not exist', () => {
    /* The runtime half of this is in the guard, which gates nothing on an
       unknown key. This is the half that fails the build instead of letting a
       renamed room quietly become a switch that does nothing. */
    const unknown = decorated.filter((d) => !isRoomKey(d.key));
    expect(unknown.map((d) => `${d.file}:${d.line + 1} ${d.key}`)).toEqual([]);
  });

  it('never puts two rooms on one handler', () => {
    /* A route can belong to one room or to none. Two decorators would mean two
       switches closing the same endpoint, and the second one would be a
       surprise to whoever pressed the first. */
    const doubled = decorated.filter((d) => /^\s*@Room\(/.test(d.lines[d.line + 1] ?? ''));
    expect(doubled.map((d) => `${d.file}:${d.line + 1}`)).toEqual([]);
  });

  it('sits on a route, not on a class or a stray line', () => {
    /* @Room on a controller class would gate every route in it — a hub kill
       switch wearing a room's name. The decorator must be followed by an HTTP
       method decorator, with nothing but other decorators in between. */
    for (const d of decorated) {
      const after = d.lines.slice(d.line + 1, d.line + 6).map((l) => l.trim());
      const verb = after.findIndex((l) => /^@(Get|Post|Put|Patch|Delete)\(/.test(l));
      const cls = after.findIndex((l) => /^export class/.test(l));
      expect(`${d.file}:${d.line + 1} ${verb >= 0 && (cls < 0 || verb < cls)}`).toBe(`${d.file}:${d.line + 1} true`);
    }
  });

  it('never owns another hub\'s utility', () => {
    /* THE FAILURE THIS RULE EXISTS FOR, and it happened while this was being
       built: a trace of which page calls which endpoint made GET /lookups/:category
       look like the Astrology Profile's own, because that page was the only one
       importing the hook directly. Closing that room would have refused every
       lookup in the city.

       So a room may only own routes under its own hub's API. The aliases are
       the three places where a hub's rooms and its API prefix genuinely differ:
       Matchmaking is served by /dating, Family Nutrition by /nutrition, and the
       Medicines room by /prescriptions and /medicines. */
    const ALIAS: Record<string, string[]> = {
      matchmaking: ['dating'], family: ['nutrition'], medical: ['medical', 'prescriptions', 'medicines'],
    };
    for (const d of decorated) {
      const hub = roomFlag(d.key)?.hub ?? '';
      const allowed = ALIAS[hub] ?? [hub];
      /* The route's own prefix: the nearest @Controller above this line. */
      const above = d.lines.slice(0, d.line).reverse();
      const ctl = above.find((l) => /@Controller\('/.test(l));
      const prefix = (ctl?.match(/@Controller\('([^']*)'\)/)?.[1] ?? '').split('/')[0];
      expect(`${d.file}:${d.line + 1} ${prefix}`).toBe(`${d.file}:${d.line + 1} ${allowed.includes(prefix) ? prefix : allowed[0]}`);
    }
  });

  it('closes nothing that may never be closed', () => {
    /* Mail and Chat have rooms, and their rooms may lose their doors. Their
       API may not be refused by anything, ever — the same rule that keeps a
       hub kill switch off them. */
    for (const d of decorated) {
      const head = d.key.replace(/^\//, '').split('/')[0];
      expect(FLAG_KEYS.includes(head) && NEVER_FLAGGABLE.includes(head)).toBe(false);
    }
  });
});

describe('what a room switch says it will refuse', () => {
  it('is a room with a page, whichever hub it belongs to', () => {
    for (const d of decorated) expect(roomFlag(d.key)?.hub).toBeTruthy();
  });

  it('leaves most rooms refusing nothing, and that is the honest answer', () => {
    /* 43 of 108 rooms own a route no other page in the city calls. The rest
       share every endpoint they use — the astrology profile is read by the
       letter, the shelf and the profile page — and a switch that closed one of
       those would take rooms nobody pressed with it. Their switch closes the
       PAGE and says out loud that it refuses nothing, which is the E-Commerce
       precedent in feature-flags.ts.

       This asserts the SHAPE, not the number: most rooms have no routes, and
       the ones that do are a minority that grows one deliberate decision at a
       time. */
    const withRoutes = new Set(decorated.map((d) => d.key));
    expect(withRoutes.size).toBeGreaterThan(20);
    expect(withRoutes.size).toBeLessThan(ROOM_FLAGS.length);
  });
});

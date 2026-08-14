import { manifest, upTo, byId, clearManifestCache } from './manifest';
import { allRoutes } from '../security/route-inventory';

beforeAll(() => clearManifestCache());

/**
 * The manifest is the only thing standing between 386 routes and an
 * unrecoverable Tuesday.
 *
 * `docs/api.md` is generated because a hand-written list of 350 routes is stale
 * the week it is written. The same argument applies with more force here: a
 * hand-written list of what an AI may call is not merely stale when it drifts,
 * it is dangerous in one direction and broken in the other. So the manifest is
 * generated from the decorators, and these are the gates that keep it honest.
 */
describe('gate 1 — every capability resolves to a live route', () => {
  it('has entries at all', () => {
    // A manifest that silently empties is the worst failure mode: nothing
    // errors, Mira simply stops being able to do anything.
    expect(manifest().length).toBeGreaterThan(0);
  });

  it('each one names a route that actually exists', () => {
    const live = new Set(allRoutes().map((r) => `${r.file}::${r.id}`));
    for (const c of manifest()) {
      expect(live.has(`${c.file}::${c.id}`)).toBe(true);
    }
  });

  it('each one acts for a known citizen', () => {
    // A capability that does not receive @CurrentUser() cannot check whose
    // data it is touching. Mira acts on behalf of exactly one person and a
    // route that does not know who is asking has no business in her list.
    for (const c of manifest()) {
      expect(c.takesCurrentUser).toBe(true);
    }
  });
});

describe('gate 2 — every capability has made its decisions', () => {
  it('has a non-empty intent', () => {
    for (const c of manifest()) {
      expect(typeof c.intent).toBe('string');
      expect(c.intent.trim().length).toBeGreaterThan(0);
    }
  });

  it('has a valid risk class', () => {
    for (const c of manifest()) {
      expect(['R0', 'R1', 'R2', 'R3', 'R4']).toContain(c.risk);
    }
  });

  it('R2 and R3 carry a confirmation sentence', () => {
    // The one that will actually fire on somebody one day. A committing or
    // spending capability without a confirm string is a route that would act
    // on a misheard sentence.
    for (const c of manifest()) {
      if (c.risk === 'R2' || c.risk === 'R3') {
        expect(typeof c.confirm).toBe('string');
        expect((c.confirm ?? '').trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('R4 does NOT carry one', () => {
    // R4 never confirms by voice — it hands over to the screen. A confirm
    // string on an R4 is a sign somebody meant R3.
    for (const c of manifest()) {
      if (c.risk === 'R4') expect(c.confirm).toBeUndefined();
    }
  });

  it('ids are unique', () => {
    const ids = manifest().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('gate 3 — the count is watched', () => {
  /**
   * A decorator dropped in a refactor is silent: the build passes, the tests
   * pass, and one of Mira's abilities simply stops existing. This is the same
   * argument as the route-count assertion in the API docs — the number is not
   * interesting, the CHANGE in it is.
   *
   * Raise this deliberately when you add a capability. Never lower it without
   * saying why in the commit.
   */
  const EXPECTED_AT_LEAST = 4;

  it(`has at least ${EXPECTED_AT_LEAST} capabilities`, () => {
    expect(manifest().length).toBeGreaterThanOrEqual(EXPECTED_AT_LEAST);
  });

  it('is a tiny fraction of the API surface, on purpose', () => {
    // v1 is what people say out loud, not everything the app can do. If this
    // ever inverts, somebody has decorated by sweep rather than by decision.
    expect(manifest().length).toBeLessThan(allRoutes().length / 4);
  });
});

describe('phase gating', () => {
  it('upTo("R0") returns only reads', () => {
    for (const c of upTo('R0')) expect(c.risk).toBe('R0');
  });

  it('upTo("R2") includes R0 and excludes R3', () => {
    const risks = new Set(upTo('R2').map((c) => c.risk));
    expect(risks.has('R3')).toBe(false);
    expect(risks.has('R4')).toBe(false);
  });

  it('phase 1 has something to answer with', () => {
    expect(upTo('R0').length).toBeGreaterThan(0);
  });
});

describe('the parse itself', () => {
  it('reads a real decorator off a real controller', () => {
    const wallet = manifest().find((c) => c.file.includes('financial') && c.path.includes('wallet'));
    expect(wallet).toBeDefined();
    expect(wallet!.risk).toBe('R0');
    expect(wallet!.intent).toMatch(/balance/i);
    expect(wallet!.utterances?.length).toBeGreaterThan(0);
  });

  it('byId round-trips', () => {
    const first = manifest()[0];
    expect(byId(first.id)?.id).toBe(first.id);
  });

  /**
   * EVERYTHING SHE MAY WANT, WRITTEN OUT ONCE.
   *
   * This list is the inventory, and asserting EQUALITY rather than membership is
   * the point of it. Two failures it catches, and both have happened:
   *
   * 1. A `@Mira()` bleeding onto the next route down the file. The parse ends a
   *    decorator block on the first line that is not a decorator or a comment;
   *    if that scoping breaks, a capability silently attaches to a handler
   *    nobody chose — and at R0 that is a read of the wrong thing, while at R2
   *    it would be an action.
   * 2. A capability appearing because somebody added a decorator without adding
   *    an executor branch. The switch in `mira.service.ts` keys off these ids
   *    exactly; an id here with no branch there answers "that's not something I
   *    can do yet" while claiming to be a capability, which is the `gap` outcome
   *    the ledger now records.
   *
   * Adding a capability means editing this list. That is the intended cost.
   */
  const OPENED = [
    'astrology GET daily', 'astrology GET gems', 'astrology GET remedies', 'astrology GET tarot/daily',
    'beauty GET routine',
    'drive GET', 'drive GET usage',
    'entertainment GET watchlist',
    'financial GET budgets', 'financial GET spending', 'financial GET transactions', 'financial GET wallet',
    'fitness GET log', 'fitness GET plan',
    'mail GET account',
    'medical GET summary',
    'medicines GET today',
    'notifications GET unread-count',
    'nutrition GET prep-alerts', 'nutrition GET targets',
    'profile GET completion', 'profile GET health-score', 'profile GET master',
    'restaurants GET discover', 'restaurants GET orders', 'restaurants GET reservations',
    'thoughts GET',
    'travel GET trips',
  ];

  it('does not attach a capability to the wrong handler', () => {
    expect(manifest().map((c) => c.id).sort()).toEqual([...OPENED].sort());
  });

  /**
   * AND THE PREFIX IS THE NEAREST CONTROLLER, NOT THE FIRST IN THE FILE.
   *
   * `prescriptions.controller.ts` declares two controllers. Matching the first
   * `@Controller(...)` in the file gave the medicines handler the id
   * `prescriptions GET today`, while the runtime registry — reading metadata off
   * the real handler — produced `medicines GET today`. One route, two ids, and
   * the executor keys off the runtime one: the source gates were guarding a
   * route that does not exist.
   *
   * Only one file in this API has two controllers, which is exactly why it
   * survived. Named here so it cannot come back quietly.
   */
  it('reads the id off the controller the handler is actually in', () => {
    const ids = manifest().map((c) => c.id);
    expect(ids).toContain('medicines GET today');
    expect(ids).not.toContain('prescriptions GET today');
  });
});

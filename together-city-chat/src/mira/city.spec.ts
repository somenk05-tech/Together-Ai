import { readFileSync } from 'fs';
import { join } from 'path';
import { CITY, EVERYWHERE, PERSONALISATION, findInCity, whyWeAsk } from './city';
import { violations } from './voice';
import { resolveChoice } from './choose';

/**
 * Mira's map, held against the real one.
 *
 * `config/hubs.ts` in the web package is the map of what a citizen can reach.
 * Mira's copy is declared separately because the two packages share nothing but
 * a network contract and deploy independently — but a copy that can drift is a
 * copy that WILL drift, and the failure mode is Mira confidently offering to
 * take somebody to a page that no longer exists.
 *
 * So it is asserted rather than imported, reading across the packages the same
 * way `route-reach.spec.ts` already does.
 */
const WEB_SRC = join(__dirname, '..', '..', '..', 'together-city-react', 'src');

function webPaths(): Set<string> {
  const out = new Set<string>();
  for (const file of ['config/hubs.ts', 'nav/registry.ts']) {
    let text = '';
    try { text = readFileSync(join(WEB_SRC, file), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/path:\s*'([^']+)'/g)) out.add(m[1]);
    for (const m of text.matchAll(/to=["']([^"']+)["']/g)) out.add(m[1]);
  }
  return out;
}

const WEB = webPaths();
const haveWeb = WEB.size > 0;

describe('the map does not drift', () => {
  it('can read the web package at all', () => {
    // If this fails, every assertion below is vacuously true — which is the
    // failure mode of a cross-package guard and worth its own test.
    expect(haveWeb).toBe(true);
    expect(WEB.size).toBeGreaterThan(30);
  });

  const rooms = CITY.flatMap((h) => h.rooms.map((r) => [h.key, r.path] as const));

  it.each(rooms)('%s → %s exists in the web app', (_hub, path) => {
    if (!haveWeb) return;
    // A hub landing (/astrology) or a declared room (/astrology/today). Either
    // is reachable; what must not happen is a path nobody declared.
    const known = WEB.has(path) || [...WEB].some((w) => w === path || path.startsWith(`${w}/`));
    expect(known).toBe(true);
  });

  it.each(EVERYWHERE.map((r) => [r.label, r.path] as const))('%s → %s exists', (_l, path) => {
    if (!haveWeb) return;
    const known = WEB.has(path) || [...WEB].some((w) => path.startsWith(w));
    expect(known).toBe(true);
  });

  it('every personalisation names a page you can actually reach', () => {
    if (!haveWeb) return;
    for (const p of PERSONALISATION) {
      const known = WEB.has(p.toldAt) || [...WEB].some((w) => p.toldAt.startsWith(w));
      expect(known).toBe(true);
    }
  });
});

describe('she answers "where is…" without a search results page', () => {
  it('finds a hub by what people call it', () => {
    expect(findInCity('groceries')[0]?.hub).toBe('nutrition');
    expect(findInCity('my balance')[0]?.hub).toBe('financial');
    expect(findInCity('plumber')[0]?.hub).toBe('services');
  });

  it('finds the places that are not hubs', () => {
    expect(findInCity('my files')[0]?.path).toBe('/drive');
    expect(findInCity('privacy')[0]?.path).toBe('/settings/privacy');
  });

  it('returns a handful, never a page of results', () => {
    // Somebody who asked where something is wants taking there, not handing
    // back into the thing they were already stuck in.
    expect(findInCity('a').length).toBeLessThanOrEqual(3);
    expect(findInCity('my').length).toBeLessThanOrEqual(3);
  });

  it('returns nothing rather than a bad guess', () => {
    expect(findInCity('')).toEqual([]);
    expect(findInCity('quarterly deferred revenue recognition')).toEqual([]);
  });
});

describe('personalisation is written as consequences, not as fields', () => {
  it('every change is something that happens, not something collected', () => {
    // "we collect your allergens" is a privacy policy. "no meal plan we build
    // will ever contain peanuts" is a reason. The second
    // is the only one that ever persuaded anybody.
    for (const p of PERSONALISATION) {
      expect(p.changes.length).toBeGreaterThan(0);
      for (const c of p.changes) {
        expect(c).not.toMatch(/\bwe (collect|store|gather|use your)\b/i);
        expect(c.length).toBeGreaterThan(20);
      }
    }
  });

  it('every offer is in voice', () => {
    for (const p of PERSONALISATION) expect(violations(p.offer)).toEqual([]);
    for (const p of PERSONALISATION) for (const c of p.changes) expect(violations(c)).toEqual([]);
  });

  it('the sensitive ones are marked, so she never volunteers them first', () => {
    const consented = PERSONALISATION.filter((p) => p.consented).map((p) => p.fact);
    expect(consented).toEqual(expect.arrayContaining(['A blood report', 'Health conditions']));
  });

  it('"why do you need that?" is always answerable', () => {
    for (const p of PERSONALISATION) expect(whyWeAsk(p.fact)).toBeDefined();
  });
});

/**
 * THE INDEX MATCHED LITERAL LABELS AND NOTHING ELSE.
 *
 * Fourteen hubs, forty-eight rooms, and not one room declared a `says` — so a
 * room was reachable only by typing its label exactly. Every line below is a
 * query that a citizen actually types and that used to go somewhere wrong or
 * nowhere at all: "medicines" landed on Blood analysis, "thoughts" on the city
 * feed, "meal plan" on the fitness plan, and "allergies", "settings", "help"
 * and "delete my account" returned nothing whatsoever.
 */
describe('she knows the words people actually use', () => {
  /** Mirrors CONTEST in mira.service.ts: below this gap she asks instead of
   *  going. A right answer she is not confident enough to give is still a turn
   *  spent asking, so these assert the gap and not only the winner. */
  const CONTEST = 0.25;

  const LANDS: Array<[string, string]> = [
    ['medicines', '/medical/medicines'],
    ['pills', '/medical/medicines'],
    ['thoughts', '/thoughts'],
    ['meal plan', '/nutrition/weekly'],
    ['my meal plan', '/nutrition/weekly'],
    ['profile', '/profile'],
    ['my profile', '/profile'],
    ['allergies', '/nutrition/preferences'],
    ['where do i set my allergies', '/nutrition/preferences'],
    ['blood report', '/medical/blood'],
    ['where do i upload my blood report', '/medical/blood'],
    ['chat', '/chats'],
    ['my chats', '/chats'],
    ['settings', '/settings'],
    ['notifications', '/social/notifications'],
    ['help', '/help'],
    ['support', '/help'],
    ['search', '/hubs'],
    ['photos', '/personal/album'],
    ['delete my account', '/settings'],
    ['recipes', '/nutrition/recipes'],
    ['tarot', '/astrology/tarot'],
    ['gemstones', '/astrology/gemstones'],
    ['remedies', '/astrology/remedies'],
    ['my files', '/drive'],
  ];

  it.each(LANDS)('“%s” takes her to %s, decisively', (q, path) => {
    const [top, second] = findInCity(q);
    expect(top?.path).toBe(path);
    expect(!second || top.score - second.score >= CONTEST).toBe(true);
  });

  /** A modest set, where a hub has an obvious Hindi word. Not a translation
   *  layer — the five words a Delhi citizen types without thinking. */
  const HINGLISH: Array<[string, string]> = [
    ['paisa', '/financial/wallet'],
    ['khana', '/nutrition'],
    ['ghar', '/realestate'],
    ['dawai', '/medical/medicines'],
    ['kaam', '/jobs'],
  ];

  it.each(HINGLISH)('“%s” finds its hub', (q, prefix) => {
    expect(findInCity(q)[0]?.path.startsWith(prefix)).toBe(true);
  });
});

describe('one typo is still the same word', () => {
  it('finds the room through a slipped finger', () => {
    expect(findInCity('buget')[0]?.path).toBe('/financial/budgets');
    expect(findInCity('calender')[0]?.path).toBe('/calendar');
  });

  it('but never outranks somebody who typed it correctly', () => {
    // A typo allowance that can win a contest is a typo allowance that
    // relabels correct queries. It sits below every real match by construction.
    expect(findInCity('budgets')[0].score).toBeGreaterThan(findInCity('buget')[0].score);
  });

  it('and does not fire on a short word, where one edit is a different word', () => {
    // "plan" and "plans", "log" and "dog", "list" and "last".
    expect(findInCity('dog')).toEqual([]);
  });
});

describe('a plural is the same word too', () => {
  it('finds the room from the singular', () => {
    expect(findInCity('transaction')[0]?.path).toBe('/financial/transactions');
    expect(findInCity('recipe')[0]?.path).toBe('/nutrition/recipes');
  });
});

describe('a weak lone hit is not an answer', () => {
  /**
   * "list" reverse-matched "List your business" at 0.5, had no runner-up, and
   * so passed the contest the service runs — the weakest possible evidence
   * producing the most decisive possible behaviour, straight into somebody's
   * business listing form.
   */
  it('stops taking “list” to the business listing form', () => {
    expect(findInCity('list')[0]?.path).not.toBe('/services/list');
  });

  it('says nothing at all when the only hit is a word inside a label', () => {
    // "analysis" is inside "Blood analysis" and "stone" inside "my stone", and
    // neither is a citizen asking to go there. Unopposed, they used to be.
    expect(findInCity('analysis')).toEqual([]);
    expect(findInCity('stone')).toEqual([]);
  });

  it('but two weak hits are a real question and still asked', () => {
    // The floor is about the UNOPPOSED weak hit. "business" genuinely could be
    // either room, and being asked is the right outcome.
    expect(findInCity('business').length).toBe(2);
  });
});

describe('two rooms never answer to the same name', () => {
  /**
   * Beauty had an Orders and Restaurants had an Orders, so "orders" rendered as
   * "Orders or Orders. Which one?" — and `resolveChoice` returns the first
   * label that matches, so whichever they answered they got Beauty and
   * `/restaurants/orders` was unreachable through that path, permanently.
   *
   * THAT PAIR IS GONE WITH THE RESTAURANTS HUB, and no two rooms in the city
   * are called the same thing today. The guard in `qualify` stays, because the
   * next hub to ship an Orders would reproduce the bug in one line — so what
   * is asserted now is the PROPERTY rather than the one case that taught it:
   * whatever she offers, no two options wear the same label. A test written
   * around a specific clash is a test that deletes itself the day the clash is
   * fixed, which is exactly what happened here.
   */
  it('never offers two options that read the same', () => {
    for (const probe of ['orders', 'explore', 'home', 'my', 'plan', 'profile', 'settings', 'list']) {
      const labels = findInCity(probe).map((f) => f.label);
      expect({ probe, unique: new Set(labels).size }).toEqual({ probe, unique: labels.length });
    }
  });

  it('and the answer she gets back picks the option it names', () => {
    const options = findInCity('recipes').map(({ label, path }) => ({ label, path }));
    expect(options.length).toBeGreaterThan(0);
    expect(resolveChoice(options[0].label, options)).toEqual(options[0]);
  });

  it('leaves a label alone when nothing else is called that', () => {
    expect(findInCity('recipes')[0]?.label).toBe('Recipes');
  });
});

describe('she never asks a question whose two answers are the same page', () => {
  /**
   * A hub's path is its first room's, so "wallet" matched the Financial hub AND
   * the Wallet room — two options, one page, and a citizen left guessing what
   * distinction she thought she was drawing.
   */
  it('collapses two hits on one path and goes', () => {
    const found = findInCity('wallet');
    expect(found.length).toBe(1);
    expect(found[0].path).toBe('/financial/wallet');
    expect(found[0].label).toBe('Wallet');
  });

  it('never returns the same path twice, whatever is asked', () => {
    for (const q of ['orders', 'wallet', 'my orders', 'explore', 'messages', 'business', 'plan']) {
      const paths = findInCity(q).map((f) => f.path);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
});

describe('“why do you need that?” is asked in words, not in schema', () => {
  /**
   * `whyWeAsk` required the WHOLE utterance to equal the fact, so the only
   * citizen who ever reached the personalisation graph was one who typed "food
   * allergies" and nothing else — and "where do I set my allergies", the
   * example in the file's own header, returned undefined.
   */
  it('reaches the graph from a question somebody would actually type', () => {
    expect(whyWeAsk('where do i set my allergies')?.fact).toBe('Food allergies');
    expect(whyWeAsk('allergies')?.fact).toBe('Food allergies');
    expect(whyWeAsk('where do i upload my blood report')?.fact).toBe('A blood report');
    expect(whyWeAsk('my birth details')?.fact).toBe('Date, time and place of birth');
  });

  it('and still answers the exact name of every fact', () => {
    for (const p of PERSONALISATION) expect(whyWeAsk(p.fact)).toBe(p);
  });

  it('stays quiet on a question that is not about a fact', () => {
    // It runs BEFORE the place-finder and takes the turn when it hits, so a
    // loose match here answers a question about a room with a lecture about a
    // field.
    expect(whyWeAsk('take me to my budgets')).toBeUndefined();
    expect(whyWeAsk('what is on tonight')).toBeUndefined();
    expect(whyWeAsk('')).toBeUndefined();
  });
});

describe('and asks when a word honestly means two places', () => {
  it('“explore” is a room in Real Estate and a room in Travel', () => {
    // Being taken to one of them at 1.0 with no runner-up is the bug: the word
    // does not choose between them, so neither should she.
    const found = findInCity('explore');
    expect(found.length).toBe(2);
    expect(found[0].score - found[1].score).toBeLessThan(0.25);
    expect(new Set(found.map((f) => f.label)).size).toBe(2);
  });
});

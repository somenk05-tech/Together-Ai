import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { allRoutes } from './route-inventory';

/**
 * Routes nothing calls.
 *
 * The gap this closes was expensive. The nutrition hub carried two complete
 * meal-planning systems and only one was reachable: thirteen endpoints, three
 * tables and forty service methods that no page had called in a long time. It
 * cost three wrong commits before anybody noticed — a performance fix aimed at a
 * query on the dead path, a whole feature built against rows the page never
 * reads, and an own-recipe privacy filter applied to the wrong pool while the
 * live one had none at all.
 *
 * None of that was careless. Every one was made by reading the code and
 * believing it, and the code said there were two ways to do the same thing.
 *
 * dead-export-audit.mjs, in the web package, catches an exported hook nothing
 * imports. It cannot see across the wire. This is the other half: every route
 * this API declares, checked against every URL the web app actually builds.
 *
 * WHAT THIS DOES NOT DO, so nobody reads it as more than it is. It matches URL
 * SHAPES, not calls — a path present in a file nothing imports still counts as
 * reached, which is exactly the case dead-export-audit exists for, and the two
 * are meant to be read together. It cannot see a URL assembled from pieces at
 * runtime. It knows nothing about the mobile shell or anything else that might
 * call this API, which is why the allow-list below exists and why every entry on
 * it carries a reason.
 */

const WEB_SRC = join(__dirname, '..', '..', '..', 'together-city-react', 'src');

/**
 * Routes with no web caller and a reason to exist anyway. A reason, not a
 * shrug: "we might need it" is how thirteen of them accumulated last time.
 */
const ALLOW: Array<{ id: string; why: string }> = [
  {
    id: 'health/health.controller.ts  GET /health',
    why: 'The platform health probe. Railway calls it, no page ever will, and '
      + 'the day a browser needs it something has gone badly wrong.',
  },
  ...(['astrology', 'beauty', 'fitness', 'recipes'] as const).map((kind) => ({
    id: `ai/ai-suggestions.controller.ts  GET /ai/${kind}`,
    why: 'Reached by api.get(`/ai/${kind}`) — one call site covering four literal '
      + 'routes. Letting a variable segment in a CALL match a literal segment in a '
      + 'ROUTE would clear these automatically and would also let /messages/${id} '
      + 'clear /messages/read, /messages/search and /messages/delivered, which is '
      + 'exactly the kind of route worth knowing about. Four named exceptions beat '
      + 'a rule that quietly excuses a whole class.',
  })),
  {
    id: 'media/media-status.controller.ts  GET /media/cors-status',
    why: 'A diagnostic for a human with curl, added when cross-origin media was '
      + 'failing silently. It answers a question you ask by hand.',
  },
];

/**
 * Routes with no web caller and NO reason yet — the backlog this guard found on
 * its first run.
 *
 * It is an exact list rather than a count, on purpose. A number going up says
 * "something new is unreachable"; an exact list also says "one of these got
 * wired up, take it off". Both are worth one deliberate edit, and the second is
 * how the list actually empties.
 *
 * Four entries came off this list the day after it was written, when the
 * matcher was fixed rather than the code — they had never been orphans at all.
 * That is the argument for the broad matcher above: a list with false entries in
 * it is a list people learn to scroll past.
 *
 * Nothing remaining here has been investigated. Some will be dead — the beauty looks
 * endpoints, the entertainment events flow and the prescriptions dose log all
 * look like features whose UI never arrived or has since gone. Some will be
 * false alarms from a URL this scanner cannot see being built. Working out
 * which is a job, not a guess, and pretending otherwise by writing invented
 * reasons into ALLOW above would defeat the whole point of having ALLOW.
 */
// Came off 1 Aug: auth's POST check-* pair and messages' REST read/delivered
// (all four were duplicates of the paths actually used — GET *-available and
// the socket receipts) were DELETED rather than wired.
const KNOWN_UNREACHED: string[] = [
  "beauty/beauty.controller.ts  DELETE /beauty/looks/*",
  "beauty/beauty.controller.ts  GET /beauty/looks",
  "beauty/beauty.controller.ts  GET /beauty/looks/*",
  "beauty/beauty.controller.ts  POST /beauty/looks",
  "connections/connections.controller.ts  GET /connections/module/*",
  "connections/connections.controller.ts  GET /connections/recipients",
  "conversations/conversations.controller.ts  DELETE /chat/*",
  "conversations/conversations.controller.ts  POST /chat/*/archive",
  "conversations/conversations.controller.ts  POST /chat/*/unarchive",
  "drive/drive.controller.ts  GET /drive/attachments",
  "drive/drive.controller.ts  POST /drive/files/*/attach",
  "entertainment/entertainment.controller.ts  GET /entertainment/categories",
  "entertainment/entertainment.controller.ts  GET /entertainment/events",
  "entertainment/entertainment.controller.ts  GET /entertainment/events/*",
  "entertainment/entertainment.controller.ts  GET /entertainment/movies/*",
  "entertainment/entertainment.controller.ts  GET /entertainment/tickets",
  "entertainment/entertainment.controller.ts  GET /entertainment/tv/*",
  "entertainment/entertainment.controller.ts  POST /entertainment/events/*/book",
  "medical/medical.controller.ts  GET /medical/shared-biomarkers/*",
  // GET /messages/search came off 1 Aug: the command palette searches messages.
  "nutrition/nutrition.controller.ts  GET /nutrition/diet-plans",
  "nutrition/nutrition.controller.ts  GET /nutrition/pantry/history",
  "nutrition/nutrition.controller.ts  GET /nutrition/qa/report",
  "nutrition/nutrition.controller.ts  GET /nutrition/targets/history",
  "nutrition/nutrition.controller.ts  POST /nutrition/pantry/settle",
  "prescriptions/prescriptions.controller.ts  GET /prescriptions/*",
  "prescriptions/prescriptions.controller.ts  GET /prescriptions/logs",
  "prescriptions/prescriptions.controller.ts  GET /prescriptions/today",
  "prescriptions/prescriptions.controller.ts  POST /prescriptions/doses",
  // GET /privacy/export came off 1 Aug: Settings' Download button calls it.
];

/** A declared route path, reduced to its shape: a :param becomes a star. */
const shapeOfRoute = (prefix: string, path: string): string =>
  ('/' + [prefix, path].filter(Boolean).join('/'))
    .replace(/\/:[^/]+/g, '/*')
    .replace(/\/+$/, '');

/** A called URL, reduced the same way: a template hole becomes a star, so
 *  the two can be compared without caring what the variable was named. */
const shapeOfCall = (url: string): string =>
  url
    .split('?')[0]                       // '/auth/email-available?email=…'
    .replace(/\$\{[^}]*\}/g, '*')        // a template hole is a parameter
    .replace(/\/+$/, '');

function webFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) webFiles(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const describeOrSkip = existsSync(WEB_SRC) ? describe : describe.skip;

/**
 * F.17's companion: the broad matcher above counts a URL string ANYWHERE in
 * the web package as reached — including in a file nothing imports. A dead
 * caller keeping a dead endpoint alive is exactly the two-plan-models failure.
 * So: walk the import graph from the app's entrypoints and check that every
 * URL string's file is actually part of the app.
 */
function reachableWebFiles(): Set<string> {
  const reached = new Set<string>();
  const resolve = (spec: string, fromDir: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = join(WEB_SRC, spec.slice(2));
    else if (spec.startsWith('.')) base = join(fromDir, spec);
    else return null; // package import
    for (const cand of [base, base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
    return null;
  };
  const queue = [join(WEB_SRC, 'main.tsx'), join(WEB_SRC, 'app', 'router.tsx')].filter((f) => existsSync(f));
  while (queue.length) {
    const f = queue.pop()!;
    if (reached.has(f)) continue;
    reached.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\()\s*['"]([^'"]+)['"]/g)) {
      const r = resolve(m[1], dirname(f));
      if (r && !reached.has(r)) queue.push(r);
    }
  }
  return reached;
}

describeOrSkip('every route this API declares is called by the web app', () => {
  /**
   * Every path-shaped string literal anywhere in the web package.
   *
   * Deliberately broader than "arguments to api.post". Several endpoints are
   * reached through a helper that takes the URL as a parameter —
   * useComposedMutation('/nutrition/plan/composed/skip') — and matching only
   * the call site missed eleven live routes on the first run. A guard that
   * reports live code is a guard somebody switches off, so the bias here is
   * heavily towards no false alarms: if the string appears in the web package
   * at all, the route counts as reached.
   *
   * The cost of that bias, stated rather than discovered: a client-side route
   * path identical to an API path would mask a dead endpoint. In this codebase
   * they do not collide, because the API paths carry prefixes the router does
   * not use.
   */
  const called = new Set<string>();
  if (existsSync(WEB_SRC)) {
    for (const f of webFiles(WEB_SRC)) {
      const src = readFileSync(f, 'utf8');
      // Any quoted string that starts with a slash. An earlier version listed
      // the characters it would accept inside one and got it wrong twice: a
      // query string ended the match early, and `${encodeURIComponent(x)}` has
      // parentheses that were not on the list. Both produced routes reported as
      // orphaned while they were being called several times a day. Accepting
      // everything up to the closing quote is the version with no such list to
      // get wrong.
      for (const q of ['`', "'", '"']) {
        const re = new RegExp(q + '(\\/[^' + q + '\\n]*)' + q, 'g');
        for (const m of src.matchAll(re)) called.add(shapeOfCall(m[1]));
      }
    }
  }

  it('finds the web package, or says it is skipping', () => {
    // A guard that silently passes because it could not find what it audits is
    // worse than no guard. If the sibling package is not checked out, the whole
    // describe is skipped and the runner says so out loud.
    expect(existsSync(WEB_SRC)).toBe(true);
    expect(called.size).toBeGreaterThan(50);
  });

  it('has no route the web app never asks for, beyond the reviewed set', () => {
    const allowed = new Set(ALLOW.map((a) => a.id));
    const orphans = allRoutes()
      .filter((r) => !called.has(shapeOfRoute(r.prefix, r.path)))
      .map((r) => `${r.file}  ${r.method} ${shapeOfRoute(r.prefix, r.path)}`)
      .filter((id) => !allowed.has(id));
    expect(orphans.sort()).toEqual([...KNOWN_UNREACHED].sort());
  });

  it('no URL string hides in a file the app never imports (F.17 companion)', () => {
    const reached = reachableWebFiles();
    /**
     * Files known to hold API strings while being unreachable — every one a
     * finished component awaiting the owner's wire-or-delete call. MealCard
     * was found BY this guard on its first run (1 Aug): the dead-export audit
     * never saw it because island files can import each other. The five became
     * six. Wiring or deleting one removes it from this list in the same commit.
     */
    const KNOWN_STRAY_FILES = new Set([
      'features/nutrition/components/MealCard.tsx',
      'features/nutrition/components/MedicalAdvisories.tsx',
    ]);
    const strays: string[] = [];
    for (const f of webFiles(WEB_SRC)) {
      if (/\.(test|spec)\.tsx?$/.test(f) || reached.has(f)) continue;
      if (KNOWN_STRAY_FILES.has(f.slice(WEB_SRC.length + 1))) continue;
      const src = readFileSync(f, 'utf8');
      for (const q of ['`', "'", '"']) {
        const re = new RegExp(q + '(\\/api\\/[^' + q + '\\n]*|\\/(auth|nutrition|medical|dating|jobs|social|financial|beauty|fitness|astrology|travel|restaurants|realestate|mail|drive|chat|messages|privacy|prescriptions|connections|notifications|users|calls|entertainment|city|lookups|ai)\\/[^' + q + '\\n]*)' + q, 'g');
        for (const m of src.matchAll(re)) strays.push(`${f.slice(WEB_SRC.length + 1)} :: ${m[1]}`);
      }
    }
    // Empty on the day it was written (0f54179 deleted the dead callers).
    // Anything appearing here is an API call in a file the app cannot reach —
    // wire the file up or delete it; do not let it keep an endpoint "alive".
    expect(strays).toEqual([]);
  });

  it('every allowed route carries a reason somebody wrote', () => {
    for (const a of ALLOW) expect(a.why.trim().length).toBeGreaterThan(40);
  });
});

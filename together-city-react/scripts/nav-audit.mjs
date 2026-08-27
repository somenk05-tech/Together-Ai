#!/usr/bin/env node
/**
 * Five checks, run against source: three from §1's acceptance criteria, one from
 * §3's ("ban hardcoded sample text in components via lint rule"), and one
 * holding the client's copy to the same voice the API enforces.
 *
 *   1. No page module is left unreachable. Removing a route without removing
 *      its component leaves a file that still contains the retired copy and
 *      still has to be maintained, so this is reported first — the other two
 *      checks skip unreachable modules, because a module nothing imports can
 *      never put a word on a screen.
 *   2. No retired label survives anywhere a user could read it.
 *   3. Every internal <Link to="/…"> and navigate('/…') in the app resolves to
 *      a route the router actually declares — either a live one or one of the
 *      deliberate redirects.
 *   4. No component ships invented sample data. The API's own
 *      route-exposure.spec.ts has enforced this server-side for a while; the
 *      client had no equivalent, which is where the review found most of it.
 *   5. No component says something the voice forbids. Mirrors
 *      together-city-chat/src/shared/voice.ts — most of what a citizen reads
 *      lives here, so enforcing it only on the API left the larger half open.
 *
 * Source rather than the built bundle, on purpose: the bundle is minified but
 * string literals survive minification, so a source scan finds the same
 * problems and points at the file and line instead of at a 400 kB chunk.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

/**
 * Labels the review retired. Each is paired with the paths allowed to still
 * contain it, because several of these words survive legitimately somewhere
 * else — Supplements still exists in the Fitness hub, the Family hub keeps its
 * own Shared Pantry and orders.
 */
const RETIRED = [
  { label: 'Nutrition History', allow: [] },
  // The Family hub keeps its own daily planner; only the individual one went.
  // §12 decides whether the family mirror follows it.
  { label: 'Daily Meal Planner', allow: ['features/family/'] },
  { label: 'Grocery Store', allow: [] },
  { label: 'My Health Profile', allow: [] },
  { label: 'Expert Care', allow: [] },
  { label: 'City Map', allow: [] },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full) && !/\.(test|spec)\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const problems = [];
const source = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

// ── 1. unreachable page modules ──────────────────────────────────────────
// Resolve every import specifier in the tree to a file, then a page is dead if
// nothing imports it. Exact resolution, not a filename guess: several hubs have
// their own pages/Orders.tsx, and a substring match would call all of them live
// the moment one of them was.
const ENTRY = /^(main|App)\.tsx?$|^app\/router\.tsx$/;
const EXTS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

const resolve = (spec, fromFile) => {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = join(dirname(fromFile), spec);
  else return null;                                  // node_modules
  for (const ext of EXTS) {
    const cand = base + ext;
    if (source.has(cand)) return cand;
  }
  return source.has(base) ? base : null;
};

const imported = new Set();
for (const [file, text] of source) {
  for (const m of text.matchAll(/(?:from\s*|import\()\s*['"]([^'"]+)['"]/g)) {
    const target = resolve(m[1], file);
    if (target) imported.add(target);
  }
}

const dead = files.filter(
  (f) => /\/pages\//.test(f) && !imported.has(f) && !ENTRY.test(relative(SRC, f)),
);
for (const f of dead) {
  problems.push(`${relative(SRC, f)}  dead page module — nothing imports it, delete the file`);
}
const deadSet = new Set(dead);

// ── 2. retired labels ────────────────────────────────────────────────────
for (const file of files) {
  if (deadSet.has(file)) continue;
  const rel = relative(SRC, file);
  const lines = source.get(file).split('\n');
  for (const { label, allow } of RETIRED) {
    if (allow.some((a) => rel.startsWith(a))) continue;
    lines.forEach((line, i) => {
      if (line.includes(label)) problems.push(`${rel}:${i + 1}  retired label "${label}"`);
    });
  }
}

// ── 3. internal links point at declared routes ───────────────────────────
const router = readFileSync(join(SRC, 'app/router.tsx'), 'utf8');
const labels = readFileSync(join(SRC, 'config/labels.ts'), 'utf8');

const declared = new Set();
for (const m of router.matchAll(/path:\s*'([^']+)'/g)) declared.add(m[1]);
// REMOVED_ROUTES keys are declared by the spread at the bottom of the router.
for (const m of labels.matchAll(/^\s*'(\/[^']+)':/gm)) declared.add(m[1]);

/** Does `path` match a declared route, allowing for :params and wildcards? */
const resolves = (path) => {
  const parts = path.split('/');
  for (const route of declared) {
    if (route === '*') continue;
    const rp = route.split('/');
    if (rp.length !== parts.length) continue;
    if (rp.every((seg, i) => seg.startsWith(':') || seg === parts[i])) return true;
  }
  return false;
};

const LINK = /(?:to=|navigate\()["'`](\/[a-zA-Z0-9/_-]*)["'`]/g;
for (const file of files) {
  if (file.endsWith('app/router.tsx') || deadSet.has(file)) continue;
  const rel = relative(SRC, file);
  source.get(file).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(LINK)) {
      const path = m[1];
      if (path === '/' || path.includes('${')) continue;
      if (!resolves(path)) problems.push(`${rel}:${i + 1}  link to undeclared route ${path}`);
    }
  });
}

// ── 4. no invented sample data in components (§3, FE-3.2) ───────────────
// Two shapes, because they fail differently.
//
// An identifier named for fake data — `const mockUser`, `function dummyPlan()` —
// is the same rule the API enforces in route-exposure.spec.ts. Matching the
// declaration rather than the bare word is deliberate: "fake" appears in honest
// comments and in the WebRTC test doubles, and a guard that fires on those
// teaches people to switch it off.
const FAKE_IDENTIFIER = /\b(?:const|let|var|function|class)\s+\w*(?:mock|dummy|fake|placeholder|sample)\w*/i;

// A person who does not exist, rendered as though they do. This is the client's
// version of the "Diet: everything · Goal: maintain" problem the review
// photographed — a screen filled in on the citizen's behalf.
const INVENTED_PERSON = /john doe|jane doe|lorem ipsum|@example\.(com|org)|555-01\d\d/i;

// A form field pre-filled with a literal.
//
// The blacklist above catches a fake person only if they are called John Doe.
// It sailed past "Aarav Sharma", a Bandra delivery address, "•••• •••• ••••
// 4821" and a check-in date of "Sun, 13 Jul 2026" — eight fields across the
// Travel, Restaurants and Nutrition hubs, three of them on checkout screens
// where the citizen is about to pay.
//
// The structural signal is better than any list of names: a default that is
// REAL comes from data, so it arrives as an expression. `defaultValue="..."`
// with prose inside it is a value invented at author time and rendered as the
// citizen's own. A short literal ("0", "1", "INR") is a genuine default and
// says nothing about anybody, so the rule needs a space before it fires.
const INVENTED_FIELD = /\bdefaultValue\s*=\s*"[^"]*\s[^"]*"/;

for (const file of files) {
  if (deadSet.has(file)) continue;
  const rel = relative(SRC, file);
  if (/\/fake-|\.stories\./.test(rel)) continue;   // declared test doubles
  source.get(file).split('\n').forEach((line, i) => {
    const code = line.split('//')[0];
    if (FAKE_IDENTIFIER.test(code)) {
      problems.push(`${rel}:${i + 1}  identifier named for invented data`);
    }
    // `placeholder="you@example.com"` is a hint about what to type, not a value
    // rendered as the citizen's. Ghost text is the one place a fake address is
    // the honest choice.
    if (INVENTED_PERSON.test(code) && !/placeholder\s*=/.test(code)) {
      problems.push(`${rel}:${i + 1}  invented sample data rendered as real`);
    }
    if (INVENTED_FIELD.test(code)) {
      problems.push(`${rel}:${i + 1}  form field pre-filled with an invented value — render it from the citizen's data or leave it empty with a placeholder`);
    }
  });
}

// ── 5. the copy obeys the city voice (mirrors the API's shared/voice.ts) ──
// Two codebases, no shared package, so the rules are stated twice. If either
// moves, both should.
//
// Whole lines with comments stripped, rather than string literals: JSX text is
// bare (`<p>Don't worry</p>`), so a literal-only scan would miss most of the
// copy on a page. Every pattern below is a multi-word phrase, which is why
// scanning code alongside prose produces no false positives — identifiers do
// not contain spaces.
const VOICE = [
  // The assistant as subject. It is not a character in this.
  [/\bas an? (?:AI|language model|assistant|chatbot)\b/i, 'speaks as an assistant'],
  [/\bI(?:'m| am) (?:just )?(?:an?|here|sorry|unable|afraid|happy to)\b/i, 'makes the assistant the subject'],
  [/\b(?:I'd|I would) (?:recommend|suggest|advise)\b/i, 'makes the assistant the recommender'],
  // The reader in the third person. It is one citizen, and we are talking to them.
  // Not followed by a capital: "the User Content Licence" is a document title
  // in the terms of service and is correctly written. "the user should" is not.
  // No `i` flag: with it, [A-Z] in the lookahead matches lowercase too and the
  // exception swallows every case, leaving the rule never firing.
  [/\b[Tt]he (?:[Uu]ser|[Pp]atient|[Ii]ndividual)\b(?!\s+[A-Z])/, 'refers to the reader in the third person'],
  [/\busers (?:should|can|may|must|will)\b/i, 'addresses a category, not a person'],
  // Comfort the app is not entitled to give. Warmth may change how something is
  // said, never what is said — a friendly sentence making a quiet clinical claim
  // is worse than a cold one that does not.
  [/\b(?:nothing|no reason) to (?:worry|be concerned|be alarmed)\b/i, 'a reassurance the app cannot make'],
  [/\b(?:don't|do not) worry\b/i, 'dismisses a feeling instead of acknowledging it'],
  [/\byou(?:'re| are) (?:completely |totally |perfectly )?(?:fine|healthy|okay)\b/i, 'a clinical claim about the reader'],
  [/\bthis is (?:completely |perfectly |totally )?normal\b/i, 'reassurance stated as fact'],
  // Filler that reads as machine.
  [/\bit(?:'s| is) important to (?:note|remember|understand)\b/i, 'stock filler'],
  [/\bplease note that\b/i, 'stock filler'],
  [/\bin conclusion\b/i, 'essay scaffolding'],
];

for (const file of files) {
  if (deadSet.has(file)) continue;
  const rel = relative(SRC, file);
  const text = source.get(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ');       // block comments
  text.split('\n').forEach((raw, i) => {
    // Line comments too: "the user can edit this" is an engineer talking to an
    // engineer and is correct there. The voice governs what a citizen reads.
    const line = raw.replace(/\/\/.*$/, '');
    // A VERBATIM CITATION IS NOT OUR VOICE, AND EDITING IT IS MISQUOTING.
    //
    // The Pet District's evidence file carries the sentences its numbers came
    // from — Merck's "adjust as needed for the individual patient", AAHA's
    // "modified based on how the patient responds", Cornell's "depends on the
    // individual cat". Every one trips the third-person rule, and every one is
    // somebody else's words under a `quote:` or `caveat:` key beside the URL
    // they were read from. Rewriting them to fit this rule would change what a
    // veterinary source is recorded as saying, which is a worse failure than
    // the one this rule prevents.
    //
    // Scoped to those two keys on purpose: prose in a `notes:` or a `label:` is
    // ours and still answers to the voice. One line of the pet catalogue said
    // "the individual product page returned a server error" and was reworded
    // rather than exempted.
    if (/^\s*"?(?:quote|caveat)"?\s*:/.test(line)) return;
    for (const [re, why] of VOICE) {
      if (re.test(line)) problems.push(`${rel}:${i + 1}  voice — ${why}`);
    }
  });
}

// ── 6. the menu does not promise what the page cannot do ─────────────────
/**
 * A page that honestly says "coming soon" is good behaviour. A menu entry that
 * sells it as finished undoes that before the citizen ever opens it.
 *
 * The Medical hub listed "Order Blood Tests — 5,000+ tests, home collection".
 * There are no partner labs and no home collection; the page behind it said so
 * plainly, and the person reading the menu had already been told otherwise.
 * Two more were the same shape. The subtitle is the first sentence anybody
 * reads about a feature, and it is the easiest place for a promise to survive a
 * page being made honest.
 *
 * So: if the page a nav item points at is a coming-soon page, the subtitle has
 * to say something of the same kind.
 *
 * "Is a coming-soon page" means the words are its HEADING, not merely somewhere
 * on it. The first version of this check tested the whole file and flagged the
 * family grocery list, which works perfectly well and simply carries an honest
 * note that in-app ordering is not live. Flagging a page for being candid about
 * a missing sub-feature is precisely the way to teach people to stop being
 * candid. So the rule is narrow, and it misses things a human would catch —
 * a page whose placeholder is worded differently, or one that is empty for
 * reasons it never states. It does not check the reverse either: a subtitle may
 * hedge about a page that works fine.
 */
const PENDING_SUB = /\b(soon|not yet|yet\b|until|once it|when it)\b/i;
const hubs = readFileSync(join(SRC, 'config/hubs.ts'), 'utf8');

/** path -> the component name the router mounts for it. */
const mounted = new Map();
for (const m of router.matchAll(/path:\s*'([^']+)',\s*element:[^\n]*?<(\w+)\s*\/>/g)) mounted.set(m[1], m[2]);
/** component name -> the source file it lazy-imports. */
const lazyFile = new Map();
for (const m of router.matchAll(/const (\w+) = lazy\(\(\) => import\('@\/([^']+)'/g)) lazyFile.set(m[1], m[2]);

for (const m of hubs.matchAll(/\{\s*path:\s*'([^']+)'[^}]*?\bsub:\s*(?:'([^']*)'|"([^"]*)")[^}]*\}/g)) {
  const [, path, subA, subB] = m;
  const sub = subA ?? subB;
  const file = lazyFile.get(mounted.get(path));
  if (!file) continue;                       // redirects, index pages, dynamic mounts
  const full = join(SRC, `${file}.tsx`);
  const page = source.get(full);
  if (!page || !/<h[12][^>]*>[^<]{0,24}coming soon[^<]{0,24}<\/h[12]>/i.test(page)) continue;
  if (PENDING_SUB.test(sub)) continue;
  problems.push(
    `config/hubs.ts  "${path}" is a coming-soon page but the menu sells it as `
    + `"${sub}" — say in the subtitle that it is not ready`,
  );
}

// ── 6. every declared route has a way in ─────────────────────────────────
//
// Check 3 asks whether every LINK resolves to a route. This asks the opposite,
// and it is the half that was missing: whether every route has a link.
//
// It found /medical/medicines — prescription review, dose confirmation, reminder
// scheduling and the allergy notice — listed in no menu and linked from nowhere,
// reachable only by typing the URL or by following a reminder notification that
// could not exist until somebody had already been there. Also /thoughts (the
// journal), /beauty/routine (the thing the skin & hair profile is FOR), and
// /nutrition/cart (checkout for the individual grocery flow).
//
// A route with nothing pointing at it is not dead code — it is worse. Dead code
// is at least visibly unused. This is a finished feature, maintained, tested and
// shipped, that no citizen can find.
//
// A REFERENCE IS MORE THAN A <Link>. deepLink: is in the list because
// ComposedMealCard builds `/nutrition/shared-meal?d=...` and sends it through
// chat — a route reachable only from a message somebody else received. Reading
// that shape as "unlinked" would have deleted every shared meal link already
// sent. Endpoint strings in api.ts are deliberately NOT read as references:
// `api.get('/beauty/routine')` is the server's path, not a way in.
const NAV_REF = /(?:to=|navigate\(|path:\s*|href:\s*|deepLink:\s*)["'`](\/[A-Za-z0-9/_-]*)/g;

/** Routes with no way in, on purpose. Each needs a reason, not just a line. */
const UNREACHABLE_ON_PURPOSE = new Map([
  // /profile/master came OFF this list on 2 Aug: the Medical hub's record page
  // now links to it (#medical) to add or change a blood group, so there IS a
  // client-side way in. It was here because the only reference was an href the
  // API handed over in profile-completion nextUp.
  ['/console', 'the admin console. Staff-only, and absent from every menu ON PURPOSE — a link in a citizen\'s navigation is an invitation to a door that will not open. The server checks the permission per request; the route existing is not access.'],
  ['/dev', 'the developer page. Absent from every menu for the same reason as the console, and with one more lock on top: the API refuses every /dev request that does not carry the password, checked on the server in constant time. The route existing is not access.'],
  ['/dating/admin', 'operator page, deliberately absent from every menu'],
  ['/realestate/admin', 'operator page, deliberately absent from every menu'],
  ['/dating/match', 'UNRESOLVED. The singular sibling of /dating/chat, which was removed for serving a hardcoded conversation. Nothing opens this one either. Decide: delete it, or link it from a match card.'],
  // ── TWO SURFACES TAKEN OFF A MENU AND LEFT WORKING ──────────────────────
  // Both are the same decision made twice: the page, its engine and its
  // endpoints are untouched and the path still resolves, because deleting a
  // working surface in order to hide it is how a feature comes back as a
  // rewrite. What is removed is the door.
  //
  // THE ENTRY HERE IS THE SECOND HALF OF THAT DECISION, and the makeup one is
  // late. /beauty/makeup came off the Beauty menu on 11 Aug and was never
  // declared here, so this audit failed on it for a day and every landing
  // script since has had to measure itself against a main that was already
  // red. An audit that is expected to fail is an audit nobody reads.
  ['/beauty/makeup', 'the Makeup Studio. Off the Beauty menu since 11 Aug at the owner\'s word — page, look engine and GET /beauty/makeup all untouched, and the route still resolves so no saved link breaks. Hidden, not deleted; it returns by putting one line back in config/hubs.ts.'],
  ['/fitness/plan', 'My Plan, the age- and condition-aware training week. Off the Fitness menu since 16 Aug at the owner\'s word — the page, the plan engine and GET /fitness/plan are untouched and the route still resolves, so a saved link opens exactly as it did. Third of the same shape as the Makeup Studio and Activity Dating above: hidden, not deleted, and it returns by putting one line back in config/hubs.ts.'],
]);

const referenced = new Set();
for (const [full, text] of source) {
  if (full.endsWith('app/router.tsx')) continue;
  for (const m of text.matchAll(NAV_REF)) referenced.add(m[1].replace(/\/$/, ''));
}

const redirectOnly = new Set();
for (const m of router.matchAll(/\{\s*path:\s*'([^']+)'\s*,\s*element:\s*<Navigate/g)) redirectOnly.add(m[1]);
// REMOVED_ROUTES are declared by a spread and are redirects by construction.
for (const m of labels.matchAll(/^\s*'(\/[^']+)':/gm)) redirectOnly.add(m[1]);

for (const route of declared) {
  if (!route.startsWith('/') || route === '/' || route.includes(':') || route.includes('*')) continue;
  if (redirectOnly.has(route) || referenced.has(route)) continue;
  if (UNREACHABLE_ON_PURPOSE.has(route)) continue;
  problems.push(
    `app/router.tsx  "${route}" is declared but nothing links to it — no menu entry, `
    + 'no <Link>, no navigate(), no deepLink. A citizen can only reach it by typing '
    + 'the URL. Add it to a hub menu, or delete the route, or add it to '
    + 'UNREACHABLE_ON_PURPOSE with the reason.',
  );
}

// A stale allowance is a hole waiting for the next regression.
for (const [route] of UNREACHABLE_ON_PURPOSE) {
  if (referenced.has(route)) {
    problems.push(
      `scripts/nav-audit.mjs  "${route}" is listed as deliberately unreachable but `
      + 'something links to it now — remove it from UNREACHABLE_ON_PURPOSE.',
    );
  }
}

// ── 7. a hub's inner pages belong to that hub ────────────────────────────
//
// Found by clicking through to a page this audit had just made reachable. The
// Medicines & Reminders page — prescriptions, doses, the allergies somebody has
// recorded — rendered with a left sidebar headed "Dating Hub", listing Curated
// Matches and Dating Chats. It sat in the dating route block, so it inherited
// that block's layout, and the router gave no hint: the line looked exactly like
// its neighbours.
//
// This is not only untidy. A medicine list is the page you hold up to a
// pharmacist. /thoughts is a private journal. Rendering either one framed by
// somebody's dating navigation is a small betrayal of context, and it happened
// because a route was added to whichever block had room.
const HUB_PREFIX = new Map();
const HUB_NAME = new Map();
for (const m of hubs.matchAll(/key: '(\w+)',\s*name: '([^']*)',\s*tag: '[^']*',\s*backPath: '([^']+)'/g)) {
  HUB_NAME.set(m[1], m[2]);
  HUB_PREFIX.set(m[1], m[3]);
}

/** Paths that live under another hub's layout deliberately, and why. */
const FOREIGN_ON_PURPOSE = new Map([
  ['/profile/astrology', 'astrology'], // item 05 of the Astrology menu
  // Top-level path, listed as item 05 of the Social Life menu. The journal
  // predates the hub and its URL is the one thing about it anybody could have
  // saved; the alternative was renaming it to /social/thoughts for tidiness.
  ['/thoughts', 'social'],
]);

// Split on any top-level route object, NOT only the multi-line ones. The first
// version matched /\n {2}\{\n/, which does not match a route written on one
// line — so /sign-in, /signin and /index.html, which follow the mail block, were
// read as children of it and reported as rendering with a mail sidebar. Same
// mistake as the line-scan draft: a check that guesses at structure will invent
// findings, and an audit that cries wolf gets switched off.
for (const block of router.split(/\n {2}\{/)) {
  const h = block.match(/HubLayout hub=\{HUBS\.(\w+)\}/);
  if (!h) continue;
  const prefix = HUB_PREFIX.get(h[1]);
  if (!prefix) continue;
  for (const m of block.matchAll(/path: '(\/[^']*)'/g)) {
    const p = m[1];
    if (p === prefix || p.startsWith(prefix + '/')) continue;
    if (FOREIGN_ON_PURPOSE.get(p) === h[1]) continue;
    problems.push(
      `app/router.tsx  "${p}" is a child of the ${h[1]} hub's route block, so it `
      + `renders with the "${HUB_NAME.get(h[1])}" sidebar. Move it to the block for `
      + 'its own hub, or add it to FOREIGN_ON_PURPOSE with the reason.',
    );
  }
}

if (problems.length) {
  console.error(`nav-audit: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`nav-audit: clean — ${files.length} files, ${declared.size} declared routes`);

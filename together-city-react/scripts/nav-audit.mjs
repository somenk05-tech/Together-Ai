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
    for (const [re, why] of VOICE) {
      if (re.test(line)) problems.push(`${rel}:${i + 1}  voice — ${why}`);
    }
  });
}

if (problems.length) {
  console.error(`nav-audit: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`nav-audit: clean — ${files.length} files, ${declared.size} declared routes`);

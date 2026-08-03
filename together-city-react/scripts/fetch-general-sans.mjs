/**
 * Fetch General Sans and put it where relief.css expects it.
 *
 * WHY THIS IS A SCRIPT AND NOT A DEPENDENCY. General Sans is published by
 * Fontshare, not on npm, so there is no package to add to package.json and no
 * lockfile entry to pin.
 *
 * THE FILES ARE COMMITTED ANYWAY, and the reason is worth recording because it
 * contradicts the argument this comment used to make. That argument was that
 * committing the binaries would put "a quarter of a megabyte" into every clone
 * and every diff — a number nobody had measured. The four cuts are 96KB in
 * total. At that size the trade goes the other way: committing them makes the
 * build hermetic, keeps CI off Fontshare's uptime, and means a fresh clone with
 * no network renders in the right typeface. They change roughly never, so
 * "every diff" was never true either.
 *
 * So this script exists to GET the files, not to avoid keeping them. It runs
 * once, or when a cut is added, and does nothing on every run after that.
 *
 * IT DISCOVERS THE FILE URLS RATHER THAN HARD-CODING THEM. Fontshare rewrites
 * its CDN paths when it re-cuts a family — the paths are content hashes — and a
 * hard-coded URL fails silently a year later by 404ing into a fallback that
 * nobody notices until somebody screenshots the app.
 *
 * ── THREE THINGS THIS GOT WRONG BEFORE, KEPT BECAUSE EACH IS AVAILABLE AGAIN ──
 *
 *   1. THE URLS ARE PROTOCOL-RELATIVE. Fontshare emits
 *      `url('//cdn.fontshare.com/wf/…woff2')` with no scheme. A regex anchored
 *      on `https?://` matches none of them, on a payload that is otherwise
 *      completely correct — HTTP 200, text/css, the right family.
 *   2. IT ASKED FOR ITALIC AS IF IT WERE A WEIGHT. `f[]=general-sans@italic`
 *      is not a query the API understands. One request for the family returns
 *      every cut, upright and italic, and the @font-face blocks say which.
 *   3. IT SAID "no woff2 in the CSS payload" AND STOPPED. That sentence is
 *      equally true of a 403 HTML error page, a rate-limit JSON body, and a
 *      correct stylesheet whose URLs it could not parse — three problems, one
 *      message, no way to tell them apart. It cost a round trip to find out
 *      which. It now prints the status, the content type and the payload.
 *
 * ── THE CUTS ARE STATIC, NOT VARIABLE ──
 *
 * The CSS API serves General Sans as one file per weight. It is worth knowing
 * because the design was drawn against a variable font at weights like 540 and
 * 640; with static cuts the browser snaps to the nearest available one, and
 * `font-weight: 540` silently renders as 600. relief.css therefore uses the
 * four weights that actually exist, and this script writes files named after
 * them. If Fontshare ever publishes a variable cut it will arrive as a face
 * whose font-weight is a RANGE, and that is what `variable` below detects.
 *
 * IT IS IDEMPOTENT AND OFFLINE-TOLERANT. Files already on disk are left alone.
 * No network means a warning and exit 0 — a developer on a train should get a
 * system-font site, not a broken one. The gate checks the files exist
 * separately, so a release cannot ship without them.
 *
 *   node scripts/fetch-general-sans.mjs
 *   node scripts/fetch-general-sans.mjs --verbose     # print the whole payload
 *   node scripts/fetch-general-sans.mjs --force       # re-fetch what is there
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'assets', 'fonts');
const VERBOSE = process.argv.includes('--verbose');
const FORCE = process.argv.includes('--force');

/** The weights relief.css declares. Nothing else is downloaded. */
const WEIGHTS = [400, 500, 600, 700];

/**
 * EMPTY, AND DELIBERATELY SO. General Sans publishes six upright cuts and no
 * italic — checked against the live API with the correct `400i` weight suffix,
 * after an earlier query of mine had asked the wrong question and produced the
 * same answer for the wrong reason. relief.css therefore declares no italic
 * face and the browser synthesises an oblique.
 *
 * Put weights back in this list and the script will fetch them; run with
 * --verbose to re-probe whether Fontshare has started publishing any.
 */
const ITALICS = [];

/**
 * ONE REQUEST FOR THE WHOLE FAMILY. Asking per-cut multiplies the ways this can
 * half-succeed; asking once means the payload either has the family in it or
 * the request failed, and there is no third state to reason about.
 */
/**
 * TWO REQUESTS, AND THE SECOND ONE IS ALLOWED TO FAIL.
 *
 * The first version asked for `@200,300,400,500,600,700` and then reported
 * "no italic cuts published" — which was not true. Fontshare marks an italic
 * with an `i` suffix on the weight, so a query that lists only bare numbers
 * gets only uprights back, correctly, and says nothing about what else exists.
 *
 * The upright query is known to work and is left exactly as it was. The italic
 * query is separate so that if the suffix syntax is wrong, or the family has no
 * italics, it fails on its own and the uprights still land.
 */
const API = 'https://api.fontshare.com/v2/css?f%5B%5D=general-sans@200,300,400,500,600,700&display=swap';
const API_ITALIC = 'https://api.fontshare.com/v2/css?f%5B%5D=general-sans@400i,500i,600i,700i&display=swap';

const exists = (p) => access(p).then(() => true, () => false);
const nameFor = (w, italic) => `general-sans-${w}${italic ? '-italic' : ''}.woff2`;

/**
 * Split a CSS payload into @font-face blocks and read each one's weight, style
 * and woff2 URL. Quoting is optional; the scheme is optional; `.woff` (without
 * the 2) must not match, which is why the extension is anchored.
 */
function facesIn(css) {
  const out = [];
  for (const m of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const body = m[1];
    const url = body.match(/url\(\s*['"]?((?:https?:)?\/\/[^'")\s]+?\.woff2)['"]?\s*\)/);
    if (!url) continue;
    const weight = (body.match(/font-weight\s*:\s*([^;]+)/i) || [, '400'])[1].trim();
    out.push({
      // Protocol-relative is the normal form here, not an edge case.
      url: url[1].startsWith('//') ? `https:${url[1]}` : url[1],
      italic: /font-style\s*:\s*italic/i.test(body),
      weight,
      variable: /\s/.test(weight),
    });
  }
  return out;
}

async function main() {
  const wanted = [
    ...WEIGHTS.map((w) => ({ w, italic: false })),
    ...ITALICS.map((w) => ({ w, italic: true })),
  ].map((f) => ({ ...f, name: nameFor(f.w, f.italic) }));

  const missing = [];
  for (const f of wanted) {
    if (!FORCE && (await exists(join(OUT, f.name)))) continue;
    missing.push(f);
  }
  if (!missing.length) {
    console.log(`General Sans: all ${wanted.length} cuts already present.`);
    return;
  }

  let res;
  try {
    res = await fetch(API, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        accept: 'text/css,*/*;q=0.1',
        referer: 'https://www.fontshare.com/',
      },
    });
  } catch (err) {
    console.warn(`  no network (${err.message}). The app falls back to the system sans.`);
    return;
  }

  const body = await res.text();
  const faces = facesIn(body);

  // Italics, best effort. A family without them is a real answer, not a fault.
  if (missing.some((f) => f.italic) || VERBOSE) {
    try {
      const ri = await fetch(API_ITALIC, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/css,*/*;q=0.1', referer: 'https://www.fontshare.com/' },
      });
      const bi = await ri.text();
      const italics = facesIn(bi).filter((f) => f.italic);
      if (italics.length) faces.push(...italics);
      else if (VERBOSE) console.warn(`  italic query returned no italic faces (HTTP ${ri.status}, ${bi.length} bytes)`);
    } catch { /* uprights are what matter; carry on */ }
  }

  if (!faces.length) {
    console.warn('  the CSS API returned nothing this script could use.');
    console.warn(`    HTTP ${res.status} ${res.statusText}`);
    console.warn(`    content-type: ${res.headers.get('content-type') ?? 'none'}`);
    console.warn(`    ${body.length} bytes`);
    console.warn(`    ---\n    ${body.slice(0, VERBOSE ? 8000 : 500).replace(/\n/g, '\n    ')}\n    ---`);
    console.warn('\n  If that is an error page, fetch the family by hand instead:');
    console.warn('    1. https://www.fontshare.com/fonts/general-sans → Download family');
    console.warn('    2. convert the woff2 cuts into public/assets/fonts/, named');
    console.warn(`       ${WEIGHTS.map((w) => nameFor(w, false)).join(', ')}`);
    console.warn('    3. re-run the gate — nothing else in the build needs changing.');
    return;
  }

  const variable = faces.find((f) => f.variable);
  if (variable) {
    console.log(`  note: a VARIABLE cut is now published (font-weight: ${variable.weight}).`);
    console.log('  relief.css declares four static faces; one variable face would be smaller');
    console.log('  and would restore the interpolated weights the design was drawn at.');
  }

  await mkdir(OUT, { recursive: true });
  let got = 0;
  for (const f of missing) {
    // Nearest published cut of the right style. Fontshare may not ship every
    // weight, and a face that 404s is worse than one that is 100 too heavy.
    const pool = faces.filter((x) => x.italic === f.italic && !x.variable);
    if (!pool.length) {
      console.log(`  no ${f.italic ? 'italic' : 'upright'} cuts published — skipping ${f.name}`);
      if (f.italic) {
        console.log('    → General Sans ships no italic. Delete the two italic @font-face');
        console.log('      rules from src/styles/relief.css; the browser will synthesise an');
        console.log('      oblique, which is better than a 404 on every page that uses one.');
      }
      continue;
    }
    const pick = pool.reduce((a, b) =>
      Math.abs(+b.weight - f.w) < Math.abs(+a.weight - f.w) ? b : a);
    const buf = Buffer.from(await fetch(pick.url).then((r) => r.arrayBuffer()));
    if (buf.length < 5_000) {
      console.warn(`  ${f.name} came back ${buf.length} bytes — that is an error page, not a typeface`);
      continue;
    }
    await writeFile(join(OUT, f.name), buf);
    const note = +pick.weight === f.w ? '' : ` (nearest published: ${pick.weight})`;
    console.log(`  ${f.name} — ${Math.round(buf.length / 1024)}KB${note}`);
    got++;
  }
  console.log(`General Sans: ${got} of ${missing.length} cuts fetched.`);
}

await main();

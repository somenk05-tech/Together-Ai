import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');

/**
 * ── A LAZY ROUTE NAMES A REAL EXPORT ────────────────────────────────────────
 *
 * `lazy(() => import('…').then((m) => ({ default: m.Thing })))` is a property
 * access on a module object, and a property that is not there is `undefined`,
 * not an error. TypeScript cannot see it: the import is dynamic and `m` is
 * whatever the module exports. The build cannot see it: the chunk is emitted
 * either way. Nothing in this suite could see it, because a route component is
 * never rendered here.
 *
 * What DOES see it is a citizen tapping that tab, and what they get is a blank
 * page — React renders `undefined` and the ChunkBoundary catches an error with
 * no useful message. One typo, one route gone, and green everywhere.
 *
 * That risk was theoretical until 31 Aug, when twenty-two eagerly-imported
 * pages became lazy in one change to get the shared chunk from 919 kB to
 * 326 kB. Twenty-two hand-written `m.Name`s, each a chance to be wrong, none
 * of them checked by anything. This is the check.
 *
 * It reads every `lazy()` in the app, not only the router's, because each
 * feature's own routes file carries some — and one of those, `PetsBoot`, is
 * the import whose eagerness was the bug.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Resolve an import specifier the way vite's `@` alias does. */
function moduleFile(spec: string, from: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    if (existsSync(base + ext)) return base + ext;
  }
  return existsSync(base) ? base : null;
}

const LAZY = /lazy\(\(\)\s*=>\s*import\('([^']+)'\)\.then\(\(m\)\s*=>\s*\(\{\s*default:\s*m\.(\w+)\s*\}\)\)\)/g;

type Site = { file: string; spec: string; name: string };
const sites: Site[] = [];
for (const file of walk(SRC)) {
  if (file.includes('.spec.') || file.includes('.test.')) continue;
  for (const m of readFileSync(file, 'utf8').matchAll(LAZY)) {
    sites.push({ file, spec: m[1], name: m[2] });
  }
}

describe('every lazily-loaded route resolves to a component that exists', () => {
  it('finds the lazy routes at all', () => {
    // A walker that matches nothing passes forever. The app has well over a
    // hundred rooms; this floor is far below that and only exists so an
    // emptied search fails loudly.
    expect(sites.length).toBeGreaterThan(100);
  });

  it('points every import at a module that is really there', () => {
    const missing = sites
      .filter((s) => !moduleFile(s.spec, s.file))
      .map((s) => `${s.spec}  (from ${s.file.slice(ROOT.length + 1)})`);
    expect(missing).toEqual([]);
  });

  it('names an export that module actually has', () => {
    // The failure this file exists for: `m.Thing` where the module exports
    // `Thing2`. undefined, not an error — a blank page, and green tests.
    const wrong: string[] = [];
    for (const s of sites) {
      const file = moduleFile(s.spec, s.file);
      if (!file) continue; // reported by the test above
      const body = readFileSync(file, 'utf8');
      const declared = new RegExp(`export\\s+(?:const|function|class|async function)\\s+${s.name}\\b`).test(body);
      const rebound = new RegExp(`export\\s*\\{[^}]*\\b${s.name}\\b`).test(body);
      if (!declared && !rebound) wrong.push(`${s.name} is not exported by ${s.spec}`);
    }
    expect(wrong).toEqual([]);
  });
});

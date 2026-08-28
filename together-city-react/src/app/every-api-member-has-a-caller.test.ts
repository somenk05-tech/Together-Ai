import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/**
 * ── ONE LINK FURTHER OUT THAN THE OTHER GUARD LOOKS ─────────────────────────
 *
 * The API repo has an orphan-route guard. It asks whether a ROUTE has a caller,
 * and on 28 August two defects walked straight past it, because both had one:
 *
 *   - `datingApi.matches` called `GET /dating/matches`. Nothing called
 *     `datingApi.matches`. The curated shelf's two quality rules lived in the
 *     service method behind it, so for a month they governed nothing while the
 *     comment above them said otherwise.
 *   - `datingApi.unlockChat` called `POST .../unlock-chat`, a duplicate of
 *     `connect` that had lost its `@Throttle` — the same action at twice the
 *     rate limit, on a path nobody believed was reachable.
 *
 * The chain is: screen → hook → api member → route → service. That guard checks
 * the last link. Both defects were at the FIRST, and a dead first link makes
 * every link behind it dead while each one still looks called from the inside.
 *
 * So this asks the question from the other end. A member declared on an api
 * object and referenced by nothing — not a screen, not a hook, not even a line
 * in its own file — is the far end of a chain that has died, and it is where
 * both of those defects were hiding.
 *
 * Sweeping it once removed 31 members across nine hubs, and tsc then named two
 * types that the removal had orphaned in turn. This keeps the surface at zero
 * so the next one is caught while somebody still remembers what it was for.
 */
describe('every api member has a caller', () => {
  const files = walk(SRC);
  const corpus = files.map((f) => readFileSync(f, 'utf8'));
  const apiFiles = files.filter((f) => f.endsWith(`api.ts`) && f.includes(`features`));

  it('reads the api files at all, so a rename cannot make this vacuous', () => {
    // A walk that finds nothing, or a regex that matches nothing, turns every
    // assertion below green while checking exactly nothing.
    expect(apiFiles.length).toBeGreaterThan(20);
    expect(corpus.length).toBeGreaterThan(500);
  });

  it('declares no api-object member that nothing anywhere references', () => {
    const orphans: string[] = [];
    let checked = 0;

    for (const f of apiFiles) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/^export const (\w*[Aa]pi\w*) = \{$/gm)) {
        const obj = m[1];
        const start = (m.index ?? 0) + m[0].length;
        const end = src.indexOf('\n};', start);
        const body = src.slice(start, end === -1 ? undefined : end);
        for (const mem of [...body.matchAll(/^ {2}(\w+)\s*[:(]/gm)].map((x) => x[1])) {
          checked += 1;
          const use = new RegExp(`\\b${obj}\\.${mem}\\b`);
          if (!corpus.some((s) => use.test(s))) orphans.push(`${obj}.${mem}`);
        }
      }
    }

    expect(checked).toBeGreaterThan(300);
    // Named rather than counted. A failure saying "expected 0, got 1" gets the
    // assertion deleted; one saying `nutritionApi.saveBlood` gets the member
    // deleted, or wired up, which is the point.
    expect(orphans).toEqual([]);
  });
});

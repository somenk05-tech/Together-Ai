import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The homepage is public. The "Continue where you left off" trail is not — it
 * is one citizen's private movements ("Connect with Blood Test", Medicines),
 * and the consumer review found it rendered to whoever walks past a shared
 * machine after sign-out or session expiry.
 *
 * Rule: any component that READS the recent-pages trail must consult the auth
 * store in the same file — the trail renders only to the citizen who made it.
 * (The store itself and the tracker that WRITES the trail are exempt.)
 */
const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const EXEMPT = [/store\/recent\.store\.ts$/, /hooks\/useTrackRecent\.ts$/];

describe('recent-pages trail privacy', () => {
  it('every reader of the trail gates on the auth store', () => {
    const offenders: string[] = [];
    for (const f of walk(ROOT)) {
      if (EXEMPT.some((r) => r.test(f))) continue;
      const src = readFileSync(f, 'utf8');
      if (!src.includes('useRecentStore')) continue;
      if (!src.includes('useAuthStore')) offenders.push(f.slice(ROOT.length + 1));
    }
    expect(offenders, 'these files render the private trail without checking who is looking').toEqual([]);
  });
});

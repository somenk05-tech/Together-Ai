import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { swallow, optional } from './swallow';

describe('swallow()', () => {
  it('returns the value when the promise resolves', async () => {
    expect(await swallow(Promise.resolve(7), 'spec')).toBe(7);
  });
  it('returns undefined instead of throwing when it rejects', async () => {
    expect(await swallow(Promise.reject(new Error('boom')), 'spec')).toBeUndefined();
  });
  it('tolerates undefined, for optional-chained calls', async () => {
    expect(await swallow(undefined, 'spec')).toBeUndefined();
  });
});

describe('swallowed()', () => {
  it('logs and returns the typed fallback', async () => {
    const { swallowed } = await import('./swallow');
    expect(await Promise.reject(new Error('boom')).catch(swallowed('spec', null))).toBeNull();
    expect(await Promise.reject(new Error('boom')).catch(swallowed('spec', [] as number[]))).toEqual([]);
    expect(await Promise.resolve(3).catch(swallowed('spec', 0))).toBe(3);
  });
});

describe('optional()', () => {
  it('passes values through and turns rejection into undefined, silently', async () => {
    expect(await optional(Promise.resolve('v'))).toBe('v');
    expect(await optional(Promise.reject(new Error('boom')))).toBeUndefined();
    expect(await optional(undefined)).toBeUndefined();
  });
});

/**
 * The ceiling. A bare `.catch(() => undefined|null|[]|{})` throws information
 * away and says nothing. Every one converted to swallow()/optional() lowers
 * the count; this fails if the count RISES (someone wrote a new silent
 * failure) and if it FALLS without the ceiling being lowered (a ratchet
 * nobody tightens is just a high number). Same rule as the lint ceiling.
 *
 * Comments are stripped before counting — guards that read prose have been
 * fooled four times in this repo.
 */
const CEILING_FILE = join(__dirname, 'swallow-ceiling.json');
const SELF = 'swallow.spec.ts';
const BARE = /\.catch\(\(\s*\)\s*=>\s*(undefined|null|\[\]|\(\{\}\)|\{\})(\s+as\s+[^)]+)?\)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the bare-catch ceiling', () => {
  it('no new silent failures; conversions lower the ceiling in the same commit', () => {
    const perFile = new Map<string, number>();
    for (const f of walk(join(__dirname, '..'))) {
      if (f.endsWith(SELF)) continue;
      const n = (stripComments(readFileSync(f, 'utf8')).match(BARE) ?? []).length;
      if (n) perFile.set(f.split('/src/').pop() ?? f, n);
    }
    const count = [...perFile.values()].reduce((a, b) => a + b, 0);
    const ceiling = JSON.parse(readFileSync(CEILING_FILE, 'utf8')).count as number;

    if (count > ceiling) {
      const worst = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([f, n]) => `    ${String(n).padStart(3)}  ${f}`).join('\n');
      throw new Error(
        `\nBare catches went UP: ${count}, ceiling is ${ceiling}.\n` +
        `A new .catch(() => undefined) throws a failure away and says nothing.\n` +
        `Say what you meant: swallow(p, 'context', meta) if you would want to\n` +
        `know, optional(p) if silence is genuinely correct (say why nearby).\n\n` +
        `Most bare catches right now:\n${worst}\n`,
      );
    }
    if (count < ceiling) {
      throw new Error(
        `\nBare catches went DOWN: ${count}, ceiling is still ${ceiling}. Thank you —\n` +
        `now lower it: set "count" to ${count} in src/shared/swallow-ceiling.json\n` +
        `and commit it with this change.\n`,
      );
    }
    expect(count).toBe(ceiling);
  });
});

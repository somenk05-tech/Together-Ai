import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * The unbounded-read ceiling. (P1-1.)
 *
 * A findMany with no `take:` gets slower every day a citizen uses the app,
 * and there is no natural point at which that self-corrects. But a blanket
 * rule would be wrong in the other direction: where a query feeds a
 * COMPUTATION — a trend chart, a month total, an allergen union — truncating
 * silently produces wrong numbers, which is worse than a slow query
 * (shared/paging.ts's header, which this spec enforces).
 *
 * So every findMany must either carry `take:` or sit beside a
 * `// unbounded: <reason>` comment (inline in the call, or on one of the two
 * lines above it). The comment requirement is the point — it forces the
 * list-or-computation call to be made explicitly, once, where the query is.
 *
 * Ceiling-style because 126 existed when this was written: the count may only
 * go DOWN, and lowering it belongs in the commit that earned it. Comments are
 * stripped before the take: check — a guard that reads its own prose has been
 * fooled four times in this repo — but NOT before the annotation check, which
 * is prose on purpose.
 */
const CEILING_FILE = join(__dirname, 'unbounded-reads-ceiling.json');
const SELF = 'unbounded-reads.spec.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The balanced argument text of a call starting at `open` (index of '('). */
function callText(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

describe('the unbounded-read ceiling', () => {
  it('every findMany carries take: or an // unbounded: reason; the count only falls', () => {
    const perFile = new Map<string, number>();
    for (const f of walk(join(__dirname, '..'))) {
      if (f.endsWith(SELF)) continue;
      const src = readFileSync(f, 'utf8');
      let n = 0;
      for (let i = src.indexOf('.findMany('); i >= 0; i = src.indexOf('.findMany(', i + 1)) {
        const call = callText(src, i + '.findMany'.length);
        if (/\btake:\s*/.test(stripComments(call))) continue;
        // The annotation: inline in the call, or on one of the two lines above.
        const lineStart = src.lastIndexOf('\n', i);
        const twoAbove = src.lastIndexOf('\n', src.lastIndexOf('\n', lineStart - 1) - 1);
        const context = src.slice(Math.max(0, twoAbove), i) + call;
        if (context.includes('unbounded:')) continue;
        n++;
      }
      if (n) perFile.set(f.split('/src/').pop() ?? f, n);
    }
    const count = [...perFile.values()].reduce((a, b) => a + b, 0);
    const ceiling = JSON.parse(readFileSync(CEILING_FILE, 'utf8')).count as number;

    if (count > ceiling) {
      const worst = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([f, m]) => `    ${String(m).padStart(3)}  ${f}`).join('\n');
      throw new Error(
        `\nUnbounded findMany reads went UP: ${count}, ceiling is ${ceiling}.\n` +
        `A list gets take: (pageLimit + a cap from shared/paging.ts). A\n` +
        `computation gets a '// unbounded: <reason>' comment beside the call —\n` +
        `truncating a computation silently produces wrong numbers, so say\n` +
        `which one this is.\n\nMost unbounded right now:\n${worst}\n`,
      );
    }
    if (count < ceiling) {
      throw new Error(
        `\nUnbounded reads went DOWN: ${count}, ceiling is still ${ceiling}. Thank you —\n` +
        `set "count" to ${count} in src/shared/unbounded-reads-ceiling.json and\n` +
        `commit it with this change.\n`,
      );
    }
    expect(count).toBe(ceiling);
  });
});

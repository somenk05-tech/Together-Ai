import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A TAP THAT DID NOTHING SAYS SO ──────────────────────────────────────────
 *
 * The 30 Aug audit's finding was "thirteen mutations, zero rollbacks", and
 * when I went to fix it I found the finding was measured in the wrong place —
 * it counted `onError` in `features/social/api.ts`, where the HOOKS live.
 * Most of these mutations are not optimistic, so there is nothing to roll
 * back; and the components had been handling failure at the CALL SITE all
 * along, which the grep could not see. Six genuine gaps, not thirteen.
 *
 * That is exactly why this is a walker over call sites rather than a number in
 * a file. The question a citizen cares about is not "does the hook have an
 * onError" but "when I pressed this and it failed, did anything tell me" — and
 * that question can only be asked where the press is.
 *
 * THE RULE. Every `.mutate(...)` in the Social Life hub must do one of:
 *
 *   · pass `onError`;
 *   · be a `mutateAsync` inside a `try`/`catch`;
 *   · carry a `// deliberately silent:` comment saying why silence is right.
 *
 * The third is not an escape hatch, it is the point. There ARE writes where a
 * banner is worse than nothing — a mark-as-read fired as the citizen navigates
 * away, whose only consequence is a row that stays bold. Forcing that to be
 * WRITTEN DOWN, next to the call, is what stops "we decided silence was fine"
 * being indistinguishable from "nobody thought about it". Those two look
 * identical in a diff and are opposite in a review.
 *
 * Scoped to Social Life because that is the hub this audit covered. The rest
 * of the city has the same question outstanding and a different answer.
 */

const ROOT = join(__dirname, '..', 'features', 'social');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** The balanced argument text of a call, from the index of its '('. */
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

describe('every write in Social Life can say that it failed', () => {
  it('leaves no mutation whose failure is invisible and unexplained', () => {
    const silent: string[] = [];

    for (const file of walk(ROOT)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\b(\w+)\.(mutateAsync|mutate)\(/g)) {
        /* ONE BINDING, BECAUSE `m.index ?? 0 - 300` IS NOT WHAT IT LOOKS LIKE.
           `??` binds looser than `-`, so that expression is
           `m.index ?? (0 - 300)` — the offsets went wrong everywhere at once
           and this guard started reporting four false positives against a tree
           it had just passed on. It caught itself, which is the argument for
           writing guards that fail loudly rather than return a number. */
        const at = m.index ?? 0;
        const open = at + m[0].length - 1;
        const call = callText(src, open);
        if (call.includes('onError')) continue;

        // `await x.mutateAsync(...)` inside a try/catch: the catch IS the
        // handler, and it is the shape three of these legitimately use.
        const before = src.slice(Math.max(0, at - 300), at);
        if (m[2] === 'mutateAsync' && /\btry\s*\{/.test(before) && !/\}\s*catch/.test(before.slice(before.lastIndexOf('try {')))) continue;

        // The written-down exemption.
        if (before.includes('deliberately silent:')) continue;

        const line = src.slice(0, at).split('\n').length;
        silent.push(`${file.split('/features/social/')[1]}:${line} — ${m[1]}.${m[2]}()`);
      }
    }

    if (silent.length) {
      throw new Error(
        '\nThese writes fail without telling the citizen anything:\n\n'
        + silent.map((s) => `    ${s}`).join('\n')
        + '\n\nPass onError and say what STATE they are in — "you are not following\n'
        + 'them yet", not "something went wrong". If silence is genuinely right,\n'
        + 'write `// deliberately silent: <why>` above the call so the next\n'
        + 'reader can tell a decision from an oversight.\n',
      );
    }
    expect(silent).toEqual([]);
  });

  /**
   * The messages themselves. A failure that says "something went wrong" has
   * told the citizen nothing they did not already know — what they need is
   * which side of the line they are now on, especially for the safety actions
   * where the whole question is whether somebody can still reach them.
   */
  it('says the state rather than the incident, wherever it speaks', () => {
    const bodies = walk(ROOT).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(bodies).toMatch(/they are still blocked/i);
    expect(bodies).toMatch(/you’re not following them yet/i);
    expect(bodies).toMatch(/your arrangement is still here/i);
    // And the generic phrasing this rule exists to keep out.
    expect(bodies).not.toMatch(/Something went wrong\. Try again/i);
  });
});

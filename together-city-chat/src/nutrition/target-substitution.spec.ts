import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Nobody may fill in a body before computeTargets can see it is missing.
 *
 * This guard exists because of a specific commit. 9e0082d shipped BE-7.4's
 * refusal — the meal plan and the preferences card both stop rather than show a
 * target computed from a reference body — and it shipped without the server
 * change that decides whether the refusal can ever happen. `composeFor`, the
 * main plan path, was still passing `?? 70, ?? 172, ?? 30, ?? 'male'` into
 * computeTargets, so computeTargets saw a complete body every time, returned
 * readiness: { ok: true } and an empty assumed[], and the gate could never once
 * fire.
 *
 * Every test passed. They test target-readiness.ts, which was always correct.
 * The decision was in one place and right, and a `??` upstream of it made that
 * irrelevant — a guard that reads correct, passes its suite, and is connected to
 * nothing. That is the defect class this whole programme keeps finding, and we
 * shipped it ourselves.
 *
 * So this is a structural test in the same spirit as security/query-scoping and
 * nutrition/diet-integrity: it reads the source rather than the runtime, needs
 * no database, and cannot be satisfied by luck. It is not about style. A `??`
 * on one of these four arguments is the difference between an app that says "we
 * need your weight" and one that quietly serves a 52 kg woman a man's
 * maintenance energy.
 *
 * `?? undefined` is allowed and is the point: it is how a caller says "I looked,
 * and it genuinely isn't there" without erasing that fact.
 */

/** The four with no honest default. Activity and goal have real ones. */
const NO_DEFAULT = ['weightKg', 'heightCm', 'age', 'sex'];

const SRC = join(__dirname, '..');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (/\.ts$/.test(p) && !/\.spec\.ts$/.test(p)) out.push(p);
  }
  return out;
}

/** Every computeTargets(...) argument list in the tree, with where it came from. */
function callSites(): Array<{ file: string; line: number; args: string }> {
  const found: Array<{ file: string; line: number; args: string }> = [];
  for (const file of tsFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(SRC, file);
    let i = src.indexOf('computeTargets(');
    while (i !== -1) {
      // Skip the declaration itself.
      const before = src.slice(Math.max(0, i - 30), i);
      if (!/function\s+$/.test(before)) {
        // Walk from the opening paren to its match, so a nested object or a
        // call inside an argument cannot end the scan early.
        let depth = 0;
        let j = i + 'computeTargets'.length;
        for (; j < src.length; j++) {
          const c = src[j];
          if (c === '(' || c === '{' || c === '[') depth++;
          else if (c === ')' || c === '}' || c === ']') {
            depth--;
            if (depth === 0) break;
          }
        }
        found.push({
          file: rel,
          line: src.slice(0, i).split('\n').length,
          args: src.slice(i, j + 1),
        });
      }
      i = src.indexOf('computeTargets(', i + 1);
    }
    void rel;
  }
  return found;
}

describe('no body is filled in before computeTargets can see it is missing', () => {
  const sites = callSites();

  it('is reading real call sites — guards the guard', () => {
    // If computeTargets is renamed or moved and this scan starts finding
    // nothing, it fails loudly rather than passing on an empty list.
    expect(sites.length).toBeGreaterThanOrEqual(4);
    expect(sites.every((s) => s.args.startsWith('computeTargets(') && s.args.endsWith(')'))).toBe(true);
    expect(sites.filter((s) => s.args.includes('weightKg')).length).toBeGreaterThanOrEqual(4);
  });

  it('never substitutes weight, height, age or sex at the call site', () => {
    const offenders: string[] = [];
    for (const s of sites) {
      for (const field of NO_DEFAULT) {
        // `field: <anything up to the next comma or brace> ?? <default>`
        //
        // The "not undefined" test is done AFTER the match, not as a lookahead
        // inside it. `\s*(?!undefined)` looks right and is not: the `\s*` simply
        // backtracks to zero-width, the lookahead then sees a space rather than
        // the word, and every `?? undefined` in the file reports as an offender.
        const re = new RegExp(`\\b${field}\\s*:[^,}]*\\?\\?\\s*([^,}]+)`);
        const m = re.exec(s.args);
        const fallback = m?.[1]?.trim();
        if (fallback && fallback !== 'undefined') {
          offenders.push(`${s.file}:${s.line}  ${field} ?? ${fallback}`);
        }
      }
    }
    // A failure here means somebody restored the erasure. The fix is to pass the
    // nullable through — computeTargets already reports what it substituted, and
    // readiness already decides whether substituting was acceptable.
    expect(offenders).toEqual([]);
  });

  it('allows `?? undefined`, which is how a caller says it looked and found nothing', () => {
    const withUndefined = sites.filter((s) => /weightKg\s*:[^,}]*\?\?\s*undefined/.test(s.args));
    expect(withUndefined.length).toBeGreaterThan(0);
  });

  it('keeps REFERENCE_BODY inside the one function allowed to know about it', () => {
    // The fallback lives in computeTargets and comes out entirely once every
    // surface has adopted readiness. Until then, nothing else may reach for it —
    // a second copy of "assume 70 kg" is a second place the refusal is bypassed.
    const users: string[] = [];
    for (const file of tsFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(SRC, file);
      src.split('\n').forEach((l, n) => {
        // REFERENCE_BODY_KG in micronutrients.ts is a DIFFERENT constant: the
        // ICMR-NIN reference weights the RDA table is stated for. The boundary
        // keeps them apart rather than the guard eating an unrelated name.
        if (!/\bREFERENCE_BODY\b/.test(l)) return;
        if (l.trim().startsWith('*') || l.trim().startsWith('//')) return; // prose
        if (rel === 'nutrition/nutrition.service.ts') return;              // where it lives
        if (/^nutrition\/(reference-body|constants)\.ts$/.test(rel)) return;
        users.push(`${rel}:${n + 1}`);
      });
    }
    expect(users).toEqual([]);
  });
});

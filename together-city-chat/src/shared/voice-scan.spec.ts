import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { violations } from './voice';

/**
 * The written prose obeys the voice too, not just the AI's.
 *
 * shared/voice.ts checks what a model returns. This checks what engineers type.
 * The two failure modes are different and both reach the citizen: a model
 * reassures because it was asked to be warm, a person writes "don't worry, this
 * is perfectly normal" because it feels kind. The second is the one that gets
 * committed and never reviewed again.
 *
 * The first run found two things, and only one was a bug.
 *
 *   - ai-suggestions.service.ts opened a prompt "The user is a {sign}", which
 *     is the app describing the reader to a model instead of talking to them.
 *     Fixed.
 *   - jobs-engine.ts contained "Be the voice of the customer" — a blurb on a
 *     Customer Success posting, where the customer is the employer's and not
 *     the reader. That was the rule being too blunt, so "the client" and "the
 *     customer" came out of it. A guard that fires on correct writing is a
 *     guard somebody switches off.
 *
 * Everything else was already honest. This exists so it stays that way.
 */

const SRC = join(__dirname, '..');

/**
 * Files that legitimately contain the banned phrases: the rule modules
 * themselves, which have to name what they forbid.
 */
const ALLOW = ['shared/voice.ts', 'astrology/voice.ts'];

function sourceFiles(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
    }
  })(SRC);
  return out;
}

/**
 * String literals only.
 *
 * Comments are excluded deliberately: "the user can edit this later" is an
 * engineer talking to an engineer and is exactly right there. The voice governs
 * what a citizen reads, and a citizen reads strings.
 */
function stringLiterals(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  const out: string[] = [];
  const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (const m of withoutComments.matchAll(LITERAL)) {
    const v = m[1] ?? m[2] ?? m[3];
    // A sentence, not an identifier, a path or a CSS value. Prose has spaces
    // and enough of them to be a sentence.
    if (v && v.trim().split(/\s+/).length >= 4) out.push(v);
  }
  return out;
}

describe('the prose engineers write obeys the voice', () => {
  it('extracts sentences and not identifiers (guards the scanner itself)', () => {
    const sample = `
      const a = 'nutrition/weekly';
      const b = "Your ferritin is low, which is worth raising.";
      // don't worry about this comment
      const c = \`display: flex; gap: 8px;\`;
    `;
    const found = stringLiterals(sample);
    expect(found).toContain('Your ferritin is low, which is worth raising.');
    expect(found).not.toContain('nutrition/weekly');
    expect(found.join(' ')).not.toContain("don't worry about this comment");
  });

  it('scans a plausible surface (guards the walker itself)', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('mail/receipts.ts'))).toBe(true);
  });

  it('has no user-facing string that breaks the voice', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const rel = relative(SRC, file);
      if (ALLOW.includes(rel)) continue;
      for (const text of stringLiterals(readFileSync(file, 'utf8'))) {
        for (const v of violations(text)) {
          offenders.push(`${rel}: ${v.why} — "${v.phrase}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

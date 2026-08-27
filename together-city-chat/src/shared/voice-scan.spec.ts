import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { violations } from './voice';
import { violations as miraViolations } from '../mira/voice';

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
 *
 * THIS IS A NARROW EXEMPTION AND MUST STAY ONE. It is not "files where the
 * guard is inconvenient" — it is files whose entire content is the statement of
 * what may not be said, in a regex table and in the prompt that hands the same
 * list to a writer. A module qualifies only if every banned phrase in it
 * appears as a thing being prohibited. `astrology/letter.ts` is the third: it
 * cannot tell a writer not to say "as an AI" without containing the words.
 * `astrology/consultation.ts` is the fourth, for exactly the same reason — it
 * hands a consultation writer the list of phrases the last one wore out, and
 * naming a phrase to forbid it is the opposite of using it.
 */
const ALLOW = ['shared/voice.ts', 'astrology/voice.ts', 'astrology/letter.ts', 'astrology/consultation.ts',
  // The fifth, and the same reason: `mira/voice.ts` is the table of what Mira
  // may not say, and it cannot forbid "great question" without containing it.
  'mira/voice.ts',
  // And the sixth: `mira/persona.ts` holds BANNED_FROM_HER_MOUTH, the list of
  // phrases handed to the model itself. It used to be written out three times,
  // twice there and once in mira.service.ts with half its clauses missing —
  // this scan is what found that, and one copy is what makes one exemption
  // enough.
  'mira/persona.ts'];

/**
 * MIRA IS JUDGED BY MIRA'S RULES.
 *
 * This scanned every file by the CITY's rules, and the city's rules ban the
 * assistant as a subject — "I can't", "let me", "as an AI" — because a blood
 * report has no speaker and an app that narrates itself there is intruding on a
 * document. Mira is the one surface where there IS a speaker, which is the
 * whole reason `mira/voice.ts` exists: it keeps every honesty rule verbatim and
 * relaxes exactly the speaker family.
 *
 * The scan predates that module, so it was holding her lines to a rule her own
 * runtime filter does not apply, and the two guards had become mutually
 * exclusive: `she-can-actually-talk.spec.ts` requires her prompt to ban the
 * generic-AI register BY NAME, which this then read as her using it. No prose
 * can satisfy both, and the one that was failing was the one nobody could fix.
 *
 * So her files are checked against her rules — which are stricter, not laxer,
 * everywhere except the speaker: service-desk enthusiasm, flattery, narrated
 * machinery and apology loops are all fatal for her and invisible to the city.
 */
const miraRules = (rel: string) => rel.startsWith('mira/');

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
      const check = miraRules(rel) ? miraViolations : violations;
      for (const text of stringLiterals(readFileSync(file, 'utf8'))) {
        for (const v of check(text)) {
          offenders.push(`${rel}: ${v.why} — "${v.phrase}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

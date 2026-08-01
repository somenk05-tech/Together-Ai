import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE RULE, NOT THE SEVEN SURFACES. (F.27.)
 *
 * allergen-reach.spec.ts pins the behaviour of the seven restaurant reads that
 * existed on 1 Aug. It cannot say anything about the eighth. The hole it found
 * was not that any one method was wrong — it was that six were written over
 * months, each one reaching for the diet filter sitting in front of it, and
 * nobody ever asked the whole class of them the same question.
 *
 * So this guard asks it mechanically, in the shape of unbounded-reads.spec.ts:
 * a method that reads the catalogue either consults the citizen's declared
 * allergens, or carries `// unscreened: <reason>` saying why it does not.
 *
 * THE COMMENT IS THE POINT. Not every catalogue read should screen — placing an
 * order is a dish the citizen chose by name, and refusing it there would be the
 * app overruling somebody about their own body. What must not happen again is
 * that decision being made by default, silently, by whoever wrote the method.
 *
 * GUARDS READ THEIR OWN PROSE — six times in this repo now. Detection runs over
 * comment-blanked source, because the file is full of paragraphs that mention
 * findAllergen and screenVenues by name, including this rule's own history.
 *
 * AND THE ANNOTATION SITS ABOVE THE DECLARATION, which is where this codebase
 * puts annotations and where query-scoping's lesson says they belong. The first
 * draft of this guard read from the declaration line down and reported four
 * methods that were already annotated — a guard that cannot see the answer it
 * asked for is an audit that cries wolf, and those get switched off.
 */

const SRC = readFileSync(join(__dirname, 'restaurants.service.ts'), 'utf8');

/** Line-for-line comment removal, so scanning never matches an explanation. */
function blankComments(src: string): string[] {
  let inBlock = false;
  return src.split('\n').map((line) => {
    let out = line;
    if (inBlock) {
      const end = out.indexOf('*/');
      if (end === -1) return '';
      out = ' '.repeat(end + 2) + out.slice(end + 2);
      inBlock = false;
    }
    const block = out.indexOf('/*');
    if (block !== -1) {
      const end = out.indexOf('*/', block + 2);
      if (end === -1) { inBlock = true; return out.slice(0, block); }
      out = out.slice(0, block) + ' '.repeat(end + 2 - block) + out.slice(end + 2);
    }
    const line2 = out.indexOf('//');
    if (line2 !== -1) out = out.slice(0, line2);
    return out;
  });
}

const RAW = SRC.split('\n');
const CLEAN = blankComments(SRC);

/**
 * Methods, by where they start. A method's body runs to the next declaration —
 * no brace-walking, which is how bodies get mangled and, here, miscounted.
 */
const DECL = /^ {2}(?:private |public |protected )?(?:async )?([a-zA-Z_][\w]*)\s*\(/;
function methods(): Array<{ name: string; from: number; to: number }> {
  const starts: Array<{ name: string; from: number }> = [];
  CLEAN.forEach((l, i) => {
    const m = DECL.exec(l);
    if (m && !['if', 'for', 'while', 'switch', 'catch', 'return', 'constructor'].includes(m[1])) {
      starts.push({ name: m[1], from: i });
    }
  });
  return starts.map((s, i) => ({ ...s, to: i + 1 < starts.length ? starts[i + 1].from : CLEAN.length }));
}

/**
 * The contiguous comment block immediately above a declaration — JSDoc, line
 * comments, blank lines between them. Stops at the first line of real code, so
 * it can never reach up into the previous method's body.
 */
function annotationAbove(declLine: number): string {
  const out: string[] = [];
  for (let i = declLine - 1; i >= 0; i--) {
    const t = RAW[i].trim();
    if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) { out.unshift(RAW[i]); continue; }
    break;
  }
  return out.join('\n') + '\n';
}

/** Reaching the catalogue: the rows, the candidate assembly, or a menu. */
const READS_CATALOGUE = /prisma\.restaurant\.find|assembleCandidates\(|curatedCard\(|parseMenu\(/;
/** Consulting the citizen: the union, the venue screen, or the matcher itself. */
const SCREENS = /allergenTerms\(|screenVenues\(|markVenue\(|findAllergen\(/;
const EXEMPT = /\/\/\s*unscreened:/;

describe('every catalogue read answers the allergy question', () => {
  it('screens, or says in one line why it does not', () => {
    const offenders: string[] = [];
    for (const m of methods()) {
      const body = CLEAN.slice(m.from, m.to).join('\n');
      if (!READS_CATALOGUE.test(body)) continue;
      if (SCREENS.test(body)) continue;
      // The exemption is read from the SOURCE, comments and all — it IS a
      // comment — and from the block ABOVE the declaration, where it belongs.
      if (EXEMPT.test(annotationAbove(m.from) + RAW.slice(m.from, m.to).join('\n'))) continue;
      offenders.push(`  ${m.name}()  — line ${m.from + 1}`);
    }
    expect(offenders.join('\n') || 'none').toBe('none');
  });

  it('the guard can actually see a method (it is not scanning an empty list)', () => {
    // An audit that finds nothing because it parsed nothing is the failure mode
    // that makes a green ratchet worthless. Name the ones that must be there.
    const found = methods().map((m) => m.name);
    expect(found).toEqual(expect.arrayContaining([
      'discover', 'browse', 'search', 'detail', 'mealMatch', 'collections', 'topByLocality', 'placeOrder',
    ]));
    expect(methods().filter((m) => READS_CATALOGUE.test(CLEAN.slice(m.from, m.to).join('\n'))).length)
      .toBeGreaterThanOrEqual(7);
  });

  it('an exemption must give a reason, not just the word', () => {
    // `// unscreened:` with nothing after it is a silencer, not a decision.
    const bare = RAW
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /\/\/\s*unscreened:\s*$/.test(l))
      .map(({ i }) => `  line ${i + 1}`);
    expect(bare.join('\n') || 'none').toBe('none');
  });
});

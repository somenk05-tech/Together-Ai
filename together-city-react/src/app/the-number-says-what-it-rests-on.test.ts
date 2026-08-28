import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverageNote, coverageShort } from '@/features/dating/bands';

/**
 * ── THE NUMBER SAYS WHAT IT RESTS ON, WHERE IT IS READ ──
 *
 * `coverageNote` produces exactly the right sentence — "Only 1 of the six
 * questions behind this number is answered by you both — the rest is read from
 * your birth dates" — and was rendered in two places: the compatibility sheet
 * inside a chat, and the match detail. Neither is where a citizen meets the
 * percentage. The deck card and the Curated Matches row carry it first, and
 * both carried it alone: "69% Compatible · Good match".
 *
 * That matters most exactly when it is least visible. At launch-day
 * completeness the six answerable factors move the displayed number by about a
 * point; the rest is two birth dates. A card that prints 69% with nothing
 * beside it is not wrong about the arithmetic, it is quiet about the evidence.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const src = (...p: string[]) => readFileSync(join(HERE, '..', ...p), 'utf8');

describe('the short form', () => {
  it('counts questions, because a citizen can go and answer one', () => {
    expect(coverageShort(1 / 6)).toBe('From 1 of 6 answers');
    expect(coverageShort(3 / 6)).toBe('From 3 of 6 answers');
  });

  it('says the honest thing when nothing at all has been answered', () => {
    expect(coverageShort(0)).toBe('From your birth dates alone');
  });

  it('says nothing when there is nothing to disclose', () => {
    expect(coverageShort(1)).toBeNull();
    expect(coverageShort(undefined)).toBeNull();
    expect(coverageShort(Number.NaN)).toBeNull();
  });

  it('agrees with the long form about how many were answered', () => {
    // Two renderings of one fact; they may not drift on the count.
    for (const cov of [0, 1 / 6, 2 / 6, 5 / 6]) {
      const long = coverageNote(cov) ?? '';
      const short = coverageShort(cov) ?? '';
      const n = Math.round(cov * 6);
      if (n === 0) {
        expect(long).toMatch(/birth dates alone/);
        expect(short).toMatch(/birth dates alone/);
      } else {
        expect(long).toContain(`${n} of the six`);
        expect(short).toContain(`${n} of 6`);
      }
    }
  });
});

describe('where it is rendered', () => {
  it('on the deck card, beside the figure it qualifies', () => {
    const card = src('features', 'dating', 'components', 'MatchCards.tsx');
    expect(card).toContain('coverageShort');
    // The score line and the caveat, in that order, in the same block.
    expect(card.indexOf('pm-compat')).toBeLessThan(card.indexOf('pm-cov'));
  });

  it('on the Curated Matches row', () => {
    expect(src('features', 'dating', 'pages', 'DatingMatches.tsx')).toContain('coverageShort');
  });

  it('and the sentence version stays where there is room for a sentence', () => {
    expect(src('features', 'dating', 'pages', 'DatingMatchDetail.tsx')).toContain('coverageNote');
    expect(src('features', 'dating', 'components', 'ChatPieces.tsx')).toContain('coverageNote');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QueryClient } from '@tanstack/react-query';
import { editDeck, withCardChosen, withoutCard, type CuratedMatch, type DatingStack, type DiscoverResult } from './api';

/**
 * ── A SKIP DOES NOT REFETCH THE DECK (fifth audit, 31 Aug, H5) ──────────────
 *
 * Every Skip and every Connect invalidated the discover and stack queries and
 * refetched a 200-card page. The server allows twenty reads a minute of each.
 * Skip a card every three seconds and on the twenty-first the whole deck was
 * replaced by "We couldn't score your matches" for the rest of the minute.
 *
 * The answer to a pass is that the person is gone; the answer to a like is
 * that the card is "Chosen". Both are known here. So the caches are edited in
 * place — every page size of both lists — and a refetch happens only on a
 * match, which moves a person between rooms.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const card = (id: string): CuratedMatch => ({
  matchId: null, user: { id, name: id }, bio: null, interests: [], yourSign: 'Leo', theirSign: 'Aries',
  score: 80, likedByMe: false, matched: false, conversationId: null,
});

function seeded() {
  const qc = new QueryClient();
  const discover = (ids: string[]): DiscoverResult => ({
    sections: [
      { key: 'ideal', label: 'Ideal', note: '', tier: 'ideal', matches: ids.slice(0, 2).map(card) },
      { key: 'new', label: 'New', note: '', tier: 'discovery', matches: ids.slice(2).map(card) },
    ],
    idealCount: 2, lowDensity: false, totalDiscoverable: ids.length, shown: ids.length, hasMore: false, poolSize: ids.length, poolCapped: false,
  });
  const stack = (ids: string[]): DatingStack => ({
    engaged: false, distribution: [], top: card(ids[0]), candidates: ids.map(card), matched: [], totalCandidates: ids.length,
  });
  // Two page sizes of each, because "Show more" makes a second key.
  qc.setQueryData(['dating', 'discover', 'romantic', 200], discover(['a', 'b', 'c', 'd']));
  qc.setQueryData(['dating', 'discover', 'romantic', 400], discover(['a', 'b', 'c', 'd', 'e']));
  qc.setQueryData(['dating', 'stack', 'romantic', 1], stack(['a', 'b', 'c']));
  qc.setQueryData(['dating', 'stack', 'romantic', 'all'], stack(['a', 'b', 'c', 'd']));
  // And the other kind, which must not be touched.
  qc.setQueryData(['dating', 'discover', 'platonic', 200], discover(['a', 'z']));
  return qc;
}

const ids = (r: DiscoverResult | undefined) => (r?.sections ?? []).flatMap((s) => s.matches.map((m) => m.user.id));

describe('a skip does not refetch the deck', () => {
  it('removes the skipped person from every page of both lists, and nobody else', () => {
    const qc = seeded();
    editDeck(qc, 'romantic', withoutCard('a'));
    expect(ids(qc.getQueryData(['dating', 'discover', 'romantic', 200]))).toEqual(['b', 'c', 'd']);
    expect(ids(qc.getQueryData(['dating', 'discover', 'romantic', 400]))).toEqual(['b', 'c', 'd', 'e']);
    const s1 = qc.getQueryData<DatingStack>(['dating', 'stack', 'romantic', 1]);
    expect(s1?.candidates.map((c) => c.user.id)).toEqual(['b', 'c']);
    // The top card follows the list: the next best steps up.
    expect(s1?.top?.user.id).toBe('b');
    expect(ids(qc.getQueryData(['dating', 'discover', 'platonic', 200]))).toEqual(['a', 'z']);
  });

  it('marks a liked person as chosen in place rather than dropping them', () => {
    const qc = seeded();
    editDeck(qc, 'romantic', withCardChosen('c'));
    const r = qc.getQueryData<DiscoverResult>(['dating', 'discover', 'romantic', 200]);
    const c = r?.sections.flatMap((s) => s.matches).find((m) => m.user.id === 'c');
    expect(c?.likedByMe).toBe(true);
    expect(ids(r)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves an empty stack honest', () => {
    const qc = seeded();
    editDeck(qc, 'romantic', () => []);
    const s = qc.getQueryData<DatingStack>(['dating', 'stack', 'romantic', 1]);
    expect(s?.candidates).toEqual([]);
    expect(s?.top).toBeNull();
  });

  it('the pass and like hooks edit rather than invalidate the lists', () => {
    const src = read('./api.ts');
    const hook = (name: string) => {
      const start = src.indexOf(`export function ${name}(`);
      const end = src.indexOf('\nexport ', start + 1);
      return src.slice(start, end);
    };
    const pass = hook('usePassMatch');
    expect(pass).toContain('editDeck(qc, kind, withoutCard(targetUserId))');
    expect(pass).not.toMatch(/invalidateQueries\(\{ queryKey: \['dating', '(discover|stack)'/);
    const like = hook('useLikeMatch');
    expect(like).toContain('editDeck(qc, kind, withCardChosen(targetUserId))');
    // A match is the one event that refetches: it moves a person between rooms.
    expect(like).toMatch(/if \(result\.matched\) \{[\s\S]*invalidateQueries\(\{ queryKey: \['dating', 'discover', kind\] \}\)/);
  });
});

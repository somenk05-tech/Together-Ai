import { composeTarot, spreadSize, type SpreadKind } from './tarot-content';
import { DECK } from './tarot-deck';
import { violations } from './voice';

describe('tarot-content', () => {
  it('deals a full, non-repeating deck into every spread', () => {
    expect(DECK).toHaveLength(78);
    for (const kind of ['daily', 'three', 'celtic'] as SpreadKind[]) {
      const r = composeTarot(kind, `seed:${kind}`);
      expect(r.cards).toHaveLength(spreadSize(kind));
      // A real shuffle, not N independent picks — the Tower cannot land twice.
      expect(new Set(r.cards.map((c) => c.cardId)).size).toBe(r.cards.length);
    }
  });

  it('is reproducible from its seed, and different seeds differ', () => {
    const a = composeTarot('celtic', 'seed-A', 'What should I focus on?');
    const b = composeTarot('celtic', 'seed-A', 'What should I focus on?');
    expect(b.cards.map((c) => `${c.cardId}${c.reversed}`)).toEqual(a.cards.map((c) => `${c.cardId}${c.reversed}`));
    const c = composeTarot('celtic', 'seed-B', 'What should I focus on?');
    expect(c.cards.map((x) => x.cardId)).not.toEqual(a.cards.map((x) => x.cardId));
  });

  /**
   * The cards stay VISIBLE — name, keywords and orientation are structured data
   * on every drawn card, and the UI shows them. What must never happen is the
   * prose narrating the deck instead of speaking to the person. Swept over many
   * seeds because which cards come up decides which phrasing branches run.
   */
  it('reads to the person, never about the cards', () => {
    for (const kind of ['daily', 'three', 'celtic'] as SpreadKind[]) {
      for (let i = 0; i < 40; i++) {
        const r = composeTarot(kind, `voice-seed-${kind}-${i}`, 'Where should I put my energy this month?');
        const prose = [r.summary, ...r.cards.map((c) => c.reading)].join('\n');
        expect({ kind, i, found: violations(prose) }).toEqual({ kind, i, found: [] });
        // The card itself is still identified — that is the point of a tarot tab.
        expect(r.cards[0].name).toBeTruthy();
        expect(r.cards[0].keywords.length).toBeGreaterThan(0);
      }
    }
  });
});

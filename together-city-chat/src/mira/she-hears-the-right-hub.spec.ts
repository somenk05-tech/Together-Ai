import { route } from './router';
import { manifest, upTo } from './manifest';
import type { Capability } from './mira.registry';

/**
 * SHE HEARS THE RIGHT HUB.
 *
 * "What my nutrition today" was answered, in production, with the astrology
 * day brief — a cryptic line from the citizen's reading, a stew time and an
 * unread count, signed "Take me to Astrology" (owner's screenshot, 15 Aug).
 * A citizen asked about food and was told about her stars.
 *
 * Two faults made it, and both are pinned here against the REAL manifest —
 * the same source-parsed utterance lists the build gates read — so a future
 * utterance edit that re-opens the hole goes red in CI rather than in a
 * screenshot:
 *
 *  1. The router matched tokens by SUBSTRING, so "day" matched inside
 *     "today" and 'how is my day' half-claimed every sentence with "today"
 *     in it.
 *  2. The kitchen owned none of the words people actually say for today's
 *     food — "nutrition today", "meal plan".
 */

const caps = upTo('R0') as unknown as Capability[];

describe('she hears the right hub', () => {
  it('a nutrition question reaches the kitchen, never the stars', () => {
    // The exact production sentence, typo-grammar and all.
    //
    // IT USED TO REACH `prep-alerts`, WHICH WAS THE BUG UNDER THE BUG. That
    // handler reports soaking and marinating deadlines; it owned these words
    // and answered them with "Nothing needs starting yet. Kitchen is quiet."
    // Reaching the kitchen was never enough — it has to reach the handler in
    // the kitchen that can say what is for dinner.
    expect(route('What my nutrition today', { capabilities: caps }).capabilityId)
      .toBe('nutrition GET plan/today');
    expect(route('What my meal plan today', { capabilities: caps }).capabilityId)
      .toBe('nutrition GET plan/today');
    expect(route('tell me a meal i can eat today', { capabilities: caps }).capabilityId)
      .toBe('nutrition GET plan/today');
    expect(route('what am i eating today', { capabilities: caps }).capabilityId)
      .toBe('nutrition GET plan/today');
    // And prep keeps its own question.
    expect(route('anything to prep', { capabilities: caps }).capabilityId)
      .toBe('nutrition GET prep-alerts');
    expect(route('my nutrition targets', { capabilities: caps }).capabilityId)
      .toBe('nutrition GET targets');
  });

  it('and the day itself is still hers', () => {
    expect(route('how is my day going to be', { capabilities: caps }).capabilityId)
      .toBe('astrology GET daily');
    expect(route('my reading today', { capabilities: caps }).capabilityId)
      .toBe('astrology GET daily');
  });

  it('a token is a word, never a substring — "day" does not live inside "today"', () => {
    const only: Capability[] = [{
      id: 'astrology GET daily', method: 'GET', path: 'astrology/daily', controller: 'x',
      intent: 'Read the day', utterances: ['how is my day'], risk: 'R0',
    } as Capability];
    const v = route('what my nutrition today', { capabilities: only });
    expect(v.capabilityId).toBeUndefined();
    expect(v.why).toBe('nothing matched');
  });

  it('the whole manifest still routes without a tie on the production sentence', () => {
    // A guard against the NEXT utterance addition quietly creating a near-tie
    // that turns this question into "which one?" — the sentence must stay a
    // clean single match as the manifest grows.
    const v = route('What my nutrition today', { capabilities: caps });
    expect(v.why).toBe('matched nutrition GET plan/today');
    expect(manifest().length).toBeGreaterThan(0);
  });
});

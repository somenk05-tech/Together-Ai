import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { OFFERED_CATEGORIES, categoryGroup } from './categories';
import { Reading, readingFor, understandByRules, unreadable } from './understand';

/**
 * ── THE READING, WITH THE MODEL AS THE SECOND OPINION ────────────────────────
 *
 * understand.ts reads the sentence by rules and says how sure it is. This is
 * the one place the model is asked, and it is asked ONLY when the rules were
 * not sure — "I run a café" never costs a model call, "I do a bit of
 * everything for the buildings on my road" does. Owner, 17 Sep: the vendor
 * types naturally and Together City identifies the business; a lexicon
 * cannot cover every way of saying a trade, and a model cannot be trusted to
 * name one, so each does the half it is good at.
 *
 * THE MODEL PICKS OFF THE LIST. It is handed the offered trades, key and
 * label, and returns a key. A key it invented, or a retired one, is thrown
 * away and the rules' own answer stands — the vocabulary is the owner's
 * (categories.ts, 5 Aug), and a reading that steps outside it would file a
 * business under a trade the directory cannot browse.
 *
 * METERED LIKE EVERY OTHER MODEL CALL. AiService.json charges the citizen's
 * free daily budget before it asks; a 429 from the budget surfaces as the
 * rules' answer rather than an error, because an owner who has used up the
 * day's free model work can still create their business — they just pick
 * the trade from the list instead of having it read for them.
 */
@Injectable()
export class UnderstandService {
  private readonly logger = new Logger(UnderstandService.name);

  constructor(private readonly ai: AiService) {}

  async understand(text: string): Promise<Reading & { source: 'rules' | 'model' }> {
    const byRules = understandByRules(text);
    if (byRules && byRules.confidence === 'sure') return { ...byRules, source: 'rules' };

    const modelKey = await this.askModel(text);
    if (modelKey) {
      const alternatives = byRules ? [byRules.categoryKey, ...byRules.alternatives.map((a) => a.categoryKey)] : [];
      return { ...readingFor(modelKey, 'likely', text, alternatives), source: 'model' };
    }
    return { ...(byRules ?? unreadable(text)), source: 'rules' };
  }

  /** The model's pick, held to the vocabulary; null when it had none or failed. */
  private async askModel(text: string): Promise<string | null> {
    const list = OFFERED_CATEGORIES.map((c) => `${c.key} — ${c.label} (${categoryGroup(c.key)})`).join('\n');
    const system =
      'A small-business owner in India describes what they do in one sentence. Pick the ONE trade from the list that ' +
      'best fits, by its key. Return {"categoryKey": "<key>"} and nothing else. If nothing fits, return {"categoryKey": "other"}.\n\n' +
      `Trades:\n${list}`;
    try {
      const out = await this.ai.json<{ categoryKey?: unknown }>(system, text.slice(0, 400), {}, 64);
      const key = typeof out?.categoryKey === 'string' ? out.categoryKey.trim() : '';
      return OFFERED_CATEGORIES.some((c) => c.key === key) ? key : null;
    } catch (e) {
      // The budget said no (a 429 is thrown, not caught, by AiService.json on
      // purpose — see meter). The owner is not told their sentence failed;
      // they are shown the rules' best reading and the list to correct it.
      this.logger.warn(`understand: model not consulted — ${(e as Error).message}`);
      return null;
    }
  }
}

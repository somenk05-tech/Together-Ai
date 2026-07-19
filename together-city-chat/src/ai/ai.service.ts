import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Thin wrapper over the Anthropic API used by the AI features (recipe, dating,
 * beauty, fitness suggestions). Degrades gracefully: when ANTHROPIC_API_KEY is
 * unset (or a call fails), callers receive their supplied deterministic
 * fallback, so every feature keeps working without the key.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService');
  private readonly client: Anthropic | null;
  private readonly model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
  readonly enabled: boolean;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    this.client = key ? new Anthropic({ apiKey: key }) : null;
    this.enabled = !!this.client;
    if (!this.enabled) this.logger.log('ANTHROPIC_API_KEY not set — AI features use deterministic fallbacks.');
  }

  /** Ask for a JSON object matching <T>. Returns `fallback` if AI is off or errors. */
  async json<T>(system: string, user: string, fallback: T, maxTokens = 1024): Promise<T> {
    if (!this.client) return fallback;
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: `${system}\n\nRespond with ONLY a valid JSON value — no prose, no markdown fences.`,
        messages: [{ role: 'user', content: user }],
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const parsed = this.extractJson(text);
      return (parsed as T) ?? fallback;
    } catch (e) {
      this.logger.warn(`AI json call failed: ${(e as Error).message}`);
      return fallback;
    }
  }

  private extractJson(text: string): unknown {
    const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // Grab the first {...} or [...] block if the model wrapped it in prose.
      const match = trimmed.match(/[[{][\s\S]*[\]}]/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { return null; }
      }
      return null;
    }
  }
}

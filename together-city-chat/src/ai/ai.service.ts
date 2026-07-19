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
  // Current models (older 3.5 IDs are retired → 404). Haiku 4.5 is the cheapest
  // and supports vision, so it serves both text and image/PDF-vision extraction.
  private readonly model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  private readonly visionModel = process.env.ANTHROPIC_VISION_MODEL || 'claude-haiku-4-5';
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

  /**
   * Read a blood-report image or PDF and extract numeric marker values. AI does
   * EXTRACTION ONLY — the deterministic clinical engine does the interpretation.
   * Returns {} when the key is unset or the call fails (caller falls back to
   * manual entry). Keys map to the engine: hb, ferritin, vitd, b12, folate,
   * hba1c, ldl, trig, crp.
   */
  private static readonly MARKER_SYSTEM =
    'You extract lab values from a blood-test report. Return ONLY JSON: ' +
    '{"values":{"hb":number,"ferritin":number,"vitd":number,"b12":number,"folate":number,"hba1c":number,"ldl":number,"trig":number,"crp":number},"lab":string,"takenOn":"YYYY-MM-DD"}. ' +
    'Include a marker ONLY if it clearly appears on the report, using the report\'s numeric value in these units: ' +
    'hb (hemoglobin) g/dL, ferritin ng/mL, vitd (25-OH vitamin D) ng/mL, b12 pg/mL, folate ng/mL, hba1c %, ldl (LDL cholesterol, use the DIRECT value if given) mg/dL, trig (triglycerides) mg/dL, crp mg/L. ' +
    'Convert if the report uses different units. Omit any marker not present. Report text from a PDF may have columns out of order — match each value to the correct test name carefully, and never confuse a value with its reference range. Never invent values.';

  private cleanMarkers(parsed: { values?: Record<string, unknown>; lab?: string; takenOn?: string } | null): { values: Record<string, number>; lab?: string; takenOn?: string } {
    if (!parsed || typeof parsed !== 'object') return { values: {} };
    const clean: Record<string, number> = {};
    for (const k of ['hb', 'ferritin', 'vitd', 'b12', 'folate', 'hba1c', 'ldl', 'trig', 'crp']) {
      const v = parsed.values?.[k];
      if (typeof v === 'number' && isFinite(v) && v > 0) clean[k] = v;
    }
    return { values: clean, lab: typeof parsed.lab === 'string' ? parsed.lab : undefined, takenOn: typeof parsed.takenOn === 'string' ? parsed.takenOn : undefined };
  }

  /** Extract markers from the plain text of a report (e.g. a text-based PDF).
   *  Uses the text model — cheaper and more reliable than PDF vision. */
  async extractMarkersFromText(text: string): Promise<{ values: Record<string, number>; lab?: string; takenOn?: string }> {
    if (!this.client || !text.trim()) return { values: {} };
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: `${AiService.MARKER_SYSTEM}\n\nRespond with ONLY valid JSON — no prose, no markdown fences.`,
        messages: [{ role: 'user', content: `Blood report text:\n\n${text.slice(0, 40000)}` }],
      });
      const out = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      return this.cleanMarkers(this.extractJson(out) as { values?: Record<string, unknown>; lab?: string; takenOn?: string } | null);
    } catch (e) {
      this.logger.warn(`Text marker extraction failed: ${(e as Error).message}`);
      return { values: {} };
    }
  }

  async extractBloodMarkers(
    base64: string,
    mediaType: string,
  ): Promise<{ values: Record<string, number>; lab?: string; takenOn?: string }> {
    if (!this.client) return { values: {} };
    const isPdf = mediaType === 'application/pdf';
    const system =
      'You extract lab values from a blood-test report. Return ONLY JSON: ' +
      '{"values":{"hb":number,"ferritin":number,"vitd":number,"b12":number,"folate":number,"hba1c":number,"ldl":number,"trig":number,"crp":number},"lab":string,"takenOn":"YYYY-MM-DD"}. ' +
      'Include a marker ONLY if it clearly appears on the report, using the report\'s numeric value in these units: ' +
      'hb g/dL, ferritin ng/mL, vitd (25-OH vitamin D) ng/mL, b12 pg/mL, folate ng/mL, hba1c %, ldl mg/dL, trig mg/dL, crp mg/L. ' +
      'Convert if the report uses different units. Omit any marker not present. Never invent values.';
    try {
      const source = isPdf
        ? ({ type: 'base64', media_type: 'application/pdf', data: base64 } as const)
        : ({ type: 'base64', media_type: (mediaType || 'image/jpeg') as 'image/jpeg', data: base64 } as const);
      const block = isPdf
        ? ({ type: 'document', source } as unknown as Anthropic.ContentBlockParam)
        : ({ type: 'image', source } as unknown as Anthropic.ContentBlockParam);
      const res = await this.client.messages.create({
        model: this.visionModel,
        max_tokens: 1024,
        system: `${system}\n\nRespond with ONLY valid JSON — no prose, no markdown fences.`,
        messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extract the blood markers as JSON.' }] }],
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const parsed = this.extractJson(text) as { values?: Record<string, unknown>; lab?: string; takenOn?: string } | null;
      if (!parsed || typeof parsed !== 'object') return { values: {} };
      const clean: Record<string, number> = {};
      const allow = ['hb', 'ferritin', 'vitd', 'b12', 'folate', 'hba1c', 'ldl', 'trig', 'crp'];
      for (const k of allow) {
        const v = parsed.values?.[k];
        if (typeof v === 'number' && isFinite(v) && v > 0) clean[k] = v;
      }
      return { values: clean, lab: typeof parsed.lab === 'string' ? parsed.lab : undefined, takenOn: typeof parsed.takenOn === 'string' ? parsed.takenOn : undefined };
    } catch (e) {
      this.logger.warn(`Blood extraction failed: ${(e as Error).message}`);
      return { values: {} };
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

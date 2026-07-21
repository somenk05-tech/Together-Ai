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
  // Split by task (all env-overridable):
  //  • model      — cheap, high-volume: recipe steps, moderation, beauty/fitness tips.
  //  • bloodModel — blood-report reading, where accuracy matters → Opus 4.8.
  //  • visionModel— blood-report images/PDF vision → Opus 4.8.
  private readonly model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  private readonly bloodModel = process.env.ANTHROPIC_BLOOD_MODEL || 'claude-opus-4-8';
  private readonly visionModel = process.env.ANTHROPIC_VISION_MODEL || 'claude-opus-4-8';
  readonly enabled: boolean;

  /** The model id used for blood-report interpretation (recorded on stored analyses). */
  get bloodModelId(): string { return this.bloodModel; }

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
        model: this.bloodModel,
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

  /**
   * AI review of skin/scalp/hair photos. First judges the image: rejects photos
   * that are unclear (blurry/dark/cropped) or that look beauty-filtered or
   * AI-generated, so the analysis is only run on authentic, usable photos.
   * Returns detected-attribute tags the caller folds into its assessment.
   */
  async reviewSkinPhotos(images: { base64: string; mediaType: string }[]): Promise<{ quality: 'ok' | 'unclear' | 'suspect'; findings: string[]; note: string; face: Record<string, string> | null }> {
    if (!this.client) return { quality: 'ok', findings: [], note: '', face: null };
    if (!images.length) return { quality: 'unclear', findings: [], note: 'No photo provided.', face: null };
    const ALLOWED = ['acne', 'pigmentation', 'wrinkle', 'texture', 'pore', 'redness', 'dehydration', 'dark-circles', 'density', 'thickness', 'hairline', 'scalp', 'dandruff'];
    const FACE_ENUMS: Record<string, string[]> = {
      faceShape: ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'],
      eyeShape: ['almond', 'round', 'hooded', 'monolid', 'downturned', 'upturned'],
      eyeSize: ['small', 'medium', 'large'],
      browShape: ['straight', 'soft-arch', 'high-arch', 'curved', 'thin', 'thick'],
      lipShape: ['full', 'thin', 'wide', 'heart', 'balanced'],
      cheekbones: ['high', 'mid', 'soft'],
      jawline: ['sharp', 'soft', 'rounded'],
      maturity: ['youthful', 'balanced', 'mature'],
      undertoneGuess: ['warm', 'cool', 'neutral'],
      depthGuess: ['fair', 'light', 'medium', 'tan', 'deep'],
    };
    const system =
      'You review real skin/scalp/hair photos for a wellness assessment (not a diagnosis). ' +
      'STEP 1 — judge authenticity & clarity: if a photo is blurry, too dark, heavily cropped, or clearly beauty-filtered / smoothed / AI-generated / heavily edited, do NOT analyse it. ' +
      'STEP 2 — only for a clear, authentic, unfiltered photo, list the visible attribute tags. ' +
      'STEP 3 — from the clear face photos, read the facial features for makeup guidance. ' +
      'Return ONLY JSON {"quality":"ok"|"unclear"|"suspect","findings":string[],"note":string,"face":object|null}. ' +
      'quality="unclear" for blurry/dark/unusable; quality="suspect" if it looks filtered or AI-generated; quality="ok" only for a clear authentic photo. ' +
      'findings use ONLY these tags where genuinely visible: ' + ALLOWED.join(', ') + '. Never invent findings; empty findings unless quality="ok". ' +
      'face: only when quality="ok" and a face is clearly visible — keys ' + Object.keys(FACE_ENUMS).join(', ') + ', each value strictly one of its allowed set: ' +
      Object.entries(FACE_ENUMS).map(([k, v]) => `${k}: ${v.join('|')}`).join('; ') + '. Omit any key you cannot judge; face=null if no clear face.';
    try {
      const blocks = images.slice(0, 6).map((im) => ({
        type: 'image',
        source: { type: 'base64', media_type: (im.mediaType || 'image/jpeg') as 'image/jpeg', data: im.base64 },
      } as unknown as Anthropic.ContentBlockParam));
      const res = await this.client.messages.create({
        model: this.visionModel,
        max_tokens: 512,
        system: `${system}\n\nRespond with ONLY valid JSON — no prose, no markdown fences.`,
        messages: [{ role: 'user', content: [...blocks, { type: 'text', text: 'Review these photos and return the JSON.' }] }],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const parsed = this.extractJson(text) as { quality?: string; findings?: unknown; note?: string } | null;
      const quality = parsed?.quality === 'suspect' ? 'suspect' : parsed?.quality === 'unclear' ? 'unclear' : 'ok';
      const raw = Array.isArray(parsed?.findings) ? parsed!.findings : [];
      const findings = quality === 'ok' ? raw.filter((x): x is string => typeof x === 'string' && ALLOWED.includes(x)) : [];
      // Validate face attributes strictly against the enums.
      let face: Record<string, string> | null = null;
      const rawFace = (parsed as { face?: unknown } | null)?.face;
      if (quality === 'ok' && rawFace && typeof rawFace === 'object') {
        face = {};
        for (const [k, allowed] of Object.entries(FACE_ENUMS)) {
          const v = (rawFace as Record<string, unknown>)[k];
          if (typeof v === 'string' && allowed.includes(v)) face[k] = v;
        }
        if (Object.keys(face).length === 0) face = null;
      }
      return { quality, findings, note: typeof parsed?.note === 'string' ? parsed.note : '', face };
    } catch (e) {
      this.logger.warn(`Skin photo review failed: ${(e as Error).message}`);
      return { quality: 'ok', findings: [], note: '', face: null };
    }
  }

  /**
   * AI clinical interpretation of a blood panel — narrative only. The numeric
   * score + priority ranking are computed deterministically by the caller from
   * the cited engine; this adds the plain-language "what it may mean / how markers
   * relate / what to discuss" layer. Educational, never a diagnosis. Uses the
   * blood (Opus) model. Empty arrays on fallback.
   */
  async clinicalInterpretation(payload: string, name: string): Promise<{ greeting: string; interpretation: string[]; relationships: string[]; discuss: string[]; encouragement: string }> {
    const first = (name || 'there').split(' ')[0];
    const fallback = { greeting: `Dear ${first},`, interpretation: [] as string[], relationships: [] as string[], discuss: [] as string[], encouragement: '' };
    if (!this.client) return fallback;
    const system =
      `You are a warm, encouraging clinical-nutrition educator writing a personal report for ${first}. ` +
      'Given their blood markers (value, status vs reference range) and profile, return ONLY JSON: ' +
      '{"greeting": string, "interpretation": string[], "relationships": string[], "discuss": string[], "encouragement": string}. ' +
      `greeting: a warm personal opening addressing them by name, e.g. "Dear ${first},". ` +
      'interpretation: 3–6 short plain-language bullets on what each abnormal result may indicate. ' +
      'relationships: 1–3 bullets on how the abnormal markers relate to one another (e.g. glucose + triglycerides). ' +
      'discuss: the findings worth raising with a healthcare professional. ' +
      'encouragement: 2–3 warm, human sentences — supportive and motivating, acknowledging that these findings are actionable and that small consistent steps help, without minimising anything real or being falsely reassuring. ' +
      'Rules: educational ONLY, never a diagnosis, no medication names, no dosages, no treatment prescriptions. ' +
      'Be specific to the actual values. If all markers are normal, celebrate that warmly and keep the clinical arrays empty.';
    try {
      const res = await this.client.messages.create({
        model: this.bloodModel,
        max_tokens: 1400,
        system: `${system}\n\nRespond with ONLY valid JSON — no prose, no markdown fences.`,
        messages: [{ role: 'user', content: payload }],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const p = this.extractJson(text) as { greeting?: unknown; interpretation?: unknown; relationships?: unknown; discuss?: unknown; encouragement?: unknown } | null;
      if (!p) return fallback;
      const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, 8) : []);
      const str = (x: unknown, d: string): string => (typeof x === 'string' && x.trim() ? x : d);
      return {
        greeting: str(p.greeting, `Dear ${first},`),
        interpretation: arr(p.interpretation),
        relationships: arr(p.relationships),
        discuss: arr(p.discuss),
        encouragement: str(p.encouragement, ''),
      };
    } catch (e) {
      this.logger.warn(`Clinical interpretation failed: ${(e as Error).message}`);
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

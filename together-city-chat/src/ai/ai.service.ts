import { Injectable, Logger } from '@nestjs/common';
import { informalName, salutation } from '../shared/salutation';
import { acceptOrFallback, cityVoice, inVoice, violations } from '../shared/voice';
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
  private readonly bloodModel = process.env.ANTHROPIC_BLOOD_MODEL || 'claude-opus-5';
  private readonly visionModel = process.env.ANTHROPIC_VISION_MODEL || 'claude-opus-5';
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
  /**
   * messages.create with an automatic model fallback: if the preferred model is
   * unavailable to this API key (404 not_found / 403), retry once on the default
   * model rather than silently failing the feature.
   */
  private async createWithFallback(params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'> & { model: string }): Promise<Anthropic.Message> {
    if (!this.client) throw new Error('AI disabled');
    // Try the preferred model, then walk a chain of known-good current models.
    // Extraction/interpretation calls are read-only and idempotent, so retrying on
    // ANY failure (retired model id, 404, overloaded, transient 5xx) is safe and
    // maximises the chance the user's report is read on the first upload.
    const chain = [...new Set([params.model, this.bloodModel, 'claude-sonnet-5', this.model])];
    let lastErr: unknown = null;
    for (const model of chain) {
      try {
        return await this.client.messages.create({ ...params, model });
      } catch (e) {
        lastErr = e;
        const msg = ((e as Error).message ?? '').slice(0, 160);
        this.logger.warn(`messages.create failed on ${model} (${msg})${model === chain[chain.length - 1] ? '' : ' — trying next model'}`);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('AI call failed on every model');
  }

  async extractMarkersFromText(text: string): Promise<{ values: Record<string, number>; lab?: string; takenOn?: string }> {
    if (!this.client || !text.trim()) return { values: {} };
    try {
      const res = await this.createWithFallback({
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
      const res = await this.createWithFallback({
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
      const res = await this.createWithFallback({
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
      // The one free-text field a photo review returns to the citizen, and it is
      // about their own face — the last place to let through "you're perfectly
      // fine" or a sentence about the assistant.
      const note = acceptOrFallback(typeof parsed?.note === 'string' ? parsed.note : '', '', 0);
      return { quality, findings, note, face };
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
    const first = informalName(name);
    const fallback = { greeting: salutation(name), interpretation: [] as string[], relationships: [] as string[], discuss: [] as string[], encouragement: '' };
    if (!this.client) return fallback;
    const system =
      // The city voice first, so the constraints that stop a model reassuring
      // somebody about their own blood results are stated before the task is.
      `${cityVoice(name)} ` +
      `You are a clinical-nutrition educator writing a personal letter to ${first}. ` +
      'Given their blood markers (value, status vs reference range) and profile, return ONLY JSON: ' +
      '{"greeting": string, "interpretation": string[], "relationships": string[], "discuss": string[], "encouragement": string}. ' +
      `greeting: the opening line, addressing them by name — "Dear ${first},". ` +
      'interpretation: 3–6 short plain-language bullets on what each abnormal result may indicate. ' +
      'relationships: 1–3 bullets on how the abnormal markers relate to one another (e.g. glucose + triglycerides). ' +
      'discuss: the findings worth raising with a healthcare professional. ' +
      'encouragement: 2–3 sentences that acknowledge how this might feel to read before saying what can be done. Name the difficulty rather than talking around it. Do not minimise anything real, and do not reassure beyond what the numbers support. ' +
      'Rules: educational ONLY, never a diagnosis, no medication names, no dosages, no treatment prescriptions. ' +
      'Be specific to the actual values. If all markers are normal, celebrate that warmly and keep the clinical arrays empty.';
    try {
      const res = await this.createWithFallback({
        model: this.bloodModel,
        max_tokens: 1400,
        system: `${system}\n\nRespond with ONLY valid JSON — no prose, no markdown fences.`,
        messages: [{ role: 'user', content: payload }],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const p = this.extractJson(text) as { greeting?: unknown; interpretation?: unknown; relationships?: unknown; discuss?: unknown; encouragement?: unknown } | null;
      if (!p) return fallback;
      /**
       * Bullets that break the voice are dropped, one by one, and logged.
       *
       * Dropped rather than rewritten, and individually rather than wholesale:
       * a bullet reading "your B12 is low but there is nothing to worry about"
       * carries a real finding and a claim this app is not entitled to make, and
       * losing the whole array would lose the other findings with it. The
       * markers, their values and their reference ranges are rendered from the
       * deterministic panel either way — this layer is the prose around them, so
       * dropping a sentence costs warmth and never a result.
       */
      const arr = (x: unknown, field: string): string[] => {
        if (!Array.isArray(x)) return [];
        const kept: string[] = [];
        for (const item of x) {
          if (typeof item !== 'string') continue;
          const bad = violations(item);
          if (bad.length) {
            this.logger.warn(`clinical ${field} bullet dropped — ${bad.map((b) => b.why).join('; ')}`);
            continue;
          }
          kept.push(item);
        }
        return kept.slice(0, 8);
      };
      const str = (x: unknown, d: string): string => (typeof x === 'string' && x.trim() ? x : d);
      return {
        // Checked, not trusted. A prompt is a request; this is the guarantee.
        // Anything that drifts falls back to the deterministic text, which
        // costs warmth and never correctness.
        greeting: inVoice(str(p.greeting, '')) ? str(p.greeting, salutation(name)) : salutation(name),
        interpretation: arr(p.interpretation, 'interpretation'),
        relationships: arr(p.relationships, 'relationships'),
        discuss: arr(p.discuss, 'discuss'),
        // The likeliest place for reassurance the numbers do not support.
        encouragement: acceptOrFallback(str(p.encouragement, ''), '', 0),
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

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
   * Read a meal — from a photo, a sentence, or both — into per-item nutrition
   * ESTIMATES for the Food Journal. Same honesty contract as the blood
   * extraction: the AI identifies and estimates, it never measures. Every item
   * carries a confidence, the note says what could not be seen, and the
   * citizen reviews and can adjust every quantity before anything is logged.
   * Returns null when the key is unset or the call fails — the journal then
   * offers manual entry instead of inventing numbers.
   */
  /**
   * READ A MENU OFF A PHOTOGRAPH.
   *
   * The output is a DRAFT and the caller must never store it unreviewed. Prices
   * are the thing people act on, and a model that reads ₹180 as ₹160 has
   * produced a number a business will be held to — so extraction proposes and
   * the owner disposes. `local-services` enforces that; this method only has to
   * be honest about what it saw.
   *
   * Two rules do most of the work here:
   *
   *   · a price it cannot read comes back NULL, not zero. A menu that prints
   *     "seasonal" or a smudged number must not become ₹0 on somebody's card.
   *   · nothing is invented. A photograph of a wall is an empty list with a
   *     note saying so, which is a better answer than a plausible menu.
   *
   * Haiku with vision, 3000 tokens — a menu is long and a truncated one is a
   * menu with the desserts missing. That is roughly a cent a scan, paid once
   * per business rather than once per visitor.
   */
  /**
   * READ A CV THE WAY A RECRUITER READS ONE.
   *
   * The heuristic parser this replaces took the FIRST NON-EMPTY LINE of the
   * extracted text as the headline. On a real CV that line is the person's
   * name, or a phone number, or "CURRICULUM VITAE", or — on a two-column PDF —
   * the first fragment pdf.js happened to emit. Every citizen who uploaded a
   * document got a synopsis that was not about their career, and the matcher
   * scored them on it.
   *
   * This reads the document instead. It PROPOSES: the citizen sees every field
   * before anything is published, the same split the menu reader uses, because
   * a summary of somebody's career is a claim they have to stand behind and a
   * model that misreads "led a team of 4" as "4 years' experience" would put
   * them in front of the wrong jobs.
   *
   * Returns null when there is no client, and the caller falls back to the
   * heuristic rather than refusing the upload. A worse headline beats no
   * profile.
   */
  async readCv(text: string): Promise<{
    fullName: string;
    headline: string; summary: string; currentTitle: string; currentCompany: string;
    experienceYears: number | null; location: string | null;
    skills: string[]; education: string[]; openToRoles: string[];
  } | null> {
    if (!this.client) return null;
    const system =
      'You read a CV and return structured facts about the candidate. ' +
      'Return ONLY JSON: {"fullName":string,"headline":string,"summary":string,"currentTitle":string,"currentCompany":string,' +
      '"experienceYears":number|null,"location":string|null,"skills":string[],"education":string[],"openToRoles":string[]}. ' +
      'fullName: the candidate\'s own name, and nothing else — not a document title, not "Applicant:", not an address. "" if the CV never states it. ' +
      'headline: the role this person IS, in under 70 characters — "Senior backend engineer", not their name and not "Curriculum Vitae". ' +
      'summary: 2-3 sentences a recruiter would read first, in the third person, drawn ONLY from the CV. ' +
      'experienceYears: whole years of professional work, counted from the earliest job. null if the CV does not say enough to count. ' +
      'Never infer a number from a phrase like "led a team of 4". ' +
      'skills: technologies, tools and named competencies, lowercase, at most 30. ' +
      'openToRoles: role titles this person could credibly be hired for, at most 5. ' +
      'INVENT NOTHING. A field the CV does not support is "" or null or []. ' +
      'Do not flatter, do not editorialise, do not add adjectives the CV has not earned.';
    try {
      const out = await this.json<{
        fullName?: unknown;
        headline?: unknown; summary?: unknown; currentTitle?: unknown; currentCompany?: unknown;
        experienceYears?: unknown; location?: unknown;
        skills?: unknown; education?: unknown; openToRoles?: unknown;
      }>(system, text.slice(0, 24_000), null as unknown as Record<string, unknown>, 1400);
      if (!out) return null;
      const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const list = (v: unknown, max: number, each: number) =>
        (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, each)).slice(0, max);
      const yrs = typeof out.experienceYears === 'number' && Number.isFinite(out.experienceYears)
        // Fifty years is a whole working life; anything past it is a
        // misread date, not a candidate.
        ? Math.max(0, Math.min(50, Math.round(out.experienceYears)))
        : null;
      return {
        fullName: str(out.fullName, 90),
        headline: str(out.headline, 90),
        summary: str(out.summary, 900),
        currentTitle: str(out.currentTitle, 90),
        currentCompany: str(out.currentCompany, 90),
        experienceYears: yrs,
        location: str(out.location, 60) || null,
        skills: list(out.skills, 30, 40),
        education: list(out.education, 12, 160),
        openToRoles: list(out.openToRoles, 5, 90),
      };
    } catch {
      return null;
    }
  }

  /**
   * READ A CV INTO ITS ENTRIES — the jobs, the degrees, the things they built.
   *
   * readCv above answers "who is this person"; this answers "what have they
   * done", one row at a time, because a career is a list and the summary of it
   * is not. The two are separate calls rather than one larger one so that a
   * model that runs out of tokens halfway through a filmography still returns a
   * headline and a summary.
   *
   * The rules that matter, and every one of them exists because the opposite
   * behaviour would be a lie told in somebody's name:
   *
   *   · An employer is never invented and never tidied. "Infosys BPM" does not
   *     become "Infosys". A profile that names the wrong company is a claim the
   *     citizen has to answer for in an interview.
   *   · A date that is not on the page comes back "" with confidence 'low', not
   *     a plausible year. "2019–2021" is a fact; "about three years ago" is not.
   *   · A title MAY be expanded, because "Sr. Creative Dir." is an abbreviation
   *     of a real title rather than a different one, and no recruiter searches
   *     for the abbreviation.
   *
   * Sixty entries is a long career with a publication list. Past that the
   * document is being misread — a table of contents, or a page of references —
   * and the cap costs a real person nothing.
   *
   * Returns null when there is no client. The caller keeps whatever it already
   * had; an upload that adds no entries is worse than one that adds none
   * wrongly.
   */
  async readCvEntries(text: string): Promise<{
    entries: Array<{
      kind: string; title: string; organisation: string; qualifier: string; location: string;
      startText: string; endText: string; current: boolean;
      description: string; bullets: string[]; tags: string[]; url: string;
      confidence: 'high' | 'medium' | 'low';
    }>;
  } | null> {
    if (!this.client) return null;
    const kinds = ['experience', 'education', 'project', 'certification', 'award', 'language', 'link'];
    const system =
      'You read a CV and return its entries — every job, degree, project, certificate, award, language and link it lists. ' +
      'Return ONLY JSON: {"entries":[{"kind":string,"title":string,"organisation":string,"qualifier":string,"location":string,' +
      '"startText":string,"endText":string,"current":boolean,"description":string,"bullets":string[],"tags":string[],"url":string,' +
      '"confidence":"high"|"medium"|"low"}]}. ' +
      `kind is exactly one of: ${kinds.join(', ')}. ` +
      'title: the job title, degree, project name, certificate, award or language. ' +
      'organisation: the employer, institution, issuing body or client — EXACTLY as the CV writes it. ' +
      'qualifier: the one extra label that kind needs — employment type for a job, field of study for a degree, ' +
      'credential id for a certificate, proficiency for a language. "" when the CV does not give one. ' +
      'startText and endText: the dates AS WRITTEN — "Mar 2019", "2019", "Spring 2019". Do not reformat them, ' +
      'do not convert them, and do not fill in a month the CV did not print. ' +
      'current: true only where the CV says the role is ongoing ("present", "current", "till date"). ' +
      'description: the entry\'s own prose, at most 3 sentences, in the CV\'s words. ' +
      'bullets: the responsibilities and achievements listed under the entry, one string each, at most 10. ' +
      'tags: skills, technologies or subjects named in that entry, lowercase, at most 12. ' +
      'INVENT NOTHING. Never invent an employer, a date, a degree, a title or an achievement, and never repair one. ' +
      'Never change an organisation name — not its spelling, not its capitalisation, not its legal suffix. ' +
      'You MAY expand an obviously abbreviated job title ("Sr. Creative Dir." to "Senior Creative Director"); ' +
      'you may not promote one, and "Dir." never becomes "Director of Engineering". ' +
      'confidence: "high" when the entry is printed plainly and completely. "medium" when you had to read across a ' +
      'broken layout or a column split to assemble it. "low" when a date is absent or ambiguous, or when you are ' +
      'unsure the entry is one entry — a low row is shown to the citizen as a question, never as a fact. ' +
      'A date you cannot read is "" AND confidence "low". Never guess a year to avoid an empty field. ' +
      'Order the entries as the CV orders them. Omit nothing the CV lists; add nothing it does not.';
    try {
      const out = await this.json<{ entries?: unknown }>(
        system,
        text.slice(0, 24_000),
        null as unknown as { entries?: unknown },
        8000,
      );
      if (!out || !Array.isArray(out.entries)) return null;
      const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const list = (v: unknown, max: number, each: number) =>
        (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, each)).slice(0, max);
      const entries = out.entries.slice(0, 60).flatMap((raw) => {
        const it = raw as Record<string, unknown>;
        const kind = str(it.kind, 30).toLowerCase();
        // A row whose kind we do not recognise cannot be rendered in any
        // section, and a row with neither a name nor an employer is not an
        // entry — it is whatever the layout left behind between two of them.
        if (!kinds.includes(kind)) return [];
        const title = str(it.title, 160);
        const organisation = str(it.organisation, 160);
        if (!title && !organisation) return [];
        const confidence = it.confidence === 'high' || it.confidence === 'medium' ? it.confidence : 'low';
        return [{
          kind,
          title,
          organisation,
          qualifier: str(it.qualifier, 90),
          location: str(it.location, 90),
          startText: str(it.startText, 40),
          endText: str(it.endText, 40),
          current: it.current === true,
          description: str(it.description, 2000),
          bullets: list(it.bullets, 10, 300),
          tags: list(it.tags, 12, 40),
          url: str(it.url, 500),
          confidence: confidence as 'high' | 'medium' | 'low',
        }];
      });
      return { entries };
    } catch {
      return null;
    }
  }

  async extractMenu(
    image: { base64: string; mediaType: string },
  ): Promise<{ items: Array<{ section?: string; name: string; description?: string; priceInr: number | null }>; note: string } | null> {
    if (!this.client) return null;
    const system =
      'You transcribe a photographed restaurant or service menu into structured items. ' +
      'Return ONLY JSON: {"items":[{"section":string,"name":string,"description":string,"priceInr":number|null}],"note":string}. ' +
      'Rules: TRANSCRIBE, never invent — every item must be legible in the image. ' +
      'section is the menu\'s own heading above the item ("Starters", "South Indian"); omit it if the menu has none. ' +
      'priceInr is a whole number of rupees. If the price is unreadable, absent, or says something like "seasonal" or "market price", ' +
      'use null — NEVER 0, and never a guess. Strip currency symbols and any decimal paise. ' +
      'description is the menu\'s own words under the item, if any, up to 140 characters. ' +
      'If the image is not a menu, return {"items":[],"note":"<what it is instead>"}. ' +
      'The note names anything you could not read — a blurred column, a cut-off section — in one or two short sentences, ' +
      'because the person correcting this needs to know where to look.';
    try {
      const res = await this.createWithFallback({
        model: this.model,
        max_tokens: 3000,
        system: `${system}\n\nRespond with ONLY valid JSON — no prose, no markdown fences.`,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: (image.mediaType || 'image/jpeg') as 'image/jpeg', data: image.base64 },
            } as unknown as Anthropic.ContentBlockParam,
            { type: 'text', text: 'Transcribe this menu as JSON.' },
          ],
        }],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const parsed = this.extractJson(text) as { items?: unknown[]; note?: string } | null;
      if (!parsed || !Array.isArray(parsed.items)) return null;
      const items = parsed.items.slice(0, 200).flatMap((raw) => {
        const it = raw as Record<string, unknown>;
        const name = typeof it.name === 'string' ? it.name.trim().slice(0, 90) : '';
        if (!name) return [];
        // A price is a number or it is nothing. Bounded because a misread of a
        // phone number as a price is the failure that produces ₹9,82,110 dosa.
        const p = typeof it.priceInr === 'number' && isFinite(it.priceInr) && it.priceInr > 0 && it.priceInr <= 500000
          ? Math.round(it.priceInr) : null;
        return [{
          ...(typeof it.section === 'string' && it.section.trim() ? { section: it.section.trim().slice(0, 60) } : {}),
          name,
          ...(typeof it.description === 'string' && it.description.trim() ? { description: it.description.trim().slice(0, 140) } : {}),
          priceInr: p,
        }];
      });
      return { items, note: typeof parsed.note === 'string' ? parsed.note.slice(0, 300) : '' };
    } catch (e) {
      this.logger.warn(`menu extraction failed: ${(e as Error).message}`);
      return null;
    }
  }

  async analyzeMeal(
    input: { image?: { base64: string; mediaType: string }; text?: string },
  ): Promise<{ items: Array<{ name: string; qty: number; unit: string; grams?: number; kcal: number; proteinG: number; carbG: number; fatG: number; fibreG?: number; sugarG?: number; sodiumMg?: number; waterMl?: number; confidence: number }>; note: string } | null> {
    if (!this.client) return null;
    if (!input.image && !(input.text ?? '').trim()) return null;
    const system =
      'You are a nutrition estimator for a food journal. Identify every DISTINCT food or drink item actually present ' +
      '(including sides, sauces, garnishes and drinks), estimate the portion in a household measure, and estimate its nutrition. ' +
      'Return ONLY JSON: {"items":[{"name":string,"qty":number,"unit":string,"grams":number,"kcal":number,"proteinG":number,' +
      '"carbG":number,"fatG":number,"fibreG":number,"sugarG":number,"sodiumMg":number,"waterMl":number,"confidence":0..1}],"note":string}. ' +
      'Rules: units are household measures ("roti","bowl","cup","tbsp","piece","ml","g"). Estimates are per the WHOLE stated qty, not per unit. ' +
      'waterMl is the drinking-water contribution (plain water/most of a clear drink; 0 for solid food). ' +
      'Never invent an item that is not clearly present. If the image is not food, return {"items":[],"note":"<why>"}. ' +
      'Confidence below 0.5 means you are guessing at the dish or the portion — say which in the note. Keep the note to two short sentences.';
    try {
      const content: Anthropic.ContentBlockParam[] = [];
      if (input.image) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: (input.image.mediaType || 'image/jpeg') as 'image/jpeg', data: input.image.base64 },
        } as unknown as Anthropic.ContentBlockParam);
      }
      content.push({
        type: 'text',
        text: input.text?.trim()
          ? `Meal to log${input.image ? ' (photo attached; the text is the citizen’s own description)' : ''}: ${input.text.trim().slice(0, 800)}`
          : 'Identify and estimate this meal as JSON.',
      });
      const res = await this.createWithFallback({
        model: this.model,
        max_tokens: 1500,
        system: `${system}\n\nRespond with ONLY valid JSON — no prose, no markdown fences.`,
        messages: [{ role: 'user', content }],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const parsed = this.extractJson(text) as { items?: unknown[]; note?: string } | null;
      if (!parsed || !Array.isArray(parsed.items)) return null;
      const num = (v: unknown, max: number): number => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
      const items = parsed.items.slice(0, 20).flatMap((raw) => {
        const it = raw as Record<string, unknown>;
        const name = typeof it.name === 'string' ? it.name.trim().slice(0, 80) : '';
        if (!name) return [];
        return [{
          name,
          qty: num(it.qty, 50) || 1,
          unit: typeof it.unit === 'string' ? it.unit.trim().slice(0, 20) : 'serving',
          ...(num(it.grams, 5000) ? { grams: Math.round(num(it.grams, 5000)) } : {}),
          kcal: Math.round(num(it.kcal, 5000)),
          proteinG: Math.round(num(it.proteinG, 500)),
          carbG: Math.round(num(it.carbG, 1000)),
          fatG: Math.round(num(it.fatG, 500)),
          ...(num(it.fibreG, 200) ? { fibreG: Math.round(num(it.fibreG, 200)) } : {}),
          ...(num(it.sugarG, 500) ? { sugarG: Math.round(num(it.sugarG, 500)) } : {}),
          ...(num(it.sodiumMg, 20000) ? { sodiumMg: Math.round(num(it.sodiumMg, 20000)) } : {}),
          ...(num(it.waterMl, 3000) ? { waterMl: Math.round(num(it.waterMl, 3000)) } : {}),
          confidence: Math.max(0, Math.min(1, typeof it.confidence === 'number' ? it.confidence : 0.5)),
        }];
      });
      return { items, note: typeof parsed.note === 'string' ? parsed.note.slice(0, 400) : '' };
    } catch (e) {
      this.logger.warn(`Meal analysis failed: ${(e as Error).message}`);
      return null;
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

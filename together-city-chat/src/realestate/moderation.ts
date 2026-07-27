/**
 * Property-listing moderation — deterministic rule checks that run on every
 * submission (with an optional AI text pass layered on top in the service).
 * Each check is hard (→ reject) or soft (→ manual review).
 */

export type CheckSeverity = 'hard' | 'soft';
export interface Check { name: string; pass: boolean; severity: CheckSeverity; detail: string }
export type Decision = 'approved' | 'rejected' | 'review';

export interface ModerationResult {
  decision: Decision;
  confidence: number;       // 0..1
  score: number;            // fraud/risk score 0..100
  checks: Check[];
  reasons: string[];        // human-readable, for the seller
  decidedAt: string;
}

export interface ListingInput {
  title: string; description?: string | null; city: string; locality: string;
  propertyType: string; listingType: string; priceInr: number; areaSqft: number;
  bedrooms: number; bathrooms: number; furnishing?: string | null;
  photos: Array<{ url: string; caption?: string }>;
}

// Photos are OPTIONAL for now (product decision 2026-07-27) — set back to a
// positive number to re-enable the minimum-photo hard check. Keep in sync with
// the Sell UI photo gate — a listing the UI accepts must never be auto-rejected.
const MIN_PHOTOS = 0;
const NEEDS_ROOMS = ['apartment', 'villa', 'house', 'independent-house'];

// Off-platform contact / OCR-style text that must not appear in a listing.
const CONTACT_PATTERNS: Array<[string, RegExp]> = [
  ['a phone number', /(?:\+?\d[\d\s-]{8,}\d)/],
  ['an email address', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['a WhatsApp/Telegram contact', /\b(whats\s?app|w\.?a\.?|telegram|t\.me|tg:)\b/i],
  ['a social handle', /\b(insta(gram)?|@[a-z0-9._]{2,}|facebook|fb\.com|fb\.me)\b/i],
  ['a UPI / payment id', /\b[\w.-]+@(?:okhdfcbank|okaxis|oksbi|okicici|ybl|paytm|upi|apl|ibl)\b/i],
  ['an off-platform link', /\b(?:https?:\/\/|www\.)\S+/i],
];

const BANNED = /\b(escort|xxx|porn|sex|nude|cocaine|heroin|mdma|weed|gun|rifle|pistol|terroris|jihad|isis|nazi|heil hitler)\b/i;
const SCAM = /\b(100% guaranteed|risk[- ]free|wire transfer|advance payment|western union|double your money|no questions asked|token amount to block)\b/i;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w ]/g, '').trim();
const emojiCount = (s: string) => (s.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length;

/** Detect contact info / off-platform routing across all listing text. */
export function contactHits(input: ListingInput): string[] {
  const text = [input.title, input.description ?? '', ...input.photos.map((p) => p.caption ?? '')].join('  ');
  const hits: string[] = [];
  for (const [label, re] of CONTACT_PATTERNS) if (re.test(text)) hits.push(label);
  return hits;
}

/** Deterministic checks. Returns the checks + a base risk score. */
export function ruleChecks(input: ListingInput, opts: {
  duplicateOf?: string | null;
  peerMedianPerSqft?: number | null;
  fraudScore: number;
}): { checks: Check[]; risk: number } {
  const checks: Check[] = [];
  const text = `${input.title} ${input.description ?? ''}`;
  const desc = (input.description ?? '').trim();

  // Required fields
  const missing: string[] = [];
  if (!input.title?.trim()) missing.push('title');
  // Description is optional (the Sell UI treats it as optional) — an empty or short
  // description must not block publication, or UI-created listings never reach Explore.
  if (!input.city?.trim()) missing.push('city');
  if (!input.locality?.trim()) missing.push('locality');
  if (!input.priceInr || input.priceInr <= 0) missing.push('price');
  if (!input.areaSqft || input.areaSqft <= 0) missing.push('area');
  if (NEEDS_ROOMS.includes(input.propertyType) && input.bedrooms <= 0) missing.push('bedrooms');
  checks.push({ name: 'required-fields', pass: missing.length === 0, severity: 'hard', detail: missing.length ? `Missing: ${missing.join(', ')}.` : 'All mandatory fields present.' });

  // Minimum photo count — skipped entirely while MIN_PHOTOS is 0 (photos optional).
  if (MIN_PHOTOS > 0) {
    checks.push({ name: 'min-photos', pass: input.photos.length >= MIN_PHOTOS, severity: 'hard', detail: `${input.photos.length}/${MIN_PHOTOS} photos provided.` });
  }

  // Contact info / off-platform routing (title, description, captions)
  const contacts = contactHits(input);
  checks.push({ name: 'no-contact-info', pass: contacts.length === 0, severity: 'hard', detail: contacts.length ? `Remove ${contacts.join(', ')} — keep contact on Together City.` : 'No off-platform contact found.' });

  // Banned / illegal content
  checks.push({ name: 'safe-content', pass: !BANNED.test(text), severity: 'hard', detail: BANNED.test(text) ? 'Description contains prohibited content.' : 'No prohibited terms.' });

  // Scam / fraud language
  checks.push({ name: 'no-scam-language', pass: !SCAM.test(text), severity: 'soft', detail: SCAM.test(text) ? 'Contains scam-like phrasing — needs a look.' : 'No scam phrasing.' });

  // Spam signals: excessive emojis / keyword stuffing / all-caps
  const emojis = emojiCount(text);
  const words = desc.split(/\s+/).filter(Boolean);
  const uniqRatio = words.length ? new Set(words.map((w) => w.toLowerCase())).size / words.length : 1;
  const capsRatio = desc.length ? (desc.replace(/[^A-Z]/g, '').length / desc.replace(/[^A-Za-z]/g, '').length || 0) : 0;
  const spammy = emojis > 8 || (words.length > 25 && uniqRatio < 0.4) || capsRatio > 0.6;
  checks.push({ name: 'no-spam', pass: !spammy, severity: 'soft', detail: spammy ? 'Looks spammy (emoji/keyword/caps overuse).' : 'Reads clean.' });

  // Duplicate
  checks.push({ name: 'not-duplicate', pass: !opts.duplicateOf, severity: 'soft', detail: opts.duplicateOf ? `Very similar to an existing listing (${opts.duplicateOf}).` : 'No near-duplicate found.' });

  // Pricing outlier vs. nearby peers
  if (opts.peerMedianPerSqft && input.areaSqft > 0) {
    const pps = input.priceInr / input.areaSqft;
    const ratio = pps / opts.peerMedianPerSqft;
    const outlier = ratio < 0.25 || ratio > 4;
    checks.push({ name: 'pricing-sane', pass: !outlier, severity: 'soft', detail: outlier ? `₹${Math.round(pps)}/sqft vs ₹${Math.round(opts.peerMedianPerSqft)}/sqft nearby — verify.` : 'Price in a normal range for the area.' });
  }

  // Fraud score
  checks.push({ name: 'fraud-score', pass: opts.fraudScore < 60, severity: 'soft', detail: `Account risk score ${opts.fraudScore}/100.` });

  const risk = Math.min(100, opts.fraudScore + checks.filter((c) => !c.pass).length * 8);
  return { checks, risk };
}

/** Fold checks (+ optional AI verdict) into a final decision. */
export function decide(checks: Check[], risk: number, ai?: { flagged: boolean; confidence: number; reason?: string }): ModerationResult {
  const failed = checks.filter((c) => !c.pass);
  const hard = failed.filter((c) => c.severity === 'hard');
  const soft = failed.filter((c) => c.severity === 'soft');
  const reasons: string[] = [];

  let decision: Decision;
  if (ai?.flagged && ai.confidence >= 0.75) {
    decision = 'rejected';
    if (ai.reason) reasons.push(ai.reason);
  } else if (hard.length) {
    decision = 'rejected';
  } else if (soft.length || (ai?.flagged && ai.confidence < 0.75) || risk >= 60) {
    decision = 'review';
  } else {
    decision = 'approved';
  }

  for (const c of failed) reasons.push(c.detail);
  if (decision === 'approved') reasons.length = 0;

  // Confidence: high when nothing is borderline; AI lowers it when unsure.
  const base = decision === 'approved' ? 0.9 : hard.length ? 0.95 : 0.6;
  const confidence = ai ? Math.min(base, ai.flagged ? ai.confidence : base) : base;

  return { decision, confidence: Number(confidence.toFixed(2)), score: risk, checks, reasons, decidedAt: '' };
}

export const normalizeDesc = norm;
export const MIN_PHOTOS_REQUIRED = MIN_PHOTOS;

/** Generic text scan reused by dating bio / listing moderation. */
export function scanText(text: string): { contacts: string[]; banned: boolean; scam: boolean; emojis: number } {
  const hits: string[] = [];
  for (const [label, re] of CONTACT_PATTERNS) if (re.test(text)) hits.push(label);
  return { contacts: hits, banned: BANNED.test(text), scam: SCAM.test(text), emojis: emojiCount(text) };
}

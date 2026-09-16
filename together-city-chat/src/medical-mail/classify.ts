import { CATEGORY_LABEL, type Classification, type MedicalCategory } from './medical-mail.constants';

/**
 * ── IS THIS EMAIL MEDICAL, AND WHAT KIND? (owner, 16 Sep) ────────────────────
 *
 * Prisma-free and network-free, so it can be tested on paper. Every signal
 * the owner listed is read here — sender, sender domain, subject, body,
 * attachment name, attachment MIME type, what the vault reader said about the
 * attachments once they were read, and the citizen's own sender rules — and
 * none of them decides alone. Evidence is combined as a noisy-OR: three weak
 * signs add up, one strong one is enough, and a counter-sign (a shipping
 * notice, an unsubscribe footer) pulls the total down rather than vetoing.
 *
 * The citizen's rule outranks everything ("always medical" / "always
 * personal"), and the vault reader's verdict on an attachment outranks every
 * textual guess — a document the model read as a blood panel IS a blood panel
 * whatever the subject line said.
 *
 * The result carries its reasons in plain words, because the page shows them
 * under "Why is this here?" and a classification the citizen cannot read is
 * one they cannot correct.
 */
export interface SenderRule { pattern: string; kind: 'address' | 'domain'; rule: 'medical' | 'personal' }
export interface DocumentVerdict { filename: string; isMedical: boolean; kind: string; sure: boolean }
export interface ClassifyInput {
  from: { addr: string; name: string };
  subject: string;
  text: string;
  attachments: Array<{ filename: string; contentType: string }>;
  rules: SenderRule[];
  /** DMARC/DKIM verdict from the provider: true, false, or null when unknown. */
  authenticated: boolean | null;
  /** What the vault reader said, once the attachments were read. */
  documents?: DocumentVerdict[];
}
export interface Verdict {
  classification: Classification;
  category: MedicalCategory | null;
  confidence: number;
  reasons: string[];
  /** Which rule spoke, if one did. */
  ruled: 'medical' | 'personal' | null;
}

type Sign = { category: MedicalCategory | null; weight: number; reason: string };

/** Known healthcare senders — a domain here is a hospital, lab, pharmacy or
 *  insurer whatever its subject line. Indian first, because the city is. */
const KNOWN_DOMAINS: Array<[string, MedicalCategory]> = [
  ['apollohospitals.com', 'hospital'], ['apollo247.com', 'pharmacy'], ['fortishealthcare.com', 'hospital'],
  ['maxhealthcare.in', 'hospital'], ['manipalhospitals.com', 'hospital'], ['narayanahealth.org', 'hospital'],
  ['medanta.org', 'hospital'], ['aiims.edu', 'hospital'], ['kokilabenhospital.com', 'hospital'],
  ['lilavatihospital.com', 'hospital'], ['hindujahospital.com', 'hospital'], ['tatamemorialcentre.in', 'hospital'],
  ['thyrocare.com', 'laboratory'], ['lalpathlabs.com', 'laboratory'], ['drlalpathlabs.com', 'laboratory'],
  ['metropolisindia.com', 'laboratory'], ['srlworld.com', 'laboratory'], ['agilus.in', 'laboratory'],
  ['redcliffelabs.com', 'laboratory'], ['healthians.com', 'laboratory'], ['1mg.com', 'pharmacy'],
  ['tata1mg.com', 'pharmacy'], ['pharmeasy.in', 'pharmacy'], ['netmeds.com', 'pharmacy'], ['medplusmart.com', 'pharmacy'],
  ['practo.com', 'appointment'], ['medibuddy.in', 'appointment'], ['mfine.co', 'appointment'],
  ['starhealth.in', 'insurance'], ['hdfcergo.com', 'insurance'], ['icicilombard.com', 'insurance'],
  ['nivabupa.com', 'insurance'], ['careinsurance.com', 'insurance'], ['adityabirlacapital.com', 'insurance'],
  ['newindia.co.in', 'insurance'], ['bajajallianz.com', 'insurance'], ['labcorp.com', 'laboratory'], ['questdiagnostics.com', 'laboratory'],
  ['cowin.gov.in', 'vaccination'],
];

/** A word in the sender's domain that says what kind of place it is. */
const DOMAIN_WORDS: Array<[RegExp, MedicalCategory, number]> = [
  [/hospital|hospitals|medcity|medicalcenter|medicalcentre/, 'hospital', 0.7],
  [/pathlab|pathlabs|pathology|diagnostic|diagnostics|labs?\b|laborator/, 'laboratory', 0.7],
  [/radiolog|imaging|scan/, 'radiology', 0.6],
  [/pharm|chemist|medplus|meds\b/, 'pharmacy', 0.6],
  [/insur|assurance|mediclaim|tpa\b/, 'insurance', 0.5],
  [/clinic|clinics|polyclinic|physio|dental|nursing/, 'doctor', 0.6],
  [/health|healthcare|medical|medicare|\bmed\b|medic|care\b/, 'other-medical', 0.45],
];

/** Words in a subject or body, by category. The body is read with a lighter
 *  hand than the subject: a long email mentions a lot of things. */
const TEXT_SIGNS: Array<[RegExp, MedicalCategory, number, string]> = [
  [/\b(blood|lab|laboratory)\s+(test|report|result|panel)s?\b/i, 'blood-test', 0.7, 'mentions a blood test report'],
  [/\b(cbc|complete blood count|ha?emoglobin|hba1c|lipid profile|thyroid|tsh|vitamin ?d|vitamin ?b12|creatinine|fasting (blood )?(sugar|glucose)|liver function|kidney function|lft|kft|rft)\b/i, 'blood-test', 0.6, 'names a blood marker or panel'],
  [/\b(your )?(test )?report is (ready|attached|available)\b/i, 'diagnostic-report', 0.5, 'says a report is ready'],
  [/\b(sample|specimen) (has been )?(collected|collection|received)\b/i, 'laboratory', 0.5, 'is about a lab sample'],
  [/\b(x-?ray|mri|ct[- ]scan|ultrasound|sonography|mammogra|dexa|radiolog|echo(cardiogra)?|ecg|ekg)\b/i, 'radiology', 0.65, 'mentions a scan or imaging study'],
  [/\b(biopsy|histopath|cytolog|pathology report|fnac)\b/i, 'pathology', 0.65, 'mentions a pathology study'],
  [/\b(prescription|prescribed|e-?rx\b|dosage|\d+\s?mg\b|once daily|twice daily|thrice daily|after (food|meals))\b/i, 'prescription', 0.55, 'reads like a prescription'],
  [/\b(pharmacy|chemist|medicines? (order|delivered|dispatched|refill)|refill (reminder|due)|order for your medicines)\b/i, 'pharmacy', 0.55, 'is from or about a pharmacy'],
  [/\b(appointment|consultation)\s+(is\s+)?(confirmed|booked|scheduled|reminder|rescheduled|cancelled)\b/i, 'appointment', 0.6, 'is about an appointment'],
  [/\byour (upcoming )?(appointment|consultation|opd)\b/i, 'appointment', 0.5, 'is about an appointment'],
  [/\b(consultation (summary|notes?)|clinical (summary|notes?)|follow[- ]?up visit|doctor'?s? (note|advice))\b/i, 'doctor', 0.55, 'is a doctor’s note or summary'],
  [/\bdr\.?\s+[A-Z][a-z]+/, 'doctor', 0.3, 'names a doctor'],
  [/\b(discharge summary|admission|admitted|ipd\b|ward\b|surgery|operation theatre|hospitali[sz])/i, 'hospital', 0.6, 'is about a hospital stay'],
  [/\b(claim|cashless|pre-?authori[sz]ation|mediclaim|health insurance|policy (number|no)|tpa\b|sum insured)\b/i, 'insurance', 0.55, 'is about a health insurance claim or policy'],
  [/\b(vaccin|immuni[sz]ation|booster dose|covishield|covaxin|dose \d)/i, 'vaccination', 0.65, 'is about a vaccination'],
  [/\b(health ?check-?up|master health|wellness (package|check))\b/i, 'diagnostic-report', 0.5, 'is about a health check-up'],
  [/\b(diagnos|patient (id|name|no)|uhid|mrn\b|opd\b)/i, 'other-medical', 0.4, 'uses clinical wording'],
];

/** Money words count only beside another medical sign: "invoice" alone is
 *  every shop on the internet. */
const BILL_SIGN = /\b(invoice|bill|receipt|payment (received|due)|amount (due|paid))\b/i;

/** Attachment names that say what they are. */
const FILE_SIGNS: Array<[RegExp, MedicalCategory, number, string]> = [
  [/\b(cbc|blood|lab|lipid|thyroid|hba1c|glucose|pathology|haem|hemo)/i, 'blood-test', 0.6, 'looks like a lab report'],
  [/\b(x-?ray|xray|mri|ct|scan|ultrasound|usg|echo|ecg|dicom)/i, 'radiology', 0.6, 'looks like a scan'],
  [/\b(rx|prescription|presc)/i, 'prescription', 0.65, 'looks like a prescription'],
  [/\b(discharge|admission|ipd)/i, 'hospital', 0.6, 'looks like a hospital record'],
  [/\b(vaccin|immuni|certificate)/i, 'vaccination', 0.45, 'looks like a vaccination record'],
  [/\b(claim|policy|cashless)/i, 'insurance', 0.5, 'looks like an insurance document'],
  [/\b(report|result)/i, 'diagnostic-report', 0.45, 'is named as a report'],
  [/\b(invoice|bill|receipt)/i, 'medical-bill', 0.3, 'is named as a bill'],
];

/** The other direction: things that arrive at every inbox on earth. */
const COUNTER_SIGNS: Array<[RegExp, number, string]> = [
  [/\bunsubscribe\b|\bview (this|in) browser\b|\bnewsletter\b/i, 0.3, 'carries a newsletter footer'],
  [/\b\d{1,2}% off\b|\bflash sale\b|\bcoupon\b|\bpromo code\b|\bdeal of the day\b/i, 0.4, 'is a promotion'],
  [/\byour order (has )?(shipped|been shipped|is on its way|dispatched)\b|\btracking (number|id)\b|\bout for delivery\b/i, 0.5, 'is a shipping notice'],
  [/\bsubscription (renew|payment|receipt)|\bmonthly subscription\b|\bstreaming\b/i, 0.4, 'is a subscription notice'],
  [/\b(one[- ]time password|otp is|verify your (email|account)|reset your password)\b/i, 0.5, 'is an account notice'],
];
const CONSUMER_DOMAINS = /(^|\.)(amazon|flipkart|netflix|myntra|swiggy|zomato|uber|ola|ajio|meesho|spotify|hotstar|primevideo|nykaa|bigbasket|blinkit|zepto|paytm|phonepe|makemytrip|irctc|linkedin|facebook|instagram|twitter|x)\.[a-z.]+$/i;
const FREEMAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|rediffmail|protonmail|proton|zoho)\./i;

const DOC_KIND_TO_CATEGORY: Record<string, MedicalCategory> = {
  'blood-test': 'blood-test', 'urine-test': 'laboratory', 'stool-test': 'laboratory', imaging: 'radiology',
  'heart-test': 'diagnostic-report', 'lung-test': 'diagnostic-report', 'brain-test': 'diagnostic-report',
  'eye-test': 'diagnostic-report', 'bone-joint': 'diagnostic-report', genetic: 'laboratory',
  'womens-health': 'diagnostic-report', 'mens-health': 'diagnostic-report', prescription: 'prescription',
  report: 'diagnostic-report', condition: 'doctor', allergy: 'doctor', vaccination: 'vaccination',
  hospital: 'hospital', note: 'doctor',
};

export const domainOf = (addr: string): string => (addr || '').trim().toLowerCase().split('@')[1] ?? '';

/** Which rule covers this sender: an exact address first, then its domain,
 *  then a parent domain (mail.apollohospitals.com is apollohospitals.com). */
export function ruleFor(addr: string, rules: SenderRule[]): SenderRule | null {
  const a = (addr || '').trim().toLowerCase();
  const d = domainOf(a);
  const exact = rules.find((r) => r.kind === 'address' && r.pattern === a);
  if (exact) return exact;
  const parts = d.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const cand = parts.slice(i).join('.');
    const hit = rules.find((r) => r.kind === 'domain' && r.pattern === cand);
    if (hit) return hit;
  }
  return null;
}

const noisyOr = (weights: number[]): number => 1 - weights.reduce((p, w) => p * (1 - Math.max(0, Math.min(1, w))), 1);

export function classify(input: ClassifyInput): Verdict {
  const signs: Sign[] = [];
  const counters: Array<{ weight: number; reason: string }> = [];
  const addr = (input.from.addr || '').toLowerCase();
  const domain = domainOf(addr);
  const subject = input.subject || '';
  const body = (input.text || '').slice(0, 20_000);

  // 1 · the citizen's own word
  const rule = ruleFor(addr, input.rules);
  if (rule?.rule === 'personal') {
    return { classification: 'personal', category: null, confidence: 1, ruled: 'personal',
      reasons: [`You asked for ${rule.kind === 'domain' ? `everything from ${rule.pattern}` : 'this sender'} to stay in Together City Mail.`] };
  }
  if (rule?.rule === 'medical') {
    signs.push({ category: null, weight: 0.95, reason: `You marked ${rule.kind === 'domain' ? rule.pattern : 'this sender'} as always medical.` });
  }

  // 2 · who sent it
  const known = KNOWN_DOMAINS.find(([d]) => domain === d || domain.endsWith(`.${d}`));
  if (known) signs.push({ category: known[1], weight: 0.85, reason: `The sender ${domain} is a known ${CATEGORY_LABEL[known[1]].toLowerCase()} provider.` });
  else if (domain && !FREEMAIL.test(domain)) {
    for (const [re, cat, w] of DOMAIN_WORDS) {
      if (re.test(domain.replace(/\.[a-z]+$/, ''))) { signs.push({ category: cat, weight: w, reason: `The sender’s domain ${domain} reads as a ${CATEGORY_LABEL[cat].toLowerCase()}.` }); break; }
    }
  }
  const fromName = (input.from.name || '').toLowerCase();
  if (/\b(dr\.?|doctor|clinic|hospital|labs?|diagnostic|pharmacy|pathology)\b/.test(fromName)) {
    signs.push({ category: /hospital/.test(fromName) ? 'hospital' : /lab|diagnostic|patholog/.test(fromName) ? 'laboratory' : /pharm/.test(fromName) ? 'pharmacy' : 'doctor', weight: 0.4, reason: `The sender’s name, “${input.from.name}”, is a clinician or clinic.` });
  }
  if (CONSUMER_DOMAINS.test(domain)) counters.push({ weight: 0.6, reason: `The sender ${domain} is a shop or a service, not a healthcare provider.` });

  // 3 · what it says
  for (const [re, cat, w, why] of TEXT_SIGNS) {
    if (re.test(subject)) signs.push({ category: cat, weight: w, reason: `The subject ${why}.` });
    else if (re.test(body)) signs.push({ category: cat, weight: w * 0.7, reason: `The message ${why}.` });
  }

  // 4 · what is attached
  for (const a of input.attachments) {
    const name = a.filename || '';
    const mime = (a.contentType || '').toLowerCase();
    if (mime === 'application/dicom' || /\.dcm$/i.test(name)) { signs.push({ category: 'radiology', weight: 0.9, reason: `${name} is a DICOM medical image.` }); continue; }
    let hit = false;
    for (const [re, cat, w, why] of FILE_SIGNS) {
      if (re.test(name)) { signs.push({ category: cat, weight: w, reason: `The attachment ${name} ${why}.` }); hit = true; break; }
    }
    if (!hit && (mime === 'application/pdf' || mime.startsWith('image/'))) signs.push({ category: null, weight: 0.15, reason: `${name} is a document that could be a report.` });
  }

  // 5 · what the vault reader said, once the files were read — the strongest word
  for (const d of input.documents ?? []) {
    if (d.isMedical && d.sure && DOC_KIND_TO_CATEGORY[d.kind]) {
      signs.push({ category: DOC_KIND_TO_CATEGORY[d.kind], weight: 0.95, reason: `${d.filename} was read as a ${d.kind.replace('-', ' ')}.` });
    } else if (d.isMedical === false) {
      counters.push({ weight: 0.35, reason: `${d.filename} does not read as a medical document.` });
    }
  }

  // 6 · the money words, only beside something medical
  if ((BILL_SIGN.test(subject) || BILL_SIGN.test(body)) && signs.some((s) => s.category && s.category !== 'medical-bill')) {
    signs.push({ category: 'medical-bill', weight: 0.5, reason: 'It carries a bill for a medical service.' });
  }

  // 7 · the other way
  for (const [re, w, why] of COUNTER_SIGNS) if (re.test(subject) || re.test(body)) counters.push({ weight: w, reason: `It ${why}.` });

  let score = noisyOr(signs.map((s) => s.weight));
  const against = noisyOr(counters.map((c) => c.weight));
  score = Math.max(0, score * (1 - against * 0.8));
  const reasons = [...signs.map((s) => s.reason), ...counters.map((c) => c.reason)];

  // 8 · did the sender prove they are the sender
  if (input.authenticated === false) {
    score = Math.min(score, 0.55);
    reasons.push('The sender could not be verified (DMARC failed), so this is held for you to look at.');
  }

  // the category: the heaviest evidence wins; a rule alone is "other medical"
  const byCat = new Map<MedicalCategory, number[]>();
  for (const s of signs) if (s.category) byCat.set(s.category, [...(byCat.get(s.category) ?? []), s.weight]);
  let category: MedicalCategory | null = null; let best = 0;
  for (const [cat, ws] of byCat) { const v = noisyOr(ws); if (v > best) { best = v; category = cat; } }

  const confidence = +score.toFixed(2);
  if (rule?.rule === 'medical') return { classification: 'medical', category: category ?? 'other-medical', confidence: Math.max(confidence, 0.95), reasons, ruled: 'medical' };
  if (score >= 0.7) return { classification: 'medical', category: category ?? 'other-medical', confidence, reasons, ruled: null };
  if (score >= 0.4) return { classification: 'likely-medical', category: category ?? 'other-medical', confidence, reasons, ruled: null };
  if (score < 0.15 && against >= 0.5) return { classification: 'personal', category: null, confidence, reasons: reasons.length ? reasons : ['Nothing in it reads as medical.'], ruled: null };
  return { classification: 'unknown', category: category, confidence, reasons: reasons.length ? reasons : ['Nothing in it reads as medical yet — open it and tell us where it belongs.'], ruled: null };
}

/** "Why is this here?" — the reasons as one readable paragraph. */
export const explain = (v: Pick<Verdict, 'classification' | 'category' | 'reasons'>): string => {
  const head = v.classification === 'medical' ? `Classified as ${v.category ? CATEGORY_LABEL[v.category] : 'medical'}`
    : v.classification === 'likely-medical' ? `Probably ${v.category ? CATEGORY_LABEL[v.category].toLowerCase() : 'medical'}`
    : v.classification === 'personal' ? 'Looks personal, not medical'
    : 'Not sure what this is';
  return `${head}: ${v.reasons.join(' ')}`.trim();
};

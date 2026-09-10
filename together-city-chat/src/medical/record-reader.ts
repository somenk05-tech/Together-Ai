/**
 * ── THE VAULT FILES ITSELF (owner, 10 Sep) ──────────────────────────────────
 *
 * "Make the medical upload folder as simple as the drive, sort the medical
 * data automatically in the backend … don't ask the user what report they are
 * uploading unless you are confused — if confused, ask the user to tag it."
 *
 * So a document arrives with no category, the model reads it and names one,
 * and the only question a citizen is ever asked is the one the model could not
 * answer. This file holds the pure half of that: the category list, the
 * prompts, and the checks that decide whether a reading is sure enough to file
 * on its own. The service does the I/O.
 */

/** Every folder a record can live in. The web page's KINDS carries the same
 *  keys with a label and an icon; a spec on each side holds them together. */
export const RECORD_KINDS = [
  'blood-test', 'urine-test', 'stool-test', 'imaging', 'heart-test', 'lung-test', 'brain-test',
  'eye-test', 'bone-joint', 'genetic', 'womens-health', 'mens-health', 'prescription', 'report',
  'condition', 'allergy', 'vaccination', 'hospital', 'note',
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** The folder a document waits in while the citizen is asked what it is. */
export const UNSORTED = 'unsorted';

/** Below this the model is guessing, and a guess filed as a fact is how a
 *  prescription ends up read as a lab result. Ask instead. */
export const SURE_ENOUGH = 0.6;

export const isRecordKind = (k: unknown): k is RecordKind =>
  typeof k === 'string' && (RECORD_KINDS as readonly string[]).includes(k);

export const READ_SYSTEM = [
  'You read ONE medical document a person uploaded to their private health vault, and file it.',
  'Return ONLY JSON: {"isMedical":boolean,"kind":string,"confidence":number,"title":string,"patientName":string|null,"date":string|null,"source":string|null,"summary":string,"findings":[{"name":string,"value":string|null,"flag":"high"|"low"|"abnormal"|"normal"|null}]}',
  `kind is exactly one of: ${RECORD_KINDS.join(', ')} — or "unsure".`,
  'blood-test = any lab panel run on blood (CBC, lipids, HbA1c, glucose, thyroid, liver, kidney, vitamins, hormones). A lab report mixing blood and urine results is blood-test.',
  'imaging = X-ray, ultrasound, CT, MRI, mammogram, DEXA reports. heart-test = ECG, echo, TMT, Holter. lung-test = spirometry/PFT. brain-test = EEG, nerve studies. eye-test = eye examinations and spectacle prescriptions.',
  'prescription = medicines prescribed by a doctor. hospital = admission or discharge summaries and hospital bills. note = a doctor\'s consultation notes. report = any other medical report that fits none of the above. vaccination = vaccine certificates or records.',
  'If you cannot tell which kind with reasonable certainty, use "unsure" — the person will be asked. Never guess. If the file is not a medical document at all, set isMedical false and kind "unsure".',
  'confidence: 0 to 1, how sure you are of kind.',
  'title: the name of the test or document as printed on it — the panel or test name the lab gives it, e.g. "Aarogyam C Pro", "Lipid profile", "Fasting blood sugar", "Chest X-ray", "Prescription — Dr. Rao". 60 characters at most. Never include the person\'s name.',
  'patientName: the name of the person the document is about, exactly as printed on it (without Mr/Mrs/Dr); null if no name is printed.',
  'date: the day the sample was collected, the study performed or the document issued, as YYYY-MM-DD, only if it is printed; otherwise null.',
  'source: the lab, hospital or doctor exactly as printed; otherwise null.',
  'summary: one plain sentence saying what the document is and what it covers. Do not diagnose.',
  'findings: at most 25 — each result, medicine or impression exactly as printed: the test name, the value WITH the unit as printed, and flag only when the report marks it or its own printed reference range makes it unambiguous. For a prescription, each medicine with its dose and frequency as the value. For imaging, the impression lines as names with value null.',
  'Never invent, round or convert a number. Never add a finding that is not printed on the document.',
].join('\n');

export const READ_ASK = 'File this medical document as JSON.';

export interface Finding { name: string; value: string | null; flag: 'high' | 'low' | 'abnormal' | 'normal' | null }
export interface Reading {
  isMedical: boolean;
  kind: RecordKind | typeof UNSORTED;
  /** True only when the model named a real folder and was sure of it. */
  sure: boolean;
  title: string | null;
  /** The name printed on the document — checked against the account's name
   *  (owner, 10 Sep) and shown on the file row beside the date. */
  patientName: string | null;
  date: string | null;
  source: string | null;
  summary: string | null;
  findings: Finding[];
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/**
 * Whatever came back, a Reading — and one that can only be `sure` when every
 * condition for filing without asking holds: a medical document, a real
 * folder, and confidence at or above SURE_ENOUGH. Anything else is unsorted.
 */
export function cleanReading(raw: unknown, today: string): Reading {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const isMedical = r.isMedical !== false;
  const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : 0;
  const named = isRecordKind(r.kind) ? r.kind : null;
  const sure = Boolean(raw) && isMedical && named !== null && confidence >= SURE_ENOUGH;
  const date = str(r.date, 10);
  const findings: Finding[] = Array.isArray(r.findings)
    ? (r.findings as unknown[]).slice(0, 25).flatMap((f) => {
        const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
        const name = str(o.name, 120);
        if (!name) return [];
        const flag = (['high', 'low', 'abnormal', 'normal'] as const).find((x) => x === o.flag) ?? null;
        return [{ name, value: str(o.value, 120), flag }];
      })
    : [];
  return {
    isMedical,
    kind: sure && named ? named : UNSORTED,
    sure,
    title: str(r.title, 60),
    patientName: str(r.patientName, 120),
    // A date only when it is a real calendar day that has already happened —
    // a misread "2062" would otherwise sort to the top of the vault for ever.
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && date <= today ? date : null,
    source: str(r.source, 120),
    summary: str(r.summary, 300),
    findings,
  };
}

/**
 * The record's `detail`, written from a reading: the summary on the first
 * line, then one "• " line per finding. Plain text on purpose — it is what the
 * citizen reads under the file, and it is what the history read is written
 * from, so the two can never describe the same document differently.
 */
export function readingDetail(r: Reading): string {
  const head = [r.summary, r.source ? `Source: ${r.source}.` : null].filter(Boolean).join(' ');
  const lines = r.findings.map((f) => `• ${f.name}${f.value ? ` — ${f.value}` : ''}${f.flag && f.flag !== 'normal' ? ` (${f.flag})` : ''}`);
  return [nameLine(r.patientName), head, ...lines].filter(Boolean).join('\n').slice(0, 4000);
}

// ─────────────── whose report it is (owner, 10 Sep) ───────────────
/**
 * "If there is a mismatch in the name spelling in the test, double confirm
 * with the user if it's their own blood test; if there is a complete change in
 * name, reject the blood test mentioning name mismatch."
 *
 * The name printed on a document is kept as the FIRST line of its detail, so
 * the file row can show it beside the date and the vault can tell a document
 * it has read from one it has not. The line always exists on a read document —
 * "not printed" when there was none — which is what `wasRead` looks for.
 */
const NAME_LINE = 'Name on the report: ';
const NOT_PRINTED = 'not printed';
export const nameLine = (name: string | null): string => `${NAME_LINE}${name ?? NOT_PRINTED}`;
export const wasRead = (detail: string | null): boolean => (detail ?? '').startsWith(NAME_LINE);
export function nameOnReport(detail: string | null): string | null {
  if (!wasRead(detail)) return null;
  const v = (detail ?? '').split('\n')[0].slice(NAME_LINE.length).trim();
  return v && v !== NOT_PRINTED ? v : null;
}
/** The detail without its name line — what the history read is written from,
 *  so no one's name is sent with the whole record. */
export const withoutName = (detail: string | null): string | null =>
  wasRead(detail) ? (detail ?? '').split('\n').slice(1).join('\n') || null : detail;

/** A document held until the citizen says it is theirs; the folder it will go
 *  to rides after the prefix. */
export const CONFIRM = 'confirm:';
export const isHeld = (kind: string): boolean => kind.startsWith(CONFIRM);
export const heldFor = (kind: string): string => kind.slice(CONFIRM.length) || UNSORTED;

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'mstr', 'master', 'dr', 'smt', 'shri', 'sri', 'shrimati', 'kum', 'kumari', 'baby', 'mx', 'prof']);
export function nameTokens(name: string | null | undefined): string[] {
  const cut = (name ?? '').toLowerCase().split(/\b[sdwc]\s*\/\s*o\b/)[0]; // "S/O …" names somebody else
  return cut.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter((t) => t && !HONORIFICS.has(t));
}
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
/** The same name spelled differently, or cut to its initial. */
function alike(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0];
  if (Math.min(a.length, b.length) < 3) return false;
  return distance(a, b) <= (Math.max(a.length, b.length) >= 6 ? 2 : 1);
}

export type NameVerdict = 'match' | 'close' | 'different' | 'unknown';
/**
 * match     — every word of the account's name is printed, or the report
 *             prints a shorter form that still carries the first name.
 * close     — the first name is there but spelled differently or cut to an
 *             initial, or only the surname matches → ask "is this yours?"
 * different — nothing of the first name on the report → reject.
 * unknown   — no name printed, or no name on the account → nothing to check.
 */
export function compareNames(onReport: string | null, account: string | null): NameVerdict {
  const r = nameTokens(onReport);
  const a = nameTokens(account);
  if (!r.length || !a.length) return 'unknown';
  if (a.every((t) => r.includes(t))) return 'match';
  if (r.every((t) => a.includes(t)) && r.includes(a[0])) return 'match';
  if (r.some((t) => alike(t, a[0]))) return 'close';
  if (r.every((t) => a.includes(t))) return 'close';
  return 'different';
}

// ─────────────── the whole history, read once ───────────────

export const HISTORY_SYSTEM = [
  'You write a plain-language overview of ONE person\'s own medical records, for that person.',
  'It is educational and is not a diagnosis. Use ONLY the facts in the records you are given — never invent a value, a date, a test or a condition, and never recommend a medicine or a dose.',
  'Every time you mention a result, say which document and date it came from, using the numbers exactly as written.',
  'Return ONLY JSON: {"overview":string,"areas":[{"area":string,"status":"attention"|"watch"|"good"|"unclear","summary":string,"evidence":[string]}],"changes":[string],"discuss":[string],"gaps":[string]}',
  'overview: 2 to 4 sentences on the whole record — what it covers, from when to when, and what stands out.',
  'areas: one per body system or topic the records actually cover (for example Blood sugar, Cholesterol & heart, Thyroid, Kidneys, Liver, Blood count, Vitamins, Medicines, Imaging). status attention = out of range on the latest result; watch = borderline or moving the wrong way; good = in range; unclear = not enough to say. Most important first. At most 10.',
  'changes: how results moved between dated documents, only where the same test appears more than once.',
  'discuss: short points worth raising with a doctor, drawn from the records.',
  'gaps: tests that are old or missing given what the records show, phrased as questions for a doctor, never as instructions. Empty if nothing is clearly missing.',
  'Warm, clear, no jargon without a plain explanation. Do not address the person by name.',
].join('\n');

export interface HistoryArea { area: string; status: 'attention' | 'watch' | 'good' | 'unclear'; summary: string; evidence: string[] }
export interface HistoryRead { overview: string; areas: HistoryArea[]; changes: string[]; discuss: string[]; gaps: string[] }

const strs = (v: unknown, n: number, max = 400): string[] =>
  Array.isArray(v) ? (v as unknown[]).map((x) => str(x, max)).filter((x): x is string => Boolean(x)).slice(0, n) : [];

/** A model answer made safe to store and render — or null when it is not an
 *  answer, so nothing that is not the model's reading is ever kept as one. */
export function cleanHistory(raw: unknown): HistoryRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const overview = str(r.overview, 1200);
  if (!overview) return null;
  const areas: HistoryArea[] = Array.isArray(r.areas)
    ? (r.areas as unknown[]).slice(0, 10).flatMap((a) => {
        const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
        const area = str(o.area, 60);
        const summary = str(o.summary, 600);
        if (!area || !summary) return [];
        const status = (['attention', 'watch', 'good', 'unclear'] as const).find((x) => x === o.status) ?? 'unclear';
        return [{ area, status, summary, evidence: strs(o.evidence, 6, 300) }];
      })
    : [];
  return { overview, areas, changes: strs(r.changes, 8), discuss: strs(r.discuss, 8), gaps: strs(r.gaps, 6) };
}

export interface HistoryDoc { kind: string; title: string; date: string; detail: string | null }
export interface HistoryPanel { takenOn: string; lab: string | null; markers: { label: string; value: number; unit: string; range: string; status: string }[] }

/**
 * The user turn the history is written from. It is ALSO the fingerprint: every
 * input the read depends on ends up in this text, so a new upload, a delete, a
 * re-tag or a corrected panel changes the text and the next read is written
 * fresh — and nothing else does. No TTL (owner rule, 5 Sep).
 */
export function historyPrompt(docs: HistoryDoc[], panels: HistoryPanel[], label: (k: string) => string): string {
  const d = docs.map((x, i) => [
    `#${i + 1} [${label(x.kind)}] ${x.title} · ${x.date}`,
    ...(x.detail ? x.detail.split('\n').map((l) => `   ${l}`) : []),
  ].join('\n'));
  const p = panels.map((x) => [
    `Blood panel · ${x.takenOn}${x.lab ? ` · ${x.lab}` : ''}`,
    ...x.markers.map((m) => `   - ${m.label}: ${m.value} ${m.unit} (reference ${m.range}) → ${m.status}`),
  ].join('\n'));
  return [
    `Documents in the vault (${docs.length}), newest first:`,
    d.join('\n') || '(none)',
    '',
    `Blood panels read from those documents, checked against reference ranges (${panels.length}):`,
    p.join('\n') || '(none)',
  ].join('\n').slice(0, 58000);
}

/** The folder names a citizen reads — the same words as the web page's KINDS. */
export const KIND_LABEL: Record<RecordKind | typeof UNSORTED, string> = {
  'blood-test': 'Blood Tests', 'urine-test': 'Urine Tests', 'stool-test': 'Stool Tests', imaging: 'Scans & Imaging',
  'heart-test': 'Heart Tests', 'lung-test': 'Lung Tests', 'brain-test': 'Brain Tests', 'eye-test': 'Eye Tests',
  'bone-joint': 'Bone & Joint Tests', genetic: 'Genetic Tests', 'womens-health': "Women's Health", 'mens-health': "Men's Health",
  prescription: 'Prescriptions', report: 'Medical Reports', condition: 'Medical Conditions', allergy: 'Allergies',
  vaccination: 'Vaccinations', hospital: 'Hospital Records', note: 'Doctor Notes', [UNSORTED]: 'Not yet tagged',
};
export const kindLabel = (k: string): string => (KIND_LABEL as Record<string, string>)[k] ?? k;

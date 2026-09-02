import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { swallow } from '../shared/swallow';
import { MasterProfileService, computeAge } from './master-profile.service';
import { parseHiddenHubs, DESIGNABLE_HUBS } from './design-your-services';

/**
 * EVERY PLACE THE CITY HOLDS YOU, READ IN ONE REQUEST.
 *
 * The Master Profile page has always been able to say WHAT it owns. It has
 * never been able to say what anything else owns — so a citizen asking the
 * only reasonable question about a fourteen-hub city ("what do you actually
 * have on me?") had to open fourteen pages and read fourteen forms, and the
 * one page named after their record could not answer it.
 *
 * This is that answer, as one panel per store, each carrying the fields that
 * store actually holds with the values actually in them.
 *
 * THREE RULES, AND THEY ARE WHY THIS FILE IS NOT A DASHBOARD.
 *
 * 1. EVERY FIELD SAYS WHO OWNS IT. `source: 'master'` means the value
 *    descends from the Master Profile — the propagation in
 *    master-profile.service.ts put it there and editing it here would be
 *    editing a copy. `source: 'hub'` means the hub is the only writer. The
 *    page renders the two differently, which is the whole point: the record
 *    is visibly the source, field by field, rather than in a sentence at the
 *    top claiming to be.
 *
 * 2. A DEFAULT IS NOT AN ANSWER. Registration creates FoodPref,
 *    FitnessProfile and BeautyProfile with column defaults that read exactly
 *    like answers — "everything", "maintain", "beginner", "normal". Those
 *    rows are reported as UNANSWERED (`started: false`) and their defaulted
 *    columns are not printed as the citizen's own. `answeredAt` is the only
 *    thing that can tell them apart, so it is what is checked.
 *
 * 3. NOTHING IS INVENTED AND NOTHING IS HIDDEN. A field nobody has filled in
 *    comes back `null` and prints as a blank rule, never as a plausible
 *    value. And the free-form `extras` blobs each hub keeps are walked and
 *    returned as `extra` rows rather than summarised away — if a hub stored
 *    it, this page shows it.
 *
 * READ-ONLY, DELIBERATELY. There is no PATCH here and there should not be.
 * A field is owned by exactly one place (see MasterProfile.tsx's note); a
 * second editor for a hub's fields, on the page whose entire job is to end
 * duplicate copies, would be the defect wearing the fix's clothes. Every
 * panel carries the door to the hub that does own the editing.
 */

/** One row inside a panel. `value === null` means nothing is recorded. */
export interface CityProfileField {
  label: string;
  value: string | null;
  /** 'master' — descends from the Master Profile record and is read-only in
   *  the hub too. 'hub' — the hub is the only writer. */
  source: 'master' | 'hub';
  hint?: string;
}

/** One store the city keeps about this citizen. */
export interface CityProfilePanel {
  key: string;
  label: string;
  /** The three-letter mark the passport's visa pages use. */
  code: string;
  /** One line saying what this store is for. */
  blurb: string;
  /** Where the citizen edits it. */
  href: string;
  editLabel: string;
  /** False when nothing has ever been answered here — an empty page, not a
   *  broken one. */
  started: boolean;
  /** What the store says in a line, when it has anything to say. */
  summary: string | null;
  /** From /profile/completion, for the stores that report one. */
  percent: number | null;
  /** Column-backed fields, curated and labelled. */
  fields: CityProfileField[];
  /** Whatever else the hub put in its own JSON blob — walked, never
   *  summarised away. Empty for stores that keep no blob. */
  extra: CityProfileField[];
  /** Countable things rather than fields: photographs, records, pets. */
  counts: { label: string; value: number }[];
}

export interface CityProfilesView {
  /** Every field on the Master Profile that some other store reads. Named
   *  here so the page can say what "the source" actually means. */
  mastered: { label: string; value: string | null; readBy: string[] }[];
  panels: CityProfilePanel[];
  /** How many of the panels have ever been answered. */
  startedCount: number;
}

/* ── the small honest formatters ────────────────────────────────────────── */

const trimmed = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const num = (v: unknown, unit = ''): string | null =>
  v === null || v === undefined || v === '' ? null : `${v}${unit}`;

/** A csv column as a readable list. '' means nobody has answered. */
const csv = (v: unknown): string | null => {
  const s = trimmed(v);
  if (!s) return null;
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

const iso = (d: unknown): string | null => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
};

const yesNo = (v: unknown): string | null =>
  v === true ? 'Yes' : v === false ? 'No' : null;

const json = (s: unknown): Record<string, unknown> => {
  try {
    const parsed = typeof s === 'string' && s ? (JSON.parse(s) as unknown) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>) : {};
  } catch { return {}; }
};

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A column that holds a JSON ARRAY, read without pretending a bad one is empty
 *  data — a parse failure and an empty list both come back as `[]`, and neither
 *  is ever printed as a value. */
const jsonArr = (s: unknown): unknown[] => {
  try {
    const parsed = typeof s === 'string' && s ? (JSON.parse(s) as unknown) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

/**
 * A stored key as a human label. `skinGoals` → `Skin goals`.
 *
 * The blobs are the hubs' own vocabulary and there are dozens of keys across
 * six of them; a hand-written table would be a table that goes stale the next
 * time a hub adds a question, and a key silently missing from it is a field
 * this page claims not to hold. Derived, so a new key appears the day it is
 * first written.
 */
export function humanKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * A stored value as a readable line, whatever shape it is in.
 *
 * Returns null for anything with nothing in it — an empty array and an empty
 * string are both "not answered", and a page that printed "[]" would be
 * showing the citizen the storage rather than the answer. Objects and long
 * lists are counted rather than dumped: the panel is a record, not a console.
 */
export function humanValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return trimmed(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    const flat = v.filter((x) => typeof x === 'string' || typeof x === 'number');
    if (flat.length === v.length) {
      return flat.length > 12 ? `${flat.slice(0, 12).join(', ')} … (${flat.length} in all)` : flat.join(', ');
    }
    return `${v.length} recorded`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>);
    return keys.length ? `${keys.length} setting${keys.length > 1 ? 's' : ''} recorded` : null;
  }
  return null;
}

/**
 * The blob, as rows.
 *
 * `skip` takes the keys already printed as proper fields above it — a value
 * shown twice on one panel is the duplication this whole page exists to
 * argue against, one screen further along.
 */
export function extrasRows(blob: Record<string, unknown>, skip: string[] = []): CityProfileField[] {
  const hidden = new Set(skip);
  return Object.keys(blob)
    .filter((k) => !hidden.has(k))
    .sort()
    .map((k) => ({ label: humanKey(k), value: humanValue(blob[k]), source: 'hub' as const }))
    .filter((f) => f.value !== null);
}

/** Rows a citizen has actually answered, for the "started" test. */
const anyAnswered = (fields: CityProfileField[]) => fields.some((f) => f.value !== null);

/* ── the rows each store is read into ───────────────────────────────────── */

interface Rows {
  master: Record<string, unknown> | null;
  astro: Record<string, unknown> | null;
  beauty: Record<string, unknown> | null;
  fitness: Record<string, unknown> | null;
  food: Record<string, unknown> | null;
  dating: Record<string, unknown> | null;
  jobs: Record<string, unknown> | null;
  user: Record<string, unknown> | null;
  wallet: Record<string, unknown> | null;
  mail: Record<string, unknown> | null;
  pets: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  privacy: Record<string, unknown>[];
  counts: {
    medicalRecords: number; bloodTests: number; medicines: number;
    posts: number; followers: number; following: number; connections: number;
    mealPlans: number; workouts: number; petPhotos: number;
  };
  percentByKey: Record<string, number>;
}

const answered = (row: Record<string, unknown> | null): boolean =>
  Boolean(row && (row as { answeredAt?: Date | null }).answeredAt);

/**
 * THE PANELS. Pure — given rows, always the same answer, so it can be tested
 * without a database and cannot drift from what the tests pin.
 */
export function buildPanels(rows: Rows): CityProfilesView {
  const m = rows.master ?? {};
  const pct = (k: string): number | null =>
    rows.percentByKey[k] === undefined ? null : rows.percentByKey[k];

  const panels: CityProfilePanel[] = [];

  /* ── Astrology ─────────────────────────────────────────────────────────
     Every field on this row is propagated FROM the master (see
     propagationPlan().astro). The hub owns the resolved coordinates and the
     consultation counter and nothing else — which is exactly what a citizen
     should be able to see, rather than being told "entered once" and having
     to take it on faith. */
  {
    const a = rows.astro;
    const fields: CityProfileField[] = [
      /* THE RECORD FIRST, THE HUB ONLY AS A FALLBACK — and the order is the
         whole point rather than a style choice. Written the other way round
         (and it was, for one afternoon) the panel says "from your record"
         over the top of the ASTRO ROW'S copy, so a propagation that has not
         run yet is displayed as the record's own answer. A page arguing for
         one source of truth, quietly showing a stale duplicate, is worse than
         no page. The fallback survives for a citizen whose master row predates
         the consolidation; it is not the value this panel is about. */
      { label: 'Birth date', value: iso(m.dateOfBirth ?? a?.birthDate), source: 'master' },
      { label: 'Birth time', value: trimmed(m.timeOfBirth ?? a?.birthTime), source: 'master', hint: 'Blank means a Sun-sign chart rather than a full one.' },
      { label: 'Birth city', value: trimmed(m.birthCity ?? a?.birthCity), source: 'master' },
      { label: 'Birth state / region', value: trimmed(m.birthState ?? a?.birthState), source: 'master' },
      { label: 'Birth country', value: trimmed(m.birthCountry ?? a?.birthCountry), source: 'master' },
      { label: 'Time zone at birth', value: trimmed(m.timeZone ?? a?.timeZone), source: 'master' },
      { label: 'Resolved coordinates', value: a?.lat != null && a?.lng != null ? `${Number(a.lat).toFixed(2)}, ${Number(a.lng).toFixed(2)}` : null, source: 'hub', hint: 'Looked up from the birth city — approximate by design.' },
      { label: 'Consultations taken', value: a?.questionsAsked != null ? String(a.questionsAsked) : null, source: 'hub' },
    ];
    panels.push({
      key: 'astrology', label: 'Astrology profile', code: 'SKY',
      blurb: 'Birth details, entered once — the chart, the horoscopes and every compatibility score read from here.',
      href: '/profile/astrology', editLabel: 'Astrology profile',
      started: Boolean(a),
      summary: a ? [iso(a.birthDate), trimmed(a.birthCity)].filter(Boolean).join(' · ') || null : null,
      percent: pct('astrology'), fields, extra: [], counts: [],
    });
  }

  /* ── Beauty ────────────────────────────────────────────────────────────
     Nothing propagates here — Beauty asks its own questions and owns all of
     them (see gender-is-not-beautys.spec.ts, which is the argument for why).
     So every row on this panel is `hub`, and saying so is more honest than a
     page that implies the master feeds everything. */
  {
    const b = rows.beauty;
    const ex = json(b?.extras);
    const on = answered(b);
    const printed = ['skinType', 'hairType', 'skinTone', 'undertone', 'allergies', 'medicalConditions', 'budget', 'monthlyBudget', 'bag'];
    const fields: CityProfileField[] = [
      { label: 'Skin type', value: on ? trimmed(b?.skinType) : null, source: 'hub' },
      { label: 'Hair type', value: on ? trimmed(b?.hairType) : null, source: 'hub' },
      { label: 'Skin tone', value: humanValue(ex.skinTone), source: 'hub' },
      { label: 'Undertone', value: humanValue(ex.undertone), source: 'hub' },
      { label: 'Concerns', value: on ? csv(b?.concerns) : null, source: 'hub' },
      { label: 'Allergies', value: humanValue(ex.allergies), source: 'hub' },
      { label: 'Medical conditions declared here', value: humanValue(ex.medicalConditions), source: 'hub' },
      { label: 'Monthly budget', value: humanValue(ex.monthlyBudget ?? ex.budget), source: 'hub' },
      { label: 'Assessment saved', value: iso(b?.analyzedAt), source: 'hub', hint: 'Nothing is re-analysed until you save a new one.' },
    ];
    const photos = jsonArr(b?.photosJson);
    const progress = jsonArr(b?.progressJson);
    panels.push({
      key: 'beauty', label: 'Skin & hair profile', code: 'BTY',
      blurb: 'Photos, the saved assessment and the goals your routine is built from.',
      href: '/beauty/profile', editLabel: 'Skin & hair profile',
      started: on || photos.length > 0,
      summary: on ? `Skin: ${b?.skinType} · Hair: ${b?.hairType}` : null,
      percent: pct('beauty'), fields,
      extra: extrasRows(ex, printed),
      counts: [
        { label: 'Photographs assessed', value: photos.length },
        { label: 'Progress entries', value: progress.length },
      ],
    });
  }

  /* ── Fitness ───────────────────────────────────────────────────────────
     Height, weight, sex and age arrive from the master; the training answers
     are the hub's own. The two are mixed on one row in the database and are
     deliberately NOT mixed on this panel. */
  {
    const f = rows.fitness;
    const on = answered(f);
    const fields: CityProfileField[] = [
      { label: 'Height', value: num(m.heightCm ?? f?.heightCm, ' cm'), source: 'master' },
      { label: 'Weight', value: num(m.weightKg ?? f?.weightKg, ' kg'), source: 'master' },
      { label: 'Age', value: num(computeAge((m.dateOfBirth as Date | null) ?? null) ?? (on ? f?.age : null)), source: 'master' },
      { label: 'Sex used for the maths', value: trimmed(m.sexAtBirth ?? (on ? f?.sex : null)), source: 'master', hint: 'The clinical answer, never the social one.' },
      { label: 'Ability level', value: on ? trimmed(f?.level) : null, source: 'hub', hint: 'Sets training days a week and the intensity ceiling.' },
      { label: 'Training style', value: on ? trimmed(f?.mode) : null, source: 'hub' },
      { label: 'Goal', value: on ? trimmed(f?.goal) : null, source: 'hub' },
      { label: 'Body goal', value: on ? trimmed(f?.bodyGoal) : null, source: 'hub' },
      { label: 'Conditions declared here', value: csv(f?.conditions), source: 'hub' },
      { label: 'Equipment', value: csv(f?.equipment), source: 'hub', hint: 'Blank means we never asked — not that you have none.' },
      { label: 'Days a week', value: num(f?.daysPerWeek), source: 'hub' },
    ];
    panels.push({
      key: 'fitness', label: 'Training profile', code: 'FIT',
      blurb: 'Age, level, style and body goal — what every session and plan is built against.',
      href: '/fitness/profile', editLabel: 'Training profile',
      started: on,
      summary: on ? `${String(f?.level)} · goal: ${String(f?.goal)}` : null,
      percent: pct('fitness'), fields, extra: [],
      counts: [{ label: 'Workouts logged', value: rows.counts.workouts }],
    });
  }

  /* ── Nutrition ─────────────────────────────────────────────────────────
     The row the master feeds most heavily — height, weight, sex, age, diet
     and the activity multiplier all descend from it. `activity` is stored as
     a float because the engine multiplies by it; the citizen's answer is a
     word, and the word is on the master. */
  {
    const p = rows.food;
    const on = answered(p);
    const ex = json(p?.extras);
    const printed = ['cuisines', 'allergies', 'excluded', 'excludedFoods', 'budget', 'maxCookTime', 'conditions'];
    const fields: CityProfileField[] = [
      { label: 'Diet', value: on ? trimmed(p?.diet) : null, source: 'master', hint: 'Set on your record as a dietary preference; stored here as the engine’s key.' },
      { label: 'Goal', value: on ? trimmed(p?.goal) : null, source: 'hub' },
      { label: 'Height', value: num(m.heightCm ?? p?.heightCm, ' cm'), source: 'master' },
      { label: 'Weight', value: num(m.weightKg ?? p?.weightKg, ' kg'), source: 'master' },
      { label: 'Age', value: num(computeAge((m.dateOfBirth as Date | null) ?? null) ?? (on ? p?.age : null)), source: 'master' },
      { label: 'Sex used for the maths', value: trimmed(m.sexAtBirth ?? (on ? p?.sex : null)), source: 'master' },
      { label: 'Activity multiplier', value: on ? num(p?.activity) : null, source: 'master', hint: 'Resolved from the activity level on your record.' },
      { label: 'Cuisines', value: humanValue(ex.cuisines), source: 'hub' },
      { label: 'Allergies', value: humanValue(ex.allergies), source: 'hub' },
      { label: 'Foods excluded', value: humanValue(ex.excludedFoods ?? ex.excluded), source: 'hub' },
      { label: 'Budget', value: humanValue(ex.budget), source: 'hub' },
      { label: 'Longest you will cook', value: humanValue(ex.maxCookTime), source: 'hub' },
    ];
    panels.push({
      key: 'nutrition', label: 'Food preference profile', code: 'NUT',
      blurb: 'Your taste, your targets and everything a meal plan has to avoid.',
      href: '/nutrition/preferences', editLabel: 'Food preferences',
      started: on,
      summary: on ? `Diet: ${String(p?.diet)} · Goal: ${String(p?.goal)}` : null,
      percent: pct('nutrition'), fields,
      extra: extrasRows(ex, printed),
      counts: [{ label: 'Saved meal plans', value: rows.counts.mealPlans }],
    });
  }

  /* ── Matchmaking ───────────────────────────────────────────────────────
     Gender, birth date, birth time and birth place all descend from the
     master — and the propagation refuses to carry an under-18 date here at
     all, which is why the birthday on this panel is the record's. */
  {
    const d = rows.dating;
    const ex = json(d?.extras);
    const photos = arr(ex.photos);
    const printed = ['photos'];
    const fields: CityProfileField[] = [
      { label: 'Shown as', value: trimmed(m.genderIdentity ?? d?.gender), source: 'master', hint: 'Your gender from the record — the social answer, never the clinical one.' },
      { label: 'Seeking', value: trimmed(d?.seeking), source: 'hub' },
      { label: 'Birth date', value: iso(m.dateOfBirth ?? d?.birthDate), source: 'master' },
      { label: 'Birth time', value: trimmed(m.timeOfBirth ?? d?.birthTime), source: 'master' },
      { label: 'Birth place', value: trimmed(d?.birthPlace), source: 'master' },
      { label: 'Bio', value: trimmed(d?.bio), source: 'hub' },
      { label: 'Interests', value: csv(d?.interests), source: 'hub' },
      { label: 'Visible in the pool', value: yesNo(d?.visible), source: 'hub' },
      { label: 'Moderation', value: trimmed(d?.moderation), source: 'hub', hint: 'A new or edited profile waits for review before it is shown.' },
    ];
    panels.push({
      key: 'dating', label: 'My matchmaking profile', code: 'MAT',
      blurb: 'Birth details and interests — what the compatibility engine reads, and what another citizen sees.',
      href: '/matchmaking/profile', editLabel: 'Matchmaking profile',
      started: Boolean(d),
      summary: d ? (d.visible ? 'Profile visible' : 'Profile hidden') : null,
      percent: pct('dating'), fields,
      extra: extrasRows(ex, printed),
      counts: [{ label: 'Photographs', value: photos.length }],
    });
  }

  /* ── Jobs ──────────────────────────────────────────────────────────────
     Nothing propagates here yet: the CV parser writes a name of its own and
     the master's name does not reach it. The panel says so rather than
     pretending the two are one field. */
  {
    const j = rows.jobs;
    const fields: CityProfileField[] = [
      { label: 'Name on the CV', value: trimmed(j?.fullName), source: 'hub', hint: 'Read from your CV — the record’s name does not overwrite it.' },
      { label: 'Headline', value: trimmed(j?.headline), source: 'hub' },
      { label: 'Summary', value: trimmed(j?.summary), source: 'hub' },
      { label: 'Current title', value: trimmed(j?.currentTitle), source: 'hub' },
      { label: 'Current company', value: trimmed(j?.currentCompany), source: 'hub' },
      { label: 'Seniority', value: trimmed(j?.seniority), source: 'hub' },
      { label: 'Years of experience', value: j?.experienceYears ? String(j.experienceYears) : null, source: 'hub' },
      { label: 'Skills', value: csv(j?.skills), source: 'hub' },
      { label: 'Education', value: trimmed(j?.education), source: 'hub' },
      { label: 'Open to roles', value: csv(j?.openToRoles), source: 'hub' },
      { label: 'Notice period', value: num(j?.noticeDays, ' days'), source: 'hub' },
      { label: 'Expected package', value: j?.expectedLpa ? `${String(j.expectedLpa)} LPA` : null, source: 'hub' },
      { label: 'Links', value: trimmed(j?.links), source: 'hub' },
      { label: 'Location', value: trimmed(j?.location), source: 'hub' },
      { label: 'CV on file', value: trimmed(j?.resumeName), source: 'hub' },
      { label: 'CV uploaded', value: iso(j?.resumeAt), source: 'hub' },
    ];
    panels.push({
      key: 'jobs', label: 'Resume & profile', code: 'JOB',
      blurb: 'Uploaded once and parsed — the headline, skills and history recruiters are matched against.',
      href: '/jobs/profile', editLabel: 'Resume & profile',
      started: anyAnswered(fields),
      summary: trimmed(j?.headline),
      percent: pct('jobs'), fields, extra: [], counts: [],
    });
  }

  /* ── Pets ──────────────────────────────────────────────────────────────
     Not one profile but a list of them, so the panel is a row per animal
     rather than a field grid. Age is derived from the date of birth and
     never stored — a stored age is wrong the day after it is written, and a
     feeding plan reads age. */
  {
    const pets = rows.pets;
    const fields: CityProfileField[] = pets.map((p) => {
      const dob = trimmed(p.dob);
      const months = dob
        ? Math.max(0, Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
        : (p.ageMonths as number | null) ?? null;
      const bits = [
        trimmed(p.species), trimmed(p.breed),
        months != null ? (months >= 24 ? `${Math.floor(months / 12)} yrs` : `${months} mo`) : null,
        p.weightKg != null ? `${String(p.weightKg)} kg` : null,
        trimmed(p.goal),
      ].filter(Boolean);
      return { label: String(p.name ?? 'Unnamed'), value: bits.join(' · ') || null, source: 'hub' as const };
    });
    panels.push({
      key: 'pets', label: 'Pet profiles', code: 'PET',
      blurb: 'One profile per animal — species, weight, diet and what a vet asks for at the door.',
      href: '/pets/profiles', editLabel: 'Pet profiles',
      started: pets.length > 0,
      summary: pets.length ? `${pets.length} pet${pets.length > 1 ? 's' : ''}` : null,
      percent: null, fields, extra: [],
      counts: [
        { label: 'Pets', value: pets.length },
        { label: 'Photographs', value: rows.counts.petPhotos },
      ],
    });
  }

  /* ── Medical ───────────────────────────────────────────────────────────
     Blood group and the declared conditions are the RECORD'S — they are
     edited in the Medical section of the Master Profile, above this panel,
     and the medical hub reads them. Everything else is documents the hub
     owns. Consent per hub is listed because a permission you cannot see is
     a permission you did not give. */
  {
    const consents = rows.consents;
    const fields: CityProfileField[] = [
      { label: 'Blood group', value: trimmed(m.bloodGroup) === 'unknown' ? 'Answered — not known' : trimmed(m.bloodGroup), source: 'master' },
      { label: 'Declared conditions', value: trimmed(m.healthConditions) === 'none' ? 'Asked — none declared' : csv(m.healthConditions), source: 'master' },
      { label: 'Pregnancy trimester', value: trimmed(m.pregnancyTrimester), source: 'master' },
      { label: 'Kidney stage', value: trimmed(m.kidneyStage), source: 'master' },
      ...consents.map((c) => ({
        label: `Shares blood results with ${String(c.hub)}`,
        value: yesNo(c.granted),
        source: 'hub' as const,
      })),
    ];
    panels.push({
      key: 'medical', label: 'Medical records', code: 'MED',
      blurb: 'Documents, blood panels and medicines — and which hubs you have let read them.',
      href: '/medical/records', editLabel: 'Medical hub',
      started: rows.counts.medicalRecords + rows.counts.bloodTests + rows.counts.medicines > 0,
      summary: rows.counts.bloodTests ? `${rows.counts.bloodTests} blood test${rows.counts.bloodTests > 1 ? 's' : ''} on file` : null,
      percent: null, fields, extra: [],
      counts: [
        { label: 'Records', value: rows.counts.medicalRecords },
        { label: 'Blood tests', value: rows.counts.bloodTests },
        { label: 'Medicines', value: rows.counts.medicines },
      ],
    });
  }

  /* ── Social ────────────────────────────────────────────────────────────
     The one profile other citizens can actually read. Its city writes back
     to the master when it is saved, which is why that row is marked. */
  {
    const u = rows.user;
    const fields: CityProfileField[] = [
      { label: 'Handle', value: u?.handle ? `@${String(u.handle)}` : null, source: 'hub' },
      { label: 'Display name', value: trimmed(u?.name), source: 'master' },
      { label: 'Bio', value: trimmed(u?.bio), source: 'hub' },
      { label: 'Public city', value: trimmed(u?.city), source: 'master', hint: 'Saving it here writes it to your record too.' },
      { label: 'Website', value: trimmed(u?.website), source: 'hub' },
      { label: 'Photograph', value: u?.profileImage ? 'On file' : null, source: 'master' },
    ];
    panels.push({
      key: 'social', label: 'Social profile', code: 'SOC',
      blurb: 'The only page here another citizen can read — bio, city and link.',
      href: '/social/profile', editLabel: 'Social profile',
      started: anyAnswered(fields.filter((f) => f.label !== 'Handle' && f.label !== 'Display name')),
      summary: `${rows.counts.followers} followers · ${rows.counts.following} following · ${rows.counts.posts} posts`,
      percent: pct('social'), fields, extra: [],
      counts: [
        { label: 'Posts', value: rows.counts.posts },
        { label: 'Followers', value: rows.counts.followers },
        { label: 'Following', value: rows.counts.following },
        { label: 'Connections', value: rows.counts.connections },
      ],
    });
  }

  /* ── Account & verification ────────────────────────────────────────────
     Not a hub, and the one panel a citizen is most likely to be looking for
     when they open this page: what the city can reach them on, and what it
     has actually checked. An address that may or may not be confirmed is
     reported as unconfirmed rather than as an address. */
  {
    const u = rows.user;
    const fields: CityProfileField[] = [
      { label: 'City email', value: u?.handle ? `${String(u.handle)}@togethercity.app` : null, source: 'hub' },
      { label: 'Primary email', value: trimmed(u?.email), source: 'hub', hint: u?.emailVerified ? 'Verified.' : 'Not verified yet — receipts and recovery go here.' },
      { label: 'Phone', value: trimmed(u?.phoneE164 ?? u?.phone ?? m.phone), source: 'master', hint: u?.phoneVerifiedAt ? 'Verified.' : 'Not verified yet.' },
      { label: 'Identity checked', value: u?.identityVerifiedAt ? iso(u.identityVerifiedAt) : null, source: 'hub', hint: 'Only the verdict is kept — never a copy of a document.' },
      { label: 'Citizen since', value: iso(u?.createdAt), source: 'hub' },
    ];
    panels.push({
      key: 'account', label: 'Account & verification', code: 'ACC',
      blurb: 'What the city can reach you on, and which of it has been checked.',
      href: '/settings', editLabel: 'Settings',
      started: true,
      summary: u?.emailVerified ? 'Email verified' : 'Email not verified',
      percent: null, fields, extra: [], counts: [],
    });
  }

  /* ── The address book ──────────────────────────────────────────────────
     Written only at a checkout, and only when the citizen ticks the box.
     There is deliberately no way to add one from here — see the controller's
     note on the missing POST. */
  {
    const fields: CityProfileField[] = rows.addresses.map((a) => ({
      label: humanKey(String(a.label ?? 'address')),
      value: trimmed(a.addressText),
      source: 'hub' as const,
    }));
    panels.push({
      key: 'addresses', label: 'Saved addresses', code: 'ADR',
      blurb: 'Where deliveries go. Only ever saved from a checkout, and only when you tick the box.',
      href: '/profile#contact', editLabel: 'Where you live',
      started: fields.length > 0,
      summary: fields.length ? `${fields.length} saved` : null,
      percent: null,
      fields: fields.length ? fields : [{ label: 'Home', value: trimmed(m.address), source: 'master' }],
      extra: [], counts: [],
    });
  }

  /* ── Money and mail ────────────────────────────────────────────────────
     Two small stores that are still stores, and a page claiming to list
     everything the city holds cannot quietly leave out the one with a card
     on it. Four digits, never a number. */
  {
    const w = rows.wallet;
    const mail = rows.mail;
    const fields: CityProfileField[] = [
      { label: 'Wallet balance', value: w ? `₹${Number(w.balanceInr ?? 0).toLocaleString('en-IN')}` : null, source: 'hub' },
      { label: 'Card on file', value: w?.cardLast4 ? `${String(w.cardBrand ?? 'Card')} ending ${String(w.cardLast4)}` : null, source: 'hub', hint: 'Only the last four digits are ever stored.' },
      { label: 'Mailbox', value: trimmed(mail?.address), source: 'hub' },
    ];
    panels.push({
      key: 'money', label: 'Wallet & mailbox', code: 'WAL',
      blurb: 'Your city balance, the card behind it, and the address the city writes to you at.',
      href: '/financial/wallet', editLabel: 'Wallet',
      started: anyAnswered(fields),
      summary: w ? `₹${Number(w.balanceInr ?? 0).toLocaleString('en-IN')}` : null,
      percent: null, fields, extra: [], counts: [],
    });
  }

  /* ── The city you kept ─────────────────────────────────────────────────
     Design Your Services stores the hubs switched OFF, so a hub built next
     month is on for everybody without a backfill. Reported as what is off,
     because that is what is stored — the panel does not invert it into a
     list of twelve things that are on and call that a setting. */
  {
    const hidden = parseHiddenHubs(rows.user?.hiddenHubsJson as string | null | undefined);
    const prefs = rows.privacy;
    const fields: CityProfileField[] = [
      {
        label: 'Hubs switched off',
        value: hidden.length ? hidden.join(', ') : null,
        source: 'hub',
        hint: `Nothing off means the whole city — all ${DESIGNABLE_HUBS.length} designable hubs are open.`,
      },
      ...prefs.map((p) => ({
        label: humanKey(String(p.key).replace(/^pref:|^ack:/, '')),
        value: humanValue(p.value === 'true' ? true : p.value === 'false' ? false : p.value),
        source: 'hub' as const,
      })),
    ];
    panels.push({
      key: 'services', label: 'Your city & consents', code: 'SET',
      blurb: 'Which hubs you keep on the street, and every permission you have answered.',
      href: '/settings/privacy', editLabel: 'Privacy settings',
      started: hidden.length > 0 || prefs.length > 0,
      summary: hidden.length ? `${hidden.length} hub${hidden.length > 1 ? 's' : ''} hidden` : 'The whole city',
      percent: null, fields, extra: [], counts: [],
    });
  }

  /* ── What "the source" actually means ──────────────────────────────────
     A sentence saying "entered once" is a claim. This is the claim with its
     receipts: the field, its value, and the stores that read it. The lists
     are propagationPlan()'s, not a second opinion about it. */
  const mastered: CityProfilesView['mastered'] = [
    { label: 'Name', value: trimmed(m.name), readBy: ['Social', 'Jobs', 'Passport'] },
    { label: 'Date of birth', value: iso(m.dateOfBirth), readBy: ['Astrology', 'Matchmaking', 'Nutrition', 'Fitness'] },
    { label: 'Time of birth', value: trimmed(m.timeOfBirth), readBy: ['Astrology', 'Matchmaking'] },
    { label: 'Place of birth', value: [trimmed(m.birthCity), trimmed(m.birthState), trimmed(m.birthCountry)].filter(Boolean).join(', ') || null, readBy: ['Astrology', 'Matchmaking'] },
    { label: 'Sex at birth', value: trimmed(m.sexAtBirth), readBy: ['Nutrition', 'Fitness'] },
    { label: 'Gender', value: trimmed(m.genderIdentity), readBy: ['Matchmaking'] },
    { label: 'Height', value: num(m.heightCm, ' cm'), readBy: ['Nutrition', 'Fitness'] },
    { label: 'Weight', value: num(m.weightKg, ' kg'), readBy: ['Nutrition', 'Fitness'] },
    { label: 'Dietary preference', value: trimmed(m.dietaryPreference), readBy: ['Nutrition'] },
    { label: 'Activity level', value: trimmed(m.activityLevel), readBy: ['Nutrition'] },
    { label: 'Where you live', value: [trimmed(m.city), trimmed(m.country)].filter(Boolean).join(', ') || null, readBy: ['Local services', 'Real estate', 'Matchmaking'] },
    { label: 'Time zone', value: trimmed(m.timeZone), readBy: ['Astrology'] },
    { label: 'Blood group', value: trimmed(m.bloodGroup), readBy: ['Medical'] },
    { label: 'Declared conditions', value: csv(m.healthConditions), readBy: ['Medical'] },
  ];

  return { mastered, panels, startedCount: panels.filter((p) => p.started).length };
}

/* ── the read ───────────────────────────────────────────────────────────── */

/** Anything with a `findUnique`/`findMany`/`count`. Kept loose for the same
 *  reason the rest of this folder does: a service should not fail to compile
 *  on the order two build steps happen to run in. */
type Loose = Record<string, {
  findUnique?(a: unknown): Promise<Record<string, unknown> | null>;
  findMany?(a: unknown): Promise<Record<string, unknown>[]>;
  count?(a: unknown): Promise<number>;
}>;

@Injectable()
export class CityProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly master: MasterProfileService,
  ) {}

  async get(userId: string): Promise<CityProfilesView> {
    const px = this.prisma as unknown as Loose;
    const one = (model: string) =>
      swallow(px[model]?.findUnique?.({ where: { userId } }), `city-profiles: ${model} read`, { userId });
    const many = (model: string, args: unknown) =>
      swallow(px[model]?.findMany?.(args), `city-profiles: ${model} list`, { userId });
    const count = (model: string, where: unknown) =>
      swallow(px[model]?.count?.({ where }), `city-profiles: ${model} count`, { userId });

    const [
      master, completion, astro, beauty, fitness, food, dating, jobs, wallet, mail,
      user, pets, addresses, consents, privacy,
      medicalRecords, bloodTests, medicines, posts, followers, following, connections,
      mealPlans, workouts, petPhotos,
    ] = await Promise.all([
      swallow(this.master.get(userId), 'city-profiles: master read', { userId }),
      swallow(this.master.completion(userId), 'city-profiles: completion read', { userId }),
      one('astroProfile'), one('beautyProfile'), one('fitnessProfile'), one('foodPref'),
      one('datingProfile'), one('jobProfile'), one('cityWallet'), one('mailAccount'),
      swallow(px.user?.findUnique?.({ where: { id: userId } }), 'city-profiles: user read', { userId }),
      many('pet', { where: { userId }, orderBy: { name: 'asc' }, take: 20 }),
      many('savedAddress', { where: { userId }, orderBy: { label: 'asc' }, take: 6 }),
      many('medicalConsent', { where: { userId }, orderBy: { hub: 'asc' } }),
      many('privacySetting', { where: { userId }, orderBy: { key: 'asc' }, take: 40 }),
      count('medicalRecord', { userId }), count('medicalBloodTest', { userId }),
      count('medicine', { userId }), count('post', { authorId: userId }),
      count('follow', { followeeId: userId }), count('follow', { followerId: userId }),
      count('connection', { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] }),
      count('mealPlan', { userId }), count('workoutLog', { userId }), count('petPhoto', { userId }),
    ]);

    const percentByKey: Record<string, number> = {};
    for (const s of completion?.sections ?? []) percentByKey[s.key] = s.percent;

    return buildPanels({
      master: (master ?? null) as Record<string, unknown> | null,
      astro: astro ?? null, beauty: beauty ?? null, fitness: fitness ?? null,
      food: food ?? null, dating: dating ?? null, jobs: jobs ?? null,
      user: user ?? null, wallet: wallet ?? null, mail: mail ?? null,
      pets: pets ?? [], addresses: addresses ?? [], consents: consents ?? [], privacy: privacy ?? [],
      counts: {
        medicalRecords: medicalRecords ?? 0, bloodTests: bloodTests ?? 0, medicines: medicines ?? 0,
        posts: posts ?? 0, followers: followers ?? 0, following: following ?? 0,
        connections: connections ?? 0, mealPlans: mealPlans ?? 0,
        workouts: workouts ?? 0, petPhotos: petPhotos ?? 0,
      },
      percentByKey,
    });
  }
}

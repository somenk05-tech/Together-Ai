/**
 * Together City — the Professional Record, as pure functions
 * ------------------------------------------------------------------
 * Everything about a CvEntry that can be decided without a database: how a
 * written date becomes a sortable integer, which sections a profile should lead
 * with, and what a re-uploaded CV would change if it were applied.
 *
 * Pure and dependency-free for the same reason jobs-engine.ts is: these are the
 * decisions most likely to be wrong, and a unit test is a cheaper place to find
 * that out than a staging database.
 */

/** The shape every helper here needs. Deliberately looser than the Prisma row
 *  so a freshly-read AI entry (no id, no profileId) can be diffed against a
 *  stored one without either being converted first. */
export interface CvEntryLike {
  id?: string;
  kind: string;
  title?: string;
  organisation?: string;
  qualifier?: string;
  location?: string;
  startText?: string;
  endText?: string;
  current?: boolean;
  description?: string;
  /** Newline-separated in the database; a string here either way. */
  bullets?: string;
  /** csv in the database; a string here either way. */
  tags?: string;
  url?: string;
  source?: string;
}

/**
 * The kinds this app knows how to render, in the order a CV is conventionally
 * read. `kind` is an open column on purpose — a filmography or a patent list is
 * a new kind rather than a migration — so anything not named here still gets a
 * section, it just sits after the ones that are.
 */
export const KNOWN_KINDS = [
  'experience',
  'education',
  'project',
  'certification',
  'award',
  'language',
  'link',
] as const;

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** yyyymm from a year and a 1-based month, with the month clamped out of the
 *  way if a model or a citizen ever produces a thirteenth one. */
const yyyymm = (year: number, month: number): number => year * 100 + Math.min(12, Math.max(1, month));

/**
 * A written date turned into something sortable, or 0 when it cannot be.
 *
 * The column this feeds exists because dates on a CV are TEXT and stay text:
 * "Mar 2019", "2019", "Spring 2019" and "2019–present" are all real, and
 * parsing any of them into a timestamp invents a day the document never
 * claimed. What a list still needs is an ordering, so this produces the
 * coarsest number that is honest — yyyymm — and 0 when even the year is a
 * guess. A 0 sorts to the end and renders as "date not given", which is the
 * truth; a fabricated January would render as a fact.
 *
 * A year with no readable month becomes January of that year. That is not a
 * guess about the month, it is the convention "the year, ordered before any
 * dated month within it", and the citizen still sees their own "2019".
 */
export function toStartSort(startText: string): number {
  const raw = (startText ?? '').trim().toLowerCase();
  if (!raw) return 0;

  // YYYY-MM (and YYYY-MM-DD) first, because it is the one numeric form with no
  // ambiguity at all — nothing four digits long is a month.
  const iso = raw.match(/\b(19\d{2}|20\d{2})[-/.](\d{1,2})\b/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return yyyymm(Number(iso[1]), month);
  }

  // Three numeric parts: a day is in there somewhere and only one of the two
  // leading numbers can be the month. Anything over twelve settles it; when
  // both could be either, day-first wins, which is how the rest of the world
  // outside the United States writes a date and how this city writes one.
  const three = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](19\d{2}|20\d{2})\b/);
  if (three) {
    const [a, b] = [Number(three[1]), Number(three[2])];
    const month = a > 12 ? b : b > 12 ? a : b;
    if (month >= 1 && month <= 12) return yyyymm(Number(three[3]), month);
  }

  // MM/YYYY.
  const numericMonth = raw.match(/\b(\d{1,2})[-/.](19\d{2}|20\d{2})\b/);
  if (numericMonth) {
    const month = Number(numericMonth[1]);
    if (month >= 1 && month <= 12) return yyyymm(Number(numericMonth[2]), month);
  }

  // From here a year is required. "March", "Present" and "Ongoing" are all
  // unsortable, and a two-digit year is not worth the century it would have to
  // invent.
  const year = raw.match(/\b(19\d{2}|20\d{2})\b/);
  if (!year) return 0;

  // A month name, matched as a PREFIX of the full name so "sept" works and
  // "junior" — a word that really does turn up beside a date — does not become
  // June.
  for (const token of raw.match(/[a-z]+/g) ?? []) {
    if (token.length < 3) continue;
    const index = MONTH_NAMES.findIndex((name) => name.startsWith(token));
    if (index >= 0) return yyyymm(Number(year[1]), index + 1);
  }
  return yyyymm(Number(year[1]), 1);
}

/**
 * Which sections this profile should lead with, given what it actually holds.
 *
 * The brief that produced the CvEntry table is that a filmmaker's profile leads
 * with credits and a doctor's with specialisations. This is the part of that
 * which can be decided without asking: a running order derived from the shape
 * of somebody's record rather than from their job title, which nobody has
 * reliably told us anyway.
 *
 * Three rules, and each one is a claim about a person rather than about data:
 *
 *   · Experience leads, because for most people it is the answer to "what do
 *     you do".
 *   · A record with several projects and at most one job is a STUDENT or a
 *     freelancer just starting, and leading with one internship above four
 *     built things reads as an apology. Projects go first.
 *   · Awards immediately after projects, when there are several of both, is
 *     the CREATIVE's shape — the work, then who recognised it. Awards adrift
 *     at the bottom, under languages, is where a portfolio goes to be missed.
 *
 * The citizen overrides all of it by reordering, which is what
 * JobProfile.sectionOrder stores. This is only the answer before they have
 * said anything.
 *
 * @param kinds one entry per row, NOT deduplicated — the counts are the signal.
 */
export function defaultSectionOrder(kinds: string[]): string[] {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    const k = (kind ?? '').trim();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const has = (kind: string) => counts.has(kind);
  const count = (kind: string) => counts.get(kind) ?? 0;

  // Never a section with nothing in it: an empty "Certifications" heading is a
  // profile telling a recruiter about an absence.
  const order = KNOWN_KINDS.filter(has) as string[];
  // A kind nobody here has heard of still belongs to somebody, so it keeps its
  // section and sits after the conventional ones, in the order it first
  // appeared.
  for (const kind of kinds) if (!order.includes(kind) && has(kind)) order.push(kind);

  const move = (kind: string, to: number) => {
    const from = order.indexOf(kind);
    if (from < 0 || from === to) return;
    order.splice(from, 1);
    order.splice(from < to ? to - 1 : to, 0, kind);
  };

  if (count('project') >= 3 && count('experience') <= 1) move('project', 0);
  if (count('award') >= 2 && count('project') >= 3) move('award', order.indexOf('project') + 1);

  return order;
}

/** Case, punctuation and spacing are how the same sentence comes back spelled
 *  differently from one PDF extractor to the next. Digits and words survive,
 *  which is everything that carries meaning. */
const norm = (s: string | undefined): string => (s ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Two entries are the same entry when they are the same kind of thing, at the
 *  same place, with the same name. */
const matchKey = (e: CvEntryLike): string => `${norm(e.kind)}|${norm(e.title)}|${norm(e.organisation)}`;

/** The fields a re-read of the same document could legitimately improve. `kind`
 *  and the provenance columns are not among them. */
const COMPARED: Array<keyof CvEntryLike> = [
  'title', 'organisation', 'qualifier', 'location',
  'startText', 'endText', 'description', 'bullets', 'tags', 'url',
];

export interface EntryDiff {
  /** Entries the document has and the profile does not. */
  added: CvEntryLike[];
  /** Entries both have, where the document says something different. `fields`
   *  is what a review screen highlights. */
  changed: Array<{ existing: CvEntryLike; incoming: CvEntryLike; fields: string[] }>;
  /** Entries both have and agree on. Counted, so a re-upload that changes
   *  nothing can say so instead of showing an empty review. */
  unchanged: CvEntryLike[];
}

/**
 * What a re-uploaded CV would do to the profile, WITHOUT doing it.
 *
 * A second upload is usually an updated CV, not a replacement person: one new
 * job, one corrected date, and thirty rows the citizen may have spent an
 * evening editing. Overwriting on upload loses that evening, and refusing the
 * upload loses the new job. So the reader produces a proposal and this says
 * what the proposal amounts to; nothing here writes anything.
 *
 * An empty incoming field is never a change. A model that failed to read a
 * location off page two has not learned that the citizen's location is now
 * blank, and treating silence as a deletion is how an upload quietly empties a
 * profile.
 *
 * Nor is a difference that survives only in the punctuation. "Zeta Labs." and
 * "Zeta Labs" are one employer written by two PDF extractors, and a review
 * screen that asks about the full stop teaches people to click Accept All —
 * which is the same as having no review at all.
 */
export function diffEntries(existing: CvEntryLike[], incoming: CvEntryLike[]): EntryDiff {
  const byKey = new Map<string, CvEntryLike>();
  for (const e of existing) if (!byKey.has(matchKey(e))) byKey.set(matchKey(e), e);

  const out: EntryDiff = { added: [], changed: [], unchanged: [] };
  for (const row of incoming) {
    const match = byKey.get(matchKey(row));
    if (!match) { out.added.push(row); continue; }
    const fields = COMPARED.filter((f) => {
      const next = row[f];
      const prev = match[f];
      if (typeof next !== 'string' || !next.trim()) return false;
      return norm(next) !== norm(typeof prev === 'string' ? prev : '');
    });
    if (fields.length) out.changed.push({ existing: match, incoming: row, fields });
    else out.unchanged.push(row);
  }
  return out;
}

/** The match key, exported so the service can ask "does this collide with
 *  something the citizen wrote themselves" using exactly the rule the diff
 *  uses. Two answers to that question would be one too many. */
export function entryKey(entry: CvEntryLike): string {
  return matchKey(entry);
}

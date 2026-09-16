/**
 * ── THE CONTROL ROOM BEHIND THE CITY: ITS DEFINITIONS (owner, 16 Sep) ───────
 *
 * "Build a production-quality investor + founder analytics dashboard … never
 * fabricate real traction … create an analytics configuration layer where
 * activation rules can be changed later."
 *
 * Every rule a number on /investor/analytics depends on is written here, once,
 * in words and in code. Change a rule here and every section, the export and
 * the documentation (docs/insights.md) move with it. Nothing below is a
 * figure; it is what a figure MEANS.
 */

/** The city's own day: a member's Tuesday is Tuesday in India, not in UTC. */
export const CITY_TIME_ZONE = 'Asia/Kolkata';

/** The windows the dashboard offers. `all` has no start. */
export const RANGES = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, all: null } as const;
export type RangeKey = keyof typeof RANGES;
export const isRangeKey = (v: unknown): v is RangeKey => typeof v === 'string' && v in RANGES;

/**
 * THE EIGHT PERSONAL SYSTEMS. `paths` are the API prefixes whose use marks a
 * member as having used the system that day (member-day.ts); `sources` are the
 * records that count as an interaction with it — rows a member created, read
 * from the system's own tables, so the counts exist for every day since the
 * system opened and not only since this dashboard did.
 */
export interface SystemSource {
  table: string;
  /** Column holding the member's id. */
  user: string;
  /** Column holding when it happened. */
  at: string;
  /** Extra SQL condition on the row, if any (a constant, never user input). */
  where?: string;
}
export interface CitySystem { key: string; label: string; paths: string[]; sources: SystemSource[] }

export const SYSTEMS: readonly CitySystem[] = [
  { key: 'assistant', label: 'City Assistant', paths: ['/api/mira'],
    sources: [{ table: 'MiraTurn', user: 'userId', at: 'createdAt', where: `"who" = 'you'` }] },
  { key: 'beauty', label: 'Hair & Skin', paths: ['/api/beauty'],
    sources: [{ table: 'LookAnalysis', user: 'userId', at: 'createdAt' }, { table: 'BeautyOrder', user: 'userId', at: 'createdAt' }] },
  { key: 'fitness', label: 'Fitness', paths: ['/api/fitness'],
    sources: [{ table: 'WorkoutLog', user: 'userId', at: 'doneAt' }] },
  { key: 'nutrition', label: 'Nutrition', paths: ['/api/nutrition', '/api/family'],
    sources: [
      { table: 'MealPlan', user: 'userId', at: 'createdAt' },
      { table: 'FoodJournalEntry', user: 'userId', at: 'createdAt' },
      { table: 'NutritionOrder', user: 'userId', at: 'createdAt' },
    ] },
  { key: 'medical', label: 'Medical Records', paths: ['/api/medical', '/api/medicines', '/api/prescriptions'],
    sources: [
      { table: 'MedicalRecord', user: 'userId', at: 'createdAt' },
      { table: 'MedicalBloodTest', user: 'userId', at: 'createdAt' },
      { table: 'Prescription', user: 'userId', at: 'createdAt' },
    ] },
  { key: 'dating', label: 'Find Love', paths: ['/api/dating'],
    sources: [{ table: 'AppEvent', user: 'userId', at: 'at', where: `"name" LIKE 'dating.%'` }] },
  { key: 'astrology', label: 'Astrology', paths: ['/api/astrology'],
    sources: [
      { table: 'AstroQuestion', user: 'userId', at: 'createdAt' },
      { table: 'AstroReading', user: 'userId', at: 'createdAt' },
      { table: 'TarotReading', user: 'userId', at: 'createdAt' },
    ] },
  { key: 'pets', label: 'Pets', paths: ['/api/pets'],
    sources: [{ table: 'Pet', user: 'userId', at: 'createdAt' }, { table: 'PetPhoto', user: 'userId', at: 'createdAt' }] },
];
export const SYSTEM_KEYS = SYSTEMS.map((s) => s.key);

/**
 * ACTIVATED MEMBER. A member is activated once, within their first
 * `withinDays` days, they have used at least `minSystems` of the eight systems
 * (an interaction in the system's own records, or a day of use recorded by
 * member-day.ts). One system is a visit; two is the city starting to work.
 */
export const ACTIVATION = { minSystems: 2, withinDays: 7 } as const;

/**
 * ACTIVE. A member is active on a day when they used the signed-in app that
 * day (member-day.ts writes one row per member per day), or created a record
 * in any system that day. DAU / WAU / MAU are distinct members active in the
 * last 1 / 7 / 30 city days.
 */
export const ACTIVE_WINDOWS = { today: 1, week: 7, month: 30 } as const;

/**
 * RETENTION. Dn = of the members who joined in a cohort (a city week, Monday
 * start), the share active again on or after day n and before day n + width
 * after joining — D1 is day 1, D7 days 7–13, D14 days 14–20, D30 days 30–36.
 * A cohort is shown for Dn only once every member in it is n + width days old.
 */
export const RETENTION_DAYS = [1, 7, 14, 30] as const;
export const RETENTION_WIDTH: Record<number, number> = { 1: 1, 7: 7, 14: 7, 30: 7 };

/** Retained member, for the funnel: active in the last 7 days and joined at least 14 days ago. */
export const RETAINED = { activeWithinDays: 7, joinedAtLeastDaysAgo: 14 } as const;

/**
 * SMALL GROUPS ARE NOT SHOWN. A city of eighteen can be read person by person
 * from a table of cities or ages. Any group — a city, an age band, a device —
 * with fewer members than this is folded into "Other"; a funnel or total is
 * never suppressed (it names nobody).
 */
export const MIN_GROUP = 3;

/** How long an aggregate is kept before it is read again. */
export const CACHE_MS = 60_000;

/** Change below this many members on either side is "not enough data". */
export const MIN_FOR_TREND = 5;

/** The cities the reach table names; anything else is "Other India" or its country. */
export const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata'] as const;
export const CITY_ALIASES: Record<string, string> = {
  bombay: 'Mumbai', 'new delhi': 'Delhi', 'delhi ncr': 'Delhi', gurgaon: 'Delhi', gurugram: 'Delhi', noida: 'Delhi',
  bangalore: 'Bengaluru', calcutta: 'Kolkata', madras: 'Chennai', poona: 'Pune', secunderabad: 'Hyderabad',
};

export const AGE_BANDS = [[18, 24], [25, 34], [35, 44], [45, 54], [55, 200]] as const;

/** Traffic sources, as a visit or a sign-up names them. */
export const SOURCES = ['direct', 'google', 'instagram', 'youtube', 'referral', 'paid_social', 'other'] as const;
export type SourceKey = (typeof SOURCES)[number];

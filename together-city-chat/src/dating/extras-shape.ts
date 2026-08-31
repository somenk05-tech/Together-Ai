/**
 * THE SHAPE OF THE EXTRAS BLOB, ENFORCED WHERE IT IS WRITTEN.
 *
 * Fifth audit, 31 Aug, H6. `extras` is a free JSON string of up to 2 MB, and
 * until today the save sanitised three things in it — the photo entries, the
 * selfie mark and the two age preferences — and stored everything else as it
 * came. The engine then trusted every type: `new Set(d.dealBreakers)`,
 * `(b.languages ?? []).map(lc)`, `goal.toLowerCase()`, `city.trim()`. One
 * authenticated save with `"languages": "Hindi"` and a clean bio passed
 * moderation, and from then on `discoverUncached` and `stackUncached` threw
 * for every viewer whose pool contained it — a 500 on Browse and Curated,
 * city-wide, from one row. And a few hundred rows each padding the blob to
 * the 2 MB cap made every uncached list a gigabyte of JSON parsing.
 *
 * So: a whitelist of the keys the form writes and the engine, the cards and
 * the moderation read, each held to its type and a length. Anything else is
 * dropped, and a wrong-typed value is dropped rather than refused — the same
 * stance `ownPhotosOnly` takes, because a save that throws over one bad entry
 * loses the whole edit, and the honest outcome of a bad field is its absence.
 *
 * `photos` is kept as a string array here and owned by `ownPhotosOnly`; the
 * selfie keys are kept as strings and owned by `carrySelfie`; the coordinates
 * are kept as numbers and snapped by the save. This file only decides SHAPE.
 */

/** Free text a stranger may be shown, and its cap. `firstName` matches `shownName`'s 40. */
const TEXT: Record<string, number> = {
  firstName: 40,
  city: 80, state: 80, country: 80, countryCode: 8, stateCode: 8,
  relationshipGoal: 60, diet: 40, smoking: 40, drinking: 40, fitnessLevel: 40,
  education: 120, profession: 120,
  prefDiet: 40, prefSmoking: 40, prefDrinking: 40, wantsChildren: 40, religion: 60,
  prefHeight: 40, searchPlace: 120,
  sensitiveConsentAt: 40, visibility: 20,
  selfieKey: 300, selfieAt: 40,
};
/** Lists of short labels: at most this many, each at most 40 characters. */
const LISTS = ['seekingList', 'personalityTraits', 'values', 'dealBreakers', 'languages'] as const;
const LIST_MAX = 20;
const LABEL_MAX = 40;
/** Numbers the engine compares. Finite or absent; `null` is kept (it means "cleared"). */
const NUMBERS = [
  'heightCm', 'prefAgeMin', 'prefAgeMax', 'prefDistanceKm', 'prefHeightMinCm', 'prefHeightMaxCm',
  'searchLat', 'searchLng', 'minMatchScore',
] as const;
const PHOTOS_MAX = 10;
/** A legacy inline photo can be a data URL; a key is a few hundred bytes. */
const PHOTO_ENTRY_MAX = 1_500_000;

export function shapeExtras(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, cap] of Object.entries(TEXT)) {
    const v = raw[key];
    if (typeof v === 'string') {
      const t = v.replace(/\s+/g, ' ').trim().slice(0, cap).trim();
      if (t) out[key] = t;
    }
  }
  for (const key of LISTS) {
    const v = raw[key];
    if (Array.isArray(v)) {
      out[key] = v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX).trim())
        .filter(Boolean)
        .slice(0, LIST_MAX);
    }
  }
  for (const key of NUMBERS) {
    const v = raw[key];
    if (v === null) out[key] = null;
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  if (raw.partnerLocationMode === 'any' || raw.partnerLocationMode === 'around') out.partnerLocationMode = raw.partnerLocationMode;
  if (Array.isArray(raw.photos)) {
    out.photos = raw.photos
      .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= PHOTO_ENTRY_MAX)
      .slice(0, PHOTOS_MAX);
  }
  return out;
}

/** The free text on a profile that another citizen is shown, field by field —
 *  every one of them is scanned the way the bio is. */
export function shownText(dx: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ['firstName', 'profession', 'education', 'city', 'state', 'country'] as const) {
    if (typeof dx[key] === 'string') out.push(dx[key] as string);
  }
  for (const key of ['personalityTraits', 'values', 'languages'] as const) {
    if (Array.isArray(dx[key])) for (const x of dx[key] as unknown[]) if (typeof x === 'string') out.push(x);
  }
  return out;
}

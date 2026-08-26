/**
 * Dating profile completeness — a 0–100 score plus concrete, ranked suggestions
 * for what to add next. The Dating Hub uses this to nudge users toward richer
 * profiles ("Complete your profile to improve your match quality"). The heavier
 * a signal is for match quality, the more it's worth.
 *
 * WHAT THE PERCENTAGE MAY CHARGE FOR (M5). Birth time is labelled "(optional)"
 * on the form and used to be worth 12 points — the third-heaviest rule, behind
 * only photos and the bio. So somebody who read the label, believed it, and left
 * the field alone was told their profile was 88% complete and shown a
 * suggestion to fix it. Optional has one meaning, and "you may skip this, and we
 * will hold it against you" is not it. "Add more photos (5+) to stand out" was
 * the same thing said out loud: it is advice about standing out, not a missing
 * part of a profile.
 *
 * So there are two lists now. RULES are what a complete profile has, and they
 * are the whole denominator. BOOSTS still appear in the suggestions — they are
 * genuinely good advice and the astrology matching really is better with a birth
 * time — but they cannot take the percentage away from somebody who declined
 * something the form told them they could decline.
 */

export interface CompletionSuggestion {
  key: string;
  label: string;
  weight: number;
  /** True when skipping this costs nothing — see BOOSTS below. */
  optional?: boolean;
}
export interface ProfileCompletion {
  percent: number;                    // 0–100
  suggestions: CompletionSuggestion[]; // what's missing, most-impactful first
  complete: boolean;                  // percent >= 100
}

/** Minimal shape needed to score completeness (saved profile + parsed extras). */
export interface CompletionInput {
  bio?: string | null;
  interests?: string[];
  birthTime?: string | null;
  photos?: string[];
  personalityTraits?: string[];
  values?: string[];
  languages?: string[];
  city?: string | null;
  relationshipGoal?: string | null;
  diet?: string | null;
  smoking?: string | null;
  drinking?: string | null;
  fitnessLevel?: string | null;
  prefAgeMin?: number | null;
  prefAgeMax?: number | null;
}

interface Rule { key: string; label: string; weight: number; done: (i: CompletionInput) => boolean }

const RULES: Rule[] = [
  { key: 'photos', label: 'Add at least 3 photos', weight: 16, done: (i) => (i.photos?.length ?? 0) >= 3 },
  { key: 'bio', label: 'Write a short bio', weight: 14, done: (i) => (i.bio ?? '').trim().length >= 20 },
  { key: 'interests', label: 'Select at least 3 interests', weight: 12, done: (i) => (i.interests?.length ?? 0) >= 3 },
  { key: 'personality', label: 'Pick a few personality traits', weight: 9, done: (i) => (i.personalityTraits?.length ?? 0) >= 3 },
  { key: 'lifestyle', label: 'Add lifestyle preferences (diet, smoking, drinking, fitness)', weight: 9, done: (i) => [i.diet, i.smoking, i.drinking, i.fitnessLevel].filter(Boolean).length >= 2 },
  { key: 'goal', label: 'Set your relationship goal', weight: 7, done: (i) => Boolean(i.relationshipGoal) },
  { key: 'values', label: 'Choose the values that matter to you', weight: 5, done: (i) => (i.values?.length ?? 0) >= 1 },
  { key: 'languages', label: 'Add the languages you speak', weight: 4, done: (i) => (i.languages?.length ?? 0) >= 1 },
  { key: 'location', label: 'Confirm your city', weight: 3, done: (i) => Boolean(i.city) },
  { key: 'agePref', label: 'Set your preferred age range', weight: 3, done: (i) => Boolean(i.prefAgeMin || i.prefAgeMax) },
];

/**
 * Worth doing, never required. These are suggested and never subtracted — every
 * one of them is offered as optional somewhere the citizen can read it, and a
 * meter that punishes a choice the form invited is a meter that lies.
 */
const BOOSTS: Rule[] = [
  // The label used to promise the matching "gets noticeably sharper". Dating
  // reads the sun sign only; birth time sharpens the Astrology Zone's chart,
  // which is what the sentence now says.
  { key: 'birthTime', label: 'Add your birth time — your Astrology Zone chart gets more precise', weight: 0, done: (i) => Boolean(i.birthTime) },
  { key: 'photos-more', label: 'Add more photos (5+) to stand out', weight: 0, done: (i) => (i.photos?.length ?? 0) >= 5 },
];

export function profileCompletion(input: CompletionInput): ProfileCompletion {
  let got = 0;
  const missing: CompletionSuggestion[] = [];
  for (const r of RULES) {
    if (r.done(input)) got += r.weight;
    else missing.push({ key: r.key, label: r.label, weight: r.weight });
  }
  const total = RULES.reduce((s, r) => s + r.weight, 0);
  const percent = Math.round((got / total) * 100);
  // Real gaps first, heaviest first; the optional extras after them, so a
  // suggestion list never leads with something that costs nothing to ignore.
  // The cap applies to the GAPS, and the extras are appended after it.
  //
  // Capping the combined list instead would have quietly deleted the boosts:
  // with eleven things still missing, a weight-0 suggestion never survives a
  // top-five cut, so the birth-time nudge would only ever appear to somebody who
  // no longer needed nudging. These are two different lists — what your profile
  // is missing, and what would sharpen it — and the optional flag is what lets a
  // screen show them as two different things.
  const boosts: CompletionSuggestion[] = BOOSTS.filter((b) => !b.done(input))
    .map((b) => ({ key: b.key, label: b.label, weight: 0, optional: true }));
  return {
    percent,
    complete: percent >= 100,
    suggestions: [...missing.sort((a, b) => b.weight - a.weight).slice(0, 5), ...boosts],
  };
}

/**
 * Dating profile completeness — a 0–100 score plus concrete, ranked suggestions
 * for what to add next. The Dating Hub uses this to nudge users toward richer
 * profiles ("Complete your profile to improve your match quality"). The heavier
 * a signal is for match quality, the more it's worth.
 */

export interface CompletionSuggestion { key: string; label: string; weight: number }
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
  { key: 'photos-more', label: 'Add more photos (5+) to stand out', weight: 6, done: (i) => (i.photos?.length ?? 0) >= 5 },
  { key: 'bio', label: 'Write a short bio', weight: 14, done: (i) => (i.bio ?? '').trim().length >= 20 },
  { key: 'interests', label: 'Select at least 3 interests', weight: 12, done: (i) => (i.interests?.length ?? 0) >= 3 },
  { key: 'birthTime', label: 'Add your birth time for more accurate astrology matching', weight: 12, done: (i) => Boolean(i.birthTime) },
  { key: 'personality', label: 'Pick a few personality traits', weight: 9, done: (i) => (i.personalityTraits?.length ?? 0) >= 3 },
  { key: 'lifestyle', label: 'Add lifestyle preferences (diet, smoking, drinking, fitness)', weight: 9, done: (i) => [i.diet, i.smoking, i.drinking, i.fitnessLevel].filter(Boolean).length >= 2 },
  { key: 'goal', label: 'Set your relationship goal', weight: 7, done: (i) => Boolean(i.relationshipGoal) },
  { key: 'values', label: 'Choose the values that matter to you', weight: 5, done: (i) => (i.values?.length ?? 0) >= 1 },
  { key: 'languages', label: 'Add the languages you speak', weight: 4, done: (i) => (i.languages?.length ?? 0) >= 1 },
  { key: 'location', label: 'Confirm your city', weight: 3, done: (i) => Boolean(i.city) },
  { key: 'agePref', label: 'Set your preferred age range', weight: 3, done: (i) => Boolean(i.prefAgeMin || i.prefAgeMax) },
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
  return {
    percent,
    complete: percent >= 100,
    suggestions: missing.sort((a, b) => b.weight - a.weight).slice(0, 5),
  };
}

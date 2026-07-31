import { clean, declaredTerm, hasWord } from '../shared/allergens';

/**
 * The allergies a citizen recorded, put next to the medicines they were
 * prescribed. Nothing more than that, and the "nothing more" is the design.
 *
 * WHAT WAS WRONG. Medical → Records offers "Allergies" as a first-class kind,
 * with a warning icon, and its own placeholder reads "Penicillin allergy". The
 * app then reads a prescription photo, extracts medicine names, schedules doses
 * and sends reminders to take them. `grep -rn allerg src/prescriptions src/medical
 * src/tasks` returned nothing. The two facts had never been in the same room.
 *
 * That is not a screen inventing data — it is a screen implying a promise. A
 * category called Allergies with a ⚠️ on it says the app will do something with
 * what you file there. It did not.
 *
 * WHAT THIS DOES NOT DO, AND WILL NOT.
 *
 * It does not know that amoxicillin is a penicillin. Drug-class membership is
 * clinical knowledge, there is no source for it in this repository, and writing
 * one from memory is the thing already refused for sex-specific lab reference
 * intervals and for micronutrient breadth without ICMR-NIN. A class table that
 * looked authoritative and was written from recall would be worse than no table,
 * because somebody would rely on it.
 *
 * So the matching here is a NAMING check and nothing else: does the medicine's
 * name appear, as a whole word, in something the citizen wrote down? That is a
 * fact about two strings. It catches "Penicillin" against "Penicillin allergy"
 * and it misses "Amoxicillin", and both of those are stated plainly on the
 * screen rather than papered over.
 *
 * AN EMPTY RESULT IS NOT A CLEARANCE, AND THERE IS NO FUNCTION HERE THAT SAYS
 * OTHERWISE. There is deliberately no isSafe(), no hasConflict(), no boolean at
 * all — only a list of matches, which may be empty because nothing matched or
 * because we cannot possibly know. This codebase has already shipped one
 * tautological safety gate: "Allergen leaks: 0" was a hard gate in
 * RELEASE-GATE.md and it was computed with the same substring test the filter
 * enforced. A "no known interactions" line here would be the same mistake with
 * higher stakes.
 *
 * The citizen's own records, rendered where they matter, and the judgement left
 * to the citizen and their pharmacist.
 */

export interface RecordedAllergy {
  id: string;
  title: string;
  detail: string | null;
  recordedOn: string;
}

export interface AllergyMatch {
  allergyId: string;
  /** The record's title, so the screen can name what it matched. */
  title: string;
  /** The word that matched — shown, because an unexplained flag is noise. */
  matchedOn: string;
  /** 'title' | 'detail' — where in their record it was found. */
  foundIn: 'title' | 'detail';
}

/**
 * Words that appear in a medicine line and name a FORM, a unit or an
 * instruction rather than a drug. Without this, "Ibuprofen tablet" matched an
 * allergy recorded as "adhesive tablet dressing", and one useless flag teaches
 * somebody to ignore the useful one.
 */
const NOT_A_DRUG_NAME = new Set([
  'tablet', 'tablets', 'capsule', 'capsules', 'syrup', 'suspension', 'injection',
  'cream', 'ointment', 'drops', 'spray', 'inhaler', 'sachet', 'solution', 'gel',
  'daily', 'twice', 'thrice', 'once', 'oral', 'topical', 'night', 'morning',
  'after', 'before', 'food', 'water', 'dose', 'doses', 'strip', 'bottle',
]);

/** The words in a medicine line that could plausibly be its name. */
function nameWords(medicineName: string): string[] {
  return clean(medicineName)
    .split(' ')
    .filter((w) => w.length >= 4 && !NOT_A_DRUG_NAME.has(w));
}

/**
 * Every recorded allergy whose text names this medicine, or whose subject names
 * appear in it. Whole words both ways; never substrings — "cillin" matching
 * "penicillin" is how you end up flagging Cillin-anything, and substring
 * matching on declared allergies is a mistake this repo has already made five
 * times over (see shared/allergen-matching.spec.ts).
 */
export function matchesFor(
  medicineName: string,
  allergies: readonly RecordedAllergy[],
): AllergyMatch[] {
  const med = clean(medicineName);
  if (!med) return [];
  const words = nameWords(medicineName);
  const out: AllergyMatch[] = [];

  for (const a of allergies) {
    const title = clean(a.title);
    // "Penicillin allergy" → "penicillin". The wrapper is how people write
    // these down, and it is not part of the subject.
    const subject = declaredTerm(a.title);

    // Their subject named inside the medicine line: "Penicillin" in
    // "Penicillin V 250mg".
    if (subject && hasWord(med, subject)) {
      out.push({ allergyId: a.id, title: a.title, matchedOn: subject, foundIn: 'title' });
      continue;
    }
    // The medicine named inside their record — either direction is the same
    // question asked from the other end.
    const inTitle = words.find((w) => hasWord(title, w));
    if (inTitle) {
      out.push({ allergyId: a.id, title: a.title, matchedOn: inTitle, foundIn: 'title' });
      continue;
    }
    // And the free-text detail, because "reacts badly to X" is a thing people
    // write there, and it is still their own record rather than our inference.
    const detail = clean(a.detail ?? '');
    const inDetail = detail ? words.find((w) => hasWord(detail, w)) : undefined;
    if (inDetail) {
      out.push({ allergyId: a.id, title: a.title, matchedOn: inDetail, foundIn: 'detail' });
    }
  }
  return out;
}

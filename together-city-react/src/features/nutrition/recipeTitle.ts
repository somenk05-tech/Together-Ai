/**
 * Setting a dish name as a card title.
 *
 * The printed recipe cards this page was drawn from all do the same thing with
 * the name: most of it in capitals at display size, and the last word set apart
 * underneath in mixed case. "MUSHROOM & SPINACH / Fettuccine". It works because
 * the last word of a dish name is nearly always the FORM — curry, biryani,
 * fettuccine, soup — and the words before it are what is in it.
 *
 * THIS IS TYPESETTING AND NOTHING ELSE. It does not rename anything, it does
 * not decide what a dish is, and it must never lose or add a character: the two
 * pieces joined by a single space are the name that came out of the database.
 * The guard beside this file checks exactly that against every shape a name in
 * this dataset takes, because a title that quietly drops a word is the kind of
 * bug that looks like a design decision.
 *
 * A short name is not split. "Chicken Biryani" broken across two lines leaves
 * one word stranded above another and reads as a mistake rather than a
 * flourish, so anything under three words is set whole.
 */
export interface TitleSetting {
  /** The capitals. Empty when the name is too short to split. */
  lead: string;
  /** The word set apart underneath — or the entire name, when there is no lead. */
  tail: string;
}

export function setTitle(name: string): TitleSetting {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return { lead: '', tail: words.join(' ') };
  return { lead: words.slice(0, -1).join(' '), tail: words[words.length - 1] };
}

/** What the two pieces read as together — the check the guard runs. */
export function joinTitle(t: TitleSetting): string {
  return t.lead ? `${t.lead} ${t.tail}` : t.tail;
}

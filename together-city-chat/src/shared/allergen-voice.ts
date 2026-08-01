import { clean } from './allergens';

/**
 * Telling somebody the allergy rule just acted. (K5.66.)
 *
 * The consumer review's keep-list named the allergy propagation as the best
 * idea in the product: tell the city once that you cannot eat nuts and meals,
 * shopping, restaurants and even face cream change. Its one complaint was that
 * NOBODY IS EVER TOLD IT HAPPENED. A filter that works perfectly and says
 * nothing is indistinguishable, from the outside, from a thin catalogue.
 *
 * It is also unfalsifiable while it is silent. allergens.ts deliberately leans
 * towards excluding where a list is uncertain — coconut counts as a tree nut
 * because the FDA says so, though most tree-nut-allergic people tolerate it.
 * That is the right default and it is sometimes wrong for a given person, and
 * they can only correct it if they can see it act.
 *
 * ONE SENTENCE, ONE PLACE, for the same reason allergens.ts is one matcher:
 * four hubs writing their own phrasing is four wordings to drift apart.
 *
 * ── WHAT MEASUREMENT CHANGED ────────────────────────────────────────────────
 * The first draft of this hid any restaurant with an offending dish on the
 * menu, which is what discover() had always done. Run against the catalogue,
 * a milk declaration removed HALF of it and a gluten one removed half again —
 * because a restaurant that serves paneer also serves twelve things that are
 * not paneer. Nobody eats a restaurant. They eat a dish.
 *
 * So the unit of safety is the DISH, and a venue is hidden only when there is
 * nothing on its menu the citizen can eat. Otherwise it is shown and marked
 * with how much of the menu is affected. This is strictly safer than what was
 * shipping — six surfaces screened nothing at all — and strictly less blunt.
 */

export interface AllergyNotice {
  /** The citizen's own words, as they typed them — never a family key. */
  terms: string[];
  /** How many candidates this surface actually took away. Always >= 1. */
  removed: number;
  /** One sentence, ready to render. */
  sentence: string;
}

export interface AllergyMark { term: string; found: string; label: string }

/** "peanuts" - "peanuts and milk" - "peanuts, milk and egg" */
export function joinTerms(terms: readonly string[]): string {
  const t = [...new Set(terms.map((s) => (s ?? '').trim()).filter(Boolean))];
  if (t.length <= 1) return t[0] ?? '';
  return `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

export interface NoticeNoun {
  /** "place" / "dish" */
  one: string;
  /** "places" / "dishes" */
  many: string;
}

/**
 * The sentence for a surface that REMOVED things, or null when it removed none.
 *
 * `matched` is the declared terms that did the removing — collected from
 * findAllergen()'s `term`, which is what the citizen typed rather than the
 * family it resolved to. "nuts" stays "nuts"; it does not become "treenut".
 *
 * Never speaks at zero, and never speaks with no term: "0 places are not shown"
 * and "…because you told us about ." are both worse than silence.
 */
export function allergyNotice(
  matched: readonly string[],
  removed: number,
  noun: NoticeNoun,
): AllergyNotice | null {
  const terms = [...new Set(matched.map((s) => (s ?? '').trim()).filter(Boolean))].sort();
  if (removed < 1 || !terms.length) return null;
  const what = removed === 1 ? `1 ${noun.one} is` : `${removed} ${noun.many} are`;
  return {
    terms,
    removed,
    sentence: `${what} not shown here because you told us about ${joinTerms(terms)}.`,
  };
}

/**
 * The marker on ONE dish.
 *
 * When the thing that matched is the dish's own name there is no point saying
 * it back to somebody reading that name — "Contains Moongphali Chaat" under a
 * heading that reads Moongphali Chaat. Name the family instead. When the match
 * came from somewhere else (the description, an ingredient), say what it was:
 * that is the part they cannot see.
 */
export function allergyMark(term: string, found: string, itemName?: string): AllergyMark {
  const sameThing = itemName != null && clean(itemName) === clean(found);
  return {
    term,
    found,
    label: sameThing
      ? `Contains ${term} — you told us to avoid it.`
      : `Contains ${found} — you told us about ${term}.`,
  };
}

/**
 * The marker on a VENUE that is being shown rather than hidden.
 *
 * It carries the proportion because that is the decision the citizen is
 * actually making: one dish out of fourteen is a place to eat at carefully,
 * and eleven out of fourteen is a place to skip. Only they can weigh that.
 */
export function venueMark(
  term: string,
  example: string,
  count: number,
  menuReadable = true,
): AllergyMark {
  if (!menuReadable) {
    return {
      term, found: example,
      label: `We can't read this menu, and ${term} is in the name — worth checking before you order.`,
    };
  }
  return {
    term, found: example,
    label: count === 1
      ? `1 dish here contains ${term}: ${example}.`
      : `${count} dishes here contain ${term}, including ${example}.`,
  };
}

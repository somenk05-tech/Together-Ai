/**
 * WHAT IS IN IT — on the face of the card, as chips, and nowhere else.
 *
 * There was a tab as well: an "Ingredients" fold on the routine card and a
 * block inside the market tile's Details, printing the same list in full
 * with a sentence about where it came from. Owner, 4 Sep: "Remove the
 * ingredient tabs." A fold that opens on "No ingredient list on file" is a
 * drawer with nothing in it, and the chips already say the useful part.
 *
 * `listOf()` BECAUSE THE TWO RAILS DEPLOY SEPARATELY. The list arrives with
 * the Railway release; between that and the Vercel one this reads a step
 * that does not have it, and `.length` on undefined was a white screen over
 * the routine page (4 Sep, live). A missing list is nothing to show — not a
 * crash, and not a chip saying "none".
 */
const listOf = (v: string[] | undefined | null): string[] => (Array.isArray(v) ? v : []);

/**
 * WHETHER THERE IS A ROW TO DRAW AT ALL (6 Sep).
 *
 * The chips moved off the face of the card and behind a fold, on the owner's
 * reference — but the 4 Sep call that took the old ingredients tab out stands
 * and is the reason this exists: "a fold that opens on 'No ingredient list on
 * file' is a drawer with nothing in it". So the card asks first, and draws no
 * row where there is no list. The component still returns null on its own; a
 * fold's FACE is drawn before its panel and cannot find that out for itself.
 */
export const hasIngredients = (raw?: string[] | null): boolean => listOf(raw).length > 0;

export function IngredientChips({ ingredients: raw, max = 4 }: { ingredients?: string[] | null; max?: number }) {
  const ingredients = listOf(raw);
  if (!ingredients.length) return null;
  const shown = ingredients.slice(0, max);
  const more = ingredients.length - shown.length;
  return (
    <ul className="ingredient-chips" aria-label="Key ingredients">
      {shown.map((i, n) => <li key={`${n}-${i}`}>{i}</li>)}
      {more > 0 && <li className="is-more">+{more}</li>}
    </ul>
  );
}

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

/**
 * WHAT IS IN IT — the one list, printed the same way on every card.
 *
 * The routine card folds it under an "Ingredients" face; the market tile shows
 * it inside its Details panel. Both print THIS, so a card can never describe
 * the list one way and a tile another.
 *
 * THE SENTENCE UNDER THE LIST IS NOT DECORATION. Every row on the shelf today
 * carries the key ingredients the owner's data sheet names — a short list —
 * and none yet carries the pack's full INCI label. A citizen screening for an
 * allergen reads a short list with no caveat as "not in it", which is the one
 * thing this tab must never say by accident. So the source is said in words:
 * "key ingredients, as the data sheet names them" until a label list is on
 * file, and "as printed on the pack" once it is. The word comes from the
 * server's `ingredientsSource`, not from the length of the list — a label
 * with three ingredients is still a label.
 *
 * AN EMPTY LIST IS A REAL ANSWER for a trimmer or a perfume, and the tab says
 * so rather than hiding the section: a card whose Ingredients tab is missing
 * looks like a card that forgot, and a citizen cannot tell that from a card
 * that has nothing to say.
 */
/**
 * `?? []` AND `?? 'sheet'` BECAUSE THE TWO RAILS DEPLOY SEPARATELY. The
 * ingredient list arrives with the Railway release; between that and the
 * Vercel one this component reads a step that does not have it, and
 * `.length` on undefined was a white screen over the whole routine page
 * (4 Sep, live). A missing list is "none on file", not a crash.
 */
const listOf = (v: string[] | undefined | null): string[] => (Array.isArray(v) ? v : []);

export function IngredientList({ ingredients: raw, source = 'sheet', className }: {
  ingredients?: string[] | null;
  source?: 'sheet' | 'label';
  className?: string;
}) {
  const ingredients = listOf(raw);
  const note = source === 'label'
    ? 'Full list, as printed on the pack.'
    : 'Key ingredients from the data sheet — not the full label. Check the pack if you are avoiding something.';
  return (
    <div className={className}>
      {ingredients.length > 0 ? (
        <ol className="ingredient-list">
          {ingredients.map((i, n) => <li key={`${n}-${i}`}>{i}</li>)}
        </ol>
      ) : (
        <p className="ingredient-none muted">No ingredient list on file for this product.</p>
      )}
      {ingredients.length > 0 && <p className="ingredient-note muted">{note}</p>}
    </div>
  );
}

/** The word on the closed fold: what is inside, not how much. */
export function ingredientMeta(raw: string[] | undefined | null, source: 'sheet' | 'label' = 'sheet'): string {
  const ingredients = listOf(raw);
  if (!ingredients.length) return 'none on file';
  if (source === 'label') return `full label · ${ingredients.length}`;
  return ingredients.length === 1 ? ingredients[0] : `${ingredients.length} key ingredients`;
}

/**
 * THE SAME LIST, ON THE FACE OF THE CARD (owner, 3 Sep: "and the ingredient
 * details of each product"). A shopper comparing eight bottles should not
 * have to open eight folds to see what is in them, so the first few
 * ingredients ride the card as chips, and the fold underneath keeps the
 * whole list with the sentence about where it came from. Same array, so a
 * chip can never name something the list does not.
 */
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

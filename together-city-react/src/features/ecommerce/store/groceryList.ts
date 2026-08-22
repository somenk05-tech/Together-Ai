/**
 * ── THE GROCERY LIST, AS A FILE ─────────────────────────────────────────────
 *
 * Its own module rather than a second export beside the card, because a file
 * that exports both a component and a function loses Fast Refresh — the repo's
 * lint says so, and this is the shape it asks for.
 *
 * NOTHING HERE IS RECOMPUTED. Every quantity, pack size and "in pantry" note is
 * quoted from `useGroceryPlan` exactly as the Nutrition hub's printed sheet
 * quotes it. The server merged the duplicates and did the arithmetic; a second
 * copy of that in a download would disagree with the page the day either
 * changed.
 */

/** The list as a plain sheet: masthead, aisles, one line per item. */
export function listText(
  aisles: { title: string; items: { name: string; qtyLabel: string; pack?: string; inPantry?: boolean; haveQtyLabel?: string; toBuyQtyLabel?: string; toBuyGrams?: number; haveGrams?: number }[] }[],
  people: number,
  itemCount: number,
): string {
  const out: string[] = ['TOGETHER CITY', 'GROCERY LIST', ''];
  out.push(`For ${people} ${people === 1 ? 'person' : 'people'} · ${itemCount} item${itemCount === 1 ? '' : 's'}`);
  out.push('Every item comes from the menus you locked, in the plan you locked them in —');
  out.push('real quantities, duplicates merged, nothing inferred.');
  for (const aisle of aisles) {
    if (aisle.items.length === 0) continue;
    out.push('', aisle.title.toUpperCase());
    for (const item of aisle.items) {
      out.push(`[ ] ${item.name} — ${item.qtyLabel}`);
      /* The same sub-line the printed sheet carries, and in the same order of
         preference: what is already in the pantry beats what to buy, and the
         pack size is only worth printing when it differs from the quantity. */
      if (item.inPantry && (item.haveGrams ?? 0) > 0) {
        out.push(`      ${(item.toBuyGrams ?? 0) > 0 ? `have ${item.haveQtyLabel} · buy ${item.toBuyQtyLabel}` : 'in pantry'}`);
      } else if (item.pack && item.pack !== item.qtyLabel) {
        out.push(`      buy ${item.pack}`);
      }
    }
  }
  out.push('');
  return out.join('\n');
}

/**
 * Merging a freshly generated grocery list into the one somebody is shopping
 * from (BE-11.1).
 *
 * The ticket asks for "merge-on-regenerate that preserves checked state and
 * manual additions". Pure, because the interesting part is entirely about which
 * rows survive and that is much easier to be sure of without a database in the
 * way.
 *
 * Three rules, and each exists because the obvious alternative loses something
 * the citizen did:
 *
 *   1. A LINE STILL NEEDED KEEPS ITS TICK. Replacing the list wholesale is the
 *      easy implementation and it unticks a basket someone has already filled.
 *   2. A MANUAL LINE IS NEVER REMOVED. The planner did not put it there and
 *      does not know why it is there. Bin bags are not in the meal plan.
 *   3. A GENERATED LINE THAT IS NO LONGER NEEDED DROPS OUT — unless it is
 *      already ticked. If it is in the basket, it has been bought; removing it
 *      would make the list disagree with the trolley.
 */

export interface ListItem {
  key: string;
  label: string;
  aisle: string;
  qtyLabel: string;
  checked: boolean;
  source: 'plan' | 'manual';
}

/** A line as the planner produces it — no state of its own. */
export interface GeneratedItem {
  key: string;
  label: string;
  aisle: string;
  qtyLabel: string;
}

export interface MergeResult {
  items: ListItem[];
  /** Keys that left the list, for a "we removed these" note. */
  removed: string[];
}

export function mergeGroceryList(existing: readonly ListItem[], generated: readonly GeneratedItem[]): MergeResult {
  const byKey = new Map(existing.map((i) => [i.key, i]));
  const genKeys = new Set(generated.map((g) => g.key));
  const out: ListItem[] = [];
  const removed: string[] = [];

  // Everything the new plan calls for, carrying over any tick it already had.
  for (const g of generated) {
    const prev = byKey.get(g.key);
    out.push({
      key: g.key,
      // The plan's wording wins — quantities change between regenerations —
      // but the tick is the citizen's and survives.
      label: g.label, aisle: g.aisle, qtyLabel: g.qtyLabel,
      checked: prev?.checked ?? false,
      source: prev?.source === 'manual' ? 'manual' : 'plan',
    });
  }

  // Everything that was already there and is not in the new plan.
  for (const item of existing) {
    if (genKeys.has(item.key)) continue;
    if (item.source === 'manual' || item.checked) {
      // Kept: either the citizen added it, or it is already in the trolley.
      out.push(item);
      continue;
    }
    removed.push(item.key);
  }

  return { items: out, removed };
}

/** The merge key: one item however it was spelled or pluralised. */
export function itemKey(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(chopped|sliced|diced|fresh|dried|ground|whole|raw|large|small|medium)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?:es|s)$/, '');
}

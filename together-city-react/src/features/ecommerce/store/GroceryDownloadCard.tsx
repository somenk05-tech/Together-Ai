import { Link } from 'react-router-dom';
import { useGroceryPlan } from '@/features/nutrition/hooks';
import type { ShelfCard } from '../shelves';
import { listText } from './groceryList';

/**
 * ── THE GROCERY LIST IS A DOWNLOAD, NOT A DOOR ──────────────────────────────
 *
 * Owner, 22 Aug: "add just the list separately as a download card instead of
 * sending to the grocery hub."
 *
 * It is the one shelf in the Personalized Store that is not a shop and cannot
 * become one — a list of ingredients with no prices on it and no order endpoint
 * behind it. So it does the one thing a citizen actually wants from a grocery
 * list on their way out: hands it over. The card IS the download.
 *
 * A FILE, NOT A PRINT DIALOG. The Nutrition hub's own Download is
 * `window.print()`, and that is right there: the list on that page is already a
 * printed sheet — masthead, aisles, tick boxes, dotted leaders — and every
 * platform's print dialog offers "Save as PDF". It cannot be right HERE,
 * because there is no sheet on this page to print. So this writes the list out
 * as text: aisle headings, a tick box per line, the quantity, and the pantry or
 * pack note under it. Plain text because a grocery list is read in a shop, on a
 * phone, by whoever is holding it.
 *
 * NOTHING IS RECOMPUTED. Every quantity, every pack size and every "in pantry"
 * note is quoted from the same `useGroceryPlan` the hub's sheet draws — the
 * server merged the duplicates and did the arithmetic, and a second copy of it
 * in a download would disagree with the page the day either changed.
 */

export function GroceryDownloadCard({ shelf }: { shelf: ShelfCard }) {
  const plan = useGroceryPlan('individual');
  const aisles = plan.data?.aisles ?? [];
  const itemCount = plan.data?.itemCount ?? 0;
  const people = plan.data?.summary?.householdSize ?? 1;
  const ready = itemCount > 0;

  const download = () => {
    const blob = new Blob([listText(aisles, people, itemCount)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'together-city-grocery-list.txt';
    a.click();
    /* Revoked on the next tick rather than immediately: Safari has been known
       to abandon a download whose object URL is freed in the same frame as the
       click. One tick costs nothing and the alternative is a file that
       sometimes does not arrive. */
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <article className="ec-card">
      <span className="ec-cat">{shelf.hubName}</span>
      <span className="ec-name">{shelf.name}</span>
      <span className="ec-line">{shelf.line}</span>
      {/* A REFUSED REQUEST IS NOT AN EMPTY LIST, and `failure-states.test.ts`
          caught this file saying it was: on an error `data` is undefined,
          itemCount is 0, and the card would have told somebody they have
          nothing to shop for — a claim about their own plan that was never
          checked. Three states, three sentences. */}
      <span className="ec-from">
        {plan.isLoading
          ? 'Reading your plan…'
          : plan.isError
            ? 'Couldn’t read your plan just now'
            : ready
              ? `${itemCount} item${itemCount === 1 ? '' : 's'} · ${aisles.filter((a) => a.items.length > 0).length} aisles · for ${people} ${people === 1 ? 'person' : 'people'}`
              : 'Nothing to shop for yet'}
      </span>
      {plan.isError ? (
        <button type="button" className="ec-dl ec-dl-quiet" onClick={() => void plan.refetch()}>
          Try again
        </button>
      ) : ready ? (
        <button type="button" className="ec-dl" onClick={download}>
          <span aria-hidden>⭳</span> Download the list
        </button>
      ) : (
        /* NOT A DISABLED BUTTON. "Nothing to shop for yet" is a sentence with
           a next step in it — the list is built from the menus you have locked,
           so the way to get one is to lock some. A greyed-out control says the
           same thing and hides the answer. */
        <Link to="/nutrition/weekly" className="ec-dl ec-dl-quiet">
          {plan.isLoading ? 'One moment…' : 'Lock a week of menus first'}
        </Link>
      )}
    </article>
  );
}

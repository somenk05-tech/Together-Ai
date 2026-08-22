import { useNavigate } from 'react-router-dom';
import { useGroceryPlan } from '@/features/nutrition/hooks';
import type { ShelfCard } from '../shelves';
import { ShelfTile } from '../ShelfTile';
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
 *
 * ── IT WEARS THE SAME TILE AS THE DOORS, AND SAYS ONE MORE THING ────────────
 *
 * The photographic card (owner, 22 Aug) carries the heading and nothing else.
 * This one carries the heading and a single line, because it is the only card
 * in either room that is not a door: a tile that downloads a file the moment it
 * is pressed and never said so is a surprise, and a surprise is not a design.
 *
 * THE THREE HONEST STATES SURVIVED THE REDESIGN and they are the reason the
 * line is not simply hard-coded. `failure-states.test.ts` caught this file once
 * telling somebody they had nothing to shop for when the truth was that the
 * request had been refused — a claim about their own plan that was never
 * checked. Loading says it is reading, a refusal says it could not read and
 * presses again, an empty plan says what to do instead, and only a plan that
 * exists offers the file.
 */

export function GroceryDownloadCard({ shelf }: { shelf: ShelfCard }) {
  const plan = useGroceryPlan('individual');
  const navigate = useNavigate();
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

  /* ONE PRESS, FOUR MEANINGS — and each of them is the truthful one for the
     state the plan is actually in. Nothing here is disabled: a greyed-out card
     says "no" and hides the answer, and in three of these four cases there is
     an answer. */
  const state = plan.isLoading
    ? { note: 'Reading your plan…' }
    : plan.isError
      ? { note: 'Couldn’t read your plan — press to try again', act: () => void plan.refetch() }
      : ready
        ? {
          /* The household size came off the card and stayed in the file, where
             the sheet's own masthead already prints it. Two tiles wide on a
             phone is 180px of column, and a third line of note pushed the
             heading off the picture. */
          note: `⭳ Download the list · ${itemCount} item${itemCount === 1 ? '' : 's'}`,
          act: download,
        }
        : { note: 'Nothing to shop for yet — lock a week of menus first', act: () => navigate('/nutrition/weekly') };

  return <ShelfTile art={shelf.art} name={shelf.name} note={state.note} onClick={state.act} />;
}

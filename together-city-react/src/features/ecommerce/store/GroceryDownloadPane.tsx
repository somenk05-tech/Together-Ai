import { useNavigate } from 'react-router-dom';
import { useGroceryPlan } from '@/features/nutrition/hooks';
import type { ShelfCard } from '../shelves';
import { listText } from './groceryList';

/**
 * ── THE GROCERY LIST IS A DOWNLOAD, NOT A SHELF ─────────────────────────────
 *
 * Owner, 22 Aug: "add just the list separately as a download card instead of
 * sending to the grocery hub." It was a card on a grid of photographs; the
 * grid is a row of tabs now (owner, 6 Sep) and this is the pane under its tab.
 * Same thing, same reason: it is the one shelf in the Personalized Store that
 * is not a shop and cannot become one — a list of ingredients with no prices
 * on it and no order endpoint behind it — so it does the one thing a citizen
 * actually wants from a grocery list on their way out: hands it over.
 *
 * A FILE, NOT A PRINT DIALOG. The Nutrition hub's own Download is
 * `window.print()`, and that is right there: the list on that page is already a
 * printed sheet. It cannot be right HERE, because there is no sheet on this
 * page to print. So this writes the list out as text: aisle headings, a tick
 * box per line, the quantity, and the pantry or pack note under it. Plain text
 * because a grocery list is read in a shop, on a phone, by whoever is holding it.
 *
 * NOTHING IS RECOMPUTED. Every quantity, every pack size and every "in pantry"
 * note is quoted from the same `useGroceryPlan` the hub's sheet draws — the
 * server merged the duplicates and did the arithmetic, and a second copy of it
 * in a download would disagree with the page the day either changed.
 *
 * THE THREE HONEST STATES are the reason the line under the title is not
 * simply hard-coded. `failure-states.test.ts` caught this file once telling
 * somebody they had nothing to shop for when the truth was that the request
 * had been refused. Loading says it is reading, a refusal says it could not
 * read and presses again, an empty plan says what to do instead, and only a
 * plan that exists offers the file.
 */

export function GroceryDownloadPane({ shelf }: { shelf: ShelfCard }) {
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

  /* ONE BUTTON, FOUR MEANINGS — and each of them is the truthful one for the
     state the plan is actually in. Only the reading state disables it, because
     there is nothing to press until the plan has arrived; a greyed-out button
     on any of the other three would say "no" and hide an answer that exists. */
  const state = plan.isLoading
    ? { note: 'Reading your plan…', cta: 'Reading…', act: undefined }
    : plan.isError
      ? { note: 'Couldn’t read your plan.', cta: 'Try again', act: () => void plan.refetch() }
      : ready
        ? { note: `${itemCount} item${itemCount === 1 ? '' : 's'}, from the week of menus you locked.`, cta: '⭳ Download the list', act: download }
        : { note: 'Nothing to shop for yet — lock a week of menus first.', cta: 'Plan the week', act: () => navigate('/nutrition/weekly') };

  return (
    <section className="sf-room" aria-labelledby="sf-room-title">
      <div className="st-eyebrow">{shelf.hubName}</div>
      <h1 id="sf-room-title" className="st-title">{shelf.name}</h1>
      <p className="st-line">{shelf.line}</p>
      <p className="sf-room-note">{state.note}</p>
      <p className="sf-room-act">
        <button type="button" className="btn btn-accent" disabled={!state.act} onClick={state.act}>{state.cta}</button>
      </p>
    </section>
  );
}

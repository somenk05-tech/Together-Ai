/**
 * ── WHICH CHILD IS THIS SHELF READING ───────────────────────────────────────
 *
 * On every room that changes with the age, at the top, always. The rule this
 * hub inherits from the rest of the city: a personalised surface names what it
 * read and links to it. A shelf silently showing the general case looks exactly
 * like a shelf that knows your child, and the parent has no way to tell which
 * one they are looking at.
 *
 * FOUR STATES, AND EACH SAYS A DIFFERENT TRUE THING:
 *   · no children on the account — offer to add one, show the whole shop
 *   · a child with a birthday — name them, their age and their band
 *   · a child with no birthday — say so, and link to the form
 *   · a birthday in the future, or a child past ten — say which, and show all
 *
 * The last two are why `useSelectedBand` returns null in more than one way and
 * this component asks the question again rather than reading the band alone.
 */

import { Link } from 'react-router-dom';
import { useBabyCare, useSelectedChild } from '../store';
import { ageWords, bandForDob, BAND_LABEL, monthsOld } from '../age';

function reasonFor(dob: string | null): string {
  if (!dob) return 'No birthday on file, so this is the whole shop.';
  if (monthsOld(dob) === null) return 'That birthday has not arrived yet — this is the whole shop until it does.';
  return 'Past ten years, which is where this district ends. This is the whole shop.';
}

export function ChildBar() {
  const children = useBabyCare((s) => s.children);
  const selectedId = useBabyCare((s) => s.selectedId);
  const select = useBabyCare((s) => s.select);
  const loaded = useBabyCare((s) => s.loaded);
  const child = useSelectedChild();
  const band = child ? bandForDob(child.dob) : null;

  if (!loaded) {
    return <p className="bc-quiet" role="status" aria-live="polite">Reading your children…</p>;
  }

  if (children.length === 0) {
    return (
      <div className="bc-bar bc-row">
        <span className="bc-quiet">Showing everything — this shop is not reading a child yet.</span>
        <Link to="/babycare/children" className="bc-back">Add a child</Link>
      </div>
    );
  }

  return (
    <div className="bc-bar">
      {children.length > 1 && (
        <div className="bc-row">
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              className="bc-chip"
              onClick={() => select(c.id)}
              aria-pressed={c.id === selectedId}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <p className="bc-bar-line">
        {band && child
          ? (
            <>
              Built from <strong>{child.name}</strong>, {ageWords(child.dob)} — the {BAND_LABEL[band].toLowerCase()} shelf.
              {' '}
              <Link to="/babycare/children">Update</Link>
            </>
          )
          : (
            <>
              <strong>{child?.name}</strong>: {reasonFor(child?.dob ?? null)}
              {' '}
              <Link to="/babycare/children">Add a birthday</Link>
            </>
          )}
      </p>
    </div>
  );
}

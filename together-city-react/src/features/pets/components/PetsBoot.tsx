/**
 * ── THE DISTRICT ASKS FOR ITS PETS ONCE, AND SAYS SO WHEN IT CANNOT ─────────
 *
 * A pathless layout route around every room, so the fetch happens whatever door
 * a citizen came in by. Deep links are the whole reason this is not a
 * `useEffect` in `PetsHome`: a reminder points at `/pets/today`, a bookmark at
 * `/pets/monthly`, and neither of them passes through the world page.
 *
 * IT HOLDS THE ROOM BACK UNTIL THE FIRST FETCH RETURNS, and that is a trade
 * made on purpose. Seven of these rooms have an empty state that says some
 * version of "no pets yet" — and rendering it to somebody who owns three dogs,
 * for the couple of hundred milliseconds before their pets arrive, is not a
 * flicker. The profile page's empty state offers to add a pet, so a fast hand
 * lands on "Add a pet" for an animal already on the account.
 *
 * The cost is that the shop and the ingredient desk, which need no pet at all,
 * wait for one request they will not use. Seven guarded empty states would be
 * the finer instrument; one gate here is the one that cannot be forgotten by
 * the eighth page. The wait happens once per visit, not once per room.
 *
 * THE FAILURE BANNER SITS HERE FOR ONE REASON: a save can fail on any screen.
 * It used to be mounted on the world page alone, which is the page a citizen is
 * least likely to be looking at when a profile, a photograph or a medical note
 * does not reach the server. One mount above every room means no write in this
 * hub can fail quietly.
 */

import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { usePets } from '../store';
import { ErrorState } from './States';

export function PetsBoot() {
  const loadPets = usePets((s) => s.loadPets);
  const loaded = usePets((s) => s.loaded);
  const error = usePets((s) => s.error);
  const setError = usePets((s) => s.setError);
  const banner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) void loadPets();
  }, [loaded, loadPets]);

  /* A BANNER NOBODY SCROLLS TO IS A BANNER NOBODY READS. The profile form is
     two screens long and its save button is at the bottom of the second — so a
     refused save put the explanation somewhere the citizen was not looking, and
     the only visible fact was that the form had not closed. */
  useEffect(() => {
    if (error) banner.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {error && (
        <div ref={banner}>
          <ErrorState line={error} onRetry={() => setError(null)} />
        </div>
      )}
      {loaded
        ? <Outlet />
        : (
          /* Deliberately quiet and deliberately not a skeleton of a room: the
             rooms differ too much for one shape to be a truthful preview of
             the next. `aria-live` so a screen reader is told something is
             happening rather than reading an empty main. */
          <p className="muted" role="status" aria-live="polite" style={{ margin: 0, padding: '48px 0', fontSize: 13.5, textAlign: 'center' }}>
            Fetching your pets…
          </p>
        )}
    </div>
  );
}

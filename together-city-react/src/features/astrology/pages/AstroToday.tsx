import { useState } from 'react';
import { useAstroDaily, useAstroDailyHistory } from '../hooks';
import { LetterBody, LetterNote, LetterSky, NeedsBirthDetails } from '../components/Letter';

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Today's letter.
 *
 * One letter per person per day, written at their own midnight and kept. The
 * page is the letter and nothing else — see components/Letter.tsx for why the
 * card, the header, the chips, the five sections, the lucky strip and the
 * reflection box are all gone rather than hidden.
 *
 * FOUR THINGS CAN BE TRUE HERE and the page says which:
 *   · we have not asked for their birth details yet,
 *   · the request failed, so we do not know whether there is a letter,
 *   · the letter for today has not been successfully written,
 *   · there is a letter.
 * The middle two used to collapse into one another. A failed request rendered
 * "Couldn't reach the stars", which told somebody their letter was missing when
 * what had actually happened was that we could not see it.
 */
export function AstroToday() {
  const daily = useAstroDaily();
  const history = useAstroDailyHistory();
  const [showPast, setShowPast] = useState(false);
  const d = daily.data;
  const past = (history.data ?? []).filter((h) => h.date !== d?.date).slice(0, 7);

  return (
    <>
      <LetterSky label="Today" title={d && !d.needsProfile && !d.pending ? d.title : undefined}>
        {daily.isLoading && <LetterNote>Opening today&rsquo;s letter&hellip;</LetterNote>}

        {daily.isError && (
          <LetterNote action={<button type="button" className="letter-link" onClick={() => void daily.refetch()}>Try again</button>}>
            We could not reach your letter just now. This is not a message that there isn&rsquo;t
            one &mdash; only that we could not get to it from here.
          </LetterNote>
        )}

        {d?.needsProfile && <NeedsBirthDetails />}

        {d && !d.needsProfile && d.pending && (
          <LetterNote action={<button type="button" className="letter-link" onClick={() => void daily.refetch()}>Check again</button>}>
            Today&rsquo;s letter isn&rsquo;t ready yet. It is written fresh each morning rather than
            assembled from parts, and that hasn&rsquo;t finished &mdash; so rather than hand you
            something that only looks like it, we would rather you came back in a little while.
          </LetterNote>
        )}

        {d && !d.needsProfile && !d.pending && d.body && (
          <LetterBody salutation={d.salutation} body={d.body} signOff={d.signOff} />
        )}
      </LetterSky>

      {/* Below the artwork, never over it. */}
      {past.length > 0 && (
        <div className="letter-past">
          <div className="letter-past-inner">
            <button type="button" className="letter-link" onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Hide earlier letters' : `Earlier letters (${past.length})`}
            </button>
            {showPast && past.map((h) => (
              <div key={h.date}>
                <p className="letter-date">{dayLabel(h.date)}</p>
                <LetterBody salutation={h.salutation} body={h.body} signOff={h.signOff} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

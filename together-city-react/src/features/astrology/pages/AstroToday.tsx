import { useState } from 'react';
import { useAstroDaily, useAstroDailyHistory } from '../hooks';
import { LetterArchive, LetterBody, LetterNote, LetterReturn, LetterSky, NeedsBirthDetails } from '../components/Letter';
import type { DailyLetter } from '../api';

/** "Tuesday, 11 August 2026" — the letter's own day, written out. */
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

/** The short form the archive lists by. The year is on the letter, not the list. */
const shortLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Today's letter, and every letter before it.
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
 *
 * THE DATE IS THE LABEL. The small line above the title said "TODAY"; it says
 * "TODAY · TUESDAY, 11 AUGUST 2026" now, and on an archived letter it drops the
 * word and gives only the day. That is one label doing a label's job, rather
 * than a second grey line under the title on a page whose whole argument is
 * that it carries no furniture.
 *
 * WHY NOT A ROUTE PER DAY. `/astrology/today/2026-08-09` would be honest and
 * would also put a date into the breadcrumb, the browser history and the recent
 * trail — three places that would then need to know what an archived letter is.
 * The sidebar says "Today · Your letter for today" and it stays true: you are
 * on the Today page, reading back. When somebody needs to send one day to
 * somebody else, that is the moment for a route, and it is a small change.
 */
export function AstroToday() {
  const daily = useAstroDaily();
  const history = useAstroDailyHistory();
  /** The archived day being read, or null for today. */
  const [reading, setReading] = useState<string | null>(null);
  const d = daily.data;
  const past = (history.data ?? []).filter((h) => h.date !== d?.date);
  const archived = reading ? past.find((h) => h.date === reading) : undefined;
  // A day whose letter has vanished from the archive between renders falls back
  // to today rather than to an empty page.
  const shown: DailyLetter | undefined = archived ? { ...archived, needsProfile: false } : d;
  const isToday = !archived;
  const letterReady = Boolean(shown && !shown.needsProfile && !shown.pending && shown.body);

  return (
    <LetterSky
      label={shown?.date ? (isToday ? `Today · ${dayLabel(shown.date)}` : dayLabel(shown.date)) : 'Today'}
      title={letterReady ? shown?.title : undefined}
    >
      {isToday && daily.isLoading && <LetterNote>Opening today&rsquo;s letter&hellip;</LetterNote>}

      {isToday && daily.isError && (
        <LetterNote action={<button type="button" className="letter-link" onClick={() => void daily.refetch()}>Try again</button>}>
          We could not reach your letter just now. This is not a message that there isn&rsquo;t
          one &mdash; only that we could not get to it from here.
        </LetterNote>
      )}

      {isToday && d?.needsProfile && <NeedsBirthDetails />}

      {isToday && d && !d.needsProfile && d.pending && (
        <LetterNote action={<button type="button" className="letter-link" onClick={() => void daily.refetch()}>Check again</button>}>
          Today&rsquo;s letter isn&rsquo;t ready yet. It is written fresh each morning rather than
          assembled from parts, and that hasn&rsquo;t finished &mdash; so rather than hand you
          something that only looks like it, we would rather you came back in a little while.
        </LetterNote>
      )}

      {letterReady && shown && (
        <LetterBody salutation={shown.salutation} body={shown.body} signOff={shown.signOff} />
      )}

      {!isToday && (
        <LetterReturn onClick={() => setReading(null)}>&larr; Back to today&rsquo;s letter</LetterReturn>
      )}

      <LetterArchive
        rows={past.map((h) => ({ date: h.date, label: shortLabel(h.date), title: h.title }))}
        current={reading}
        onPick={(date) => { setReading(date); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />
    </LetterSky>
  );
}

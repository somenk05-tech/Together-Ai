import { useState } from 'react';
import { useAstroMonthly, useAstroMonthlyHistory } from '../hooks';
import { LetterArchive, LetterBody, LetterNote, LetterReturn, LetterSky, NeedsBirthDetails } from '../components/Letter';
import type { MonthlyLetter } from '../api';

/**
 * "July 2026" for a letter written before `month` was stored.
 *
 * Day 1 of the key rather than day 0 of the parsed string, and constructed
 * from parts rather than parsed from text: `new Date('2026-07')` is UTC
 * midnight, which is the previous month for anybody west of Greenwich, and
 * this hub's whole point is that it runs on the citizen's own clock.
 */
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/**
 * The month ahead, as one letter — and every month behind it.
 *
 * This was eleven labelled sections and two to four thousand words — career,
 * money, love, health, family, travel, turning points, best dates, caution
 * dates, summary — under a strip of chips naming the running period and the
 * numbers behind it. It is longer than the daily and still is, because a month
 * genuinely has more in it; what changed is that it is one continuous piece of
 * writing rather than twelve readings stacked up, and the specific days that
 * matter arrive in prose instead of as data.
 *
 * THE ARCHIVE MATTERS MORE HERE THAN ON THE DAILY, and it arrived second. A
 * daily letter is read the day it comes; a monthly one is the kind somebody
 * goes back to in November to see what August said. Losing those was the more
 * expensive of the two losses, which is why the server keeps two years of them
 * against the daily's thirty days.
 */
export function AstroMonthly() {
  const monthly = useAstroMonthly();
  const history = useAstroMonthlyHistory();
  /** The archived month being read, or null for this one. */
  const [reading, setReading] = useState<string | null>(null);
  const m = monthly.data;
  const past = (history.data ?? []).filter((h) => h.date !== m?.date);
  const archived = reading ? past.find((h) => h.date === reading) : undefined;
  const shown: MonthlyLetter | undefined = archived ? { ...archived, needsProfile: false } : m;
  const isCurrent = !archived;
  const letterReady = Boolean(shown && !shown.needsProfile && !shown.pending && shown.body);

  return (
    /* The month is the label — "August 2026" — and the THEME is the title.
       `month` comes from the server already written out, so the page never
       formats a date for the letter it is showing and the two can never
       disagree about which month it is. Only a letter old enough to predate
       that field falls back to formatting the key. */
    <LetterSky
      label={shown ? (shown.month ?? monthLabel(shown.date)) : undefined}
      title={letterReady ? shown?.title : undefined}
    >
      {isCurrent && monthly.isLoading && <LetterNote>Opening your letter for the month&hellip;</LetterNote>}

      {isCurrent && monthly.isError && (
        <LetterNote action={<button type="button" className="letter-link" onClick={() => void monthly.refetch()}>Try again</button>}>
          We could not reach your letter just now. This is not a message that there isn&rsquo;t one
          &mdash; only that we could not get to it from here.
        </LetterNote>
      )}

      {isCurrent && m?.needsProfile && <NeedsBirthDetails />}

      {isCurrent && m && !m.needsProfile && m.pending && (
        <LetterNote action={<button type="button" className="letter-link" onClick={() => void monthly.refetch()}>Check again</button>}>
          Your letter for the month isn&rsquo;t ready yet. It&rsquo;s still being written &mdash;
          come back a little later.
        </LetterNote>
      )}

      {letterReady && shown && (
        <LetterBody salutation={shown.salutation} body={shown.body} signOff={shown.signOff} />
      )}

      {!isCurrent && (
        <LetterReturn onClick={() => setReading(null)}>&larr; Back to this month&rsquo;s letter</LetterReturn>
      )}

      <LetterArchive
        rows={past.map((h) => ({ date: h.date, label: h.month ?? monthLabel(h.date), title: h.title }))}
        current={reading}
        onPick={(date) => { setReading(date); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />
    </LetterSky>
  );
}

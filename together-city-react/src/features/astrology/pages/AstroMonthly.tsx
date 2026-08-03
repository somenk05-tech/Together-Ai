import { useAstroMonthly } from '../hooks';
import { LetterBody, LetterNote, LetterSky, NeedsBirthDetails } from '../components/Letter';

/**
 * The month ahead, as one letter.
 *
 * This was eleven labelled sections and two to four thousand words — career,
 * money, love, health, family, travel, turning points, best dates, caution
 * dates, summary — under a strip of chips naming the running period and the
 * numbers behind it. It is longer than the daily and still is, because a month
 * genuinely has more in it; what changed is that it is one continuous piece of
 * writing rather than twelve readings stacked up, and the specific days that
 * matter arrive in prose instead of as data.
 */
export function AstroMonthly() {
  const monthly = useAstroMonthly();
  const m = monthly.data;

  return (
    <LetterSky>
      {monthly.isLoading && <LetterNote>Opening your letter for the month&hellip;</LetterNote>}

      {monthly.isError && (
        <LetterNote action={<button type="button" className="letter-link" onClick={() => void monthly.refetch()}>Try again</button>}>
          We could not reach your letter just now. This is not a message that there isn&rsquo;t one
          &mdash; only that we could not get to it from here.
        </LetterNote>
      )}

      {m?.needsProfile && <NeedsBirthDetails />}

      {m && !m.needsProfile && m.pending && (
        <LetterNote action={<button type="button" className="letter-link" onClick={() => void monthly.refetch()}>Check again</button>}>
          Your letter for the month isn&rsquo;t ready yet. It is written once, properly, rather than
          assembled from parts &mdash; and until it is, there is nothing here worth your time.
          Please come back a little later.
        </LetterNote>
      )}

      {m && !m.needsProfile && !m.pending && m.body && (
        <LetterBody salutation={m.salutation} body={m.body} signOff={m.signOff} />
      )}
    </LetterSky>
  );
}

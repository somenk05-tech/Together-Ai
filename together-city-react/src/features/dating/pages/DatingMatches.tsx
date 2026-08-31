import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { isSavedProfile, useDatingProfile, useDatingStack, type CuratedMatch, type DatingProfile, type MatchKind } from '../api';
import { coverageShort } from '../bands';
import { Portrait } from '../components/Portrait';
import { ReadFailure } from '../components/ReadFailure';

/**
 * ── CURATED MATCHES: THE PEOPLE WHO CHOSE YOU BACK ──────────────────────────
 *
 * The owner, 16 Aug: browsing the whole city belongs in Potential Matches, and
 * "when someone from potential matches connect with each other they land at
 * curated matches".
 *
 * WHAT THIS PAGE STOPPED BEING. It used to be both rooms at once — the mutual
 * matches at the top, then the ranked deck of candidates, then a histogram,
 * then "Everyone else" grouped by band with a Like button on every card. That
 * was the whole hub on one page, and the cost was that a match — the thing the
 * hub exists to produce — arrived as a section above a shop. Two rooms: one to
 * look, one to keep.
 *
 * NOTHING WAS DELETED, IT MOVED. Every card, band, histogram and control that
 * left this file is in `components/MatchCards.tsx`, rendered by Potential
 * Matches.
 *
 * THERE IS NO CAP ANY MORE (owner, 27 Aug: "let users have unlimited
 * conversations with curated matches... there should be no limit"). The three
 * -conversation limit, the panel that announced reaching it, and the band that
 * explained it are all gone: a match is a person who chose you back, and
 * nothing about this page rations talking to them.
 *
 * ── AND WHAT IT IS NOW ──────────────────────────────────────────────────────
 *
 * EVERY MATCH IS THE SAME CARD, AND THE CARD STOPS AT THEIR OWN WORDS
 * (owner, 27 Aug: "all the curated matches we should only see till love pets
 * section, and other curated matches card below, and when someone click on
 * the cards should they reach their page with more details"). The first
 * match used to be set at full size — portrait, facts grid, vibe, interests,
 * two buttons — while the rest were thumbnails, which made one person a page
 * and everybody else an afterthought. Now each person is one card: the
 * portrait with the figure small on it, the name, what they do and where,
 * and the one thing they wrote — and the CARD IS THE DOOR. Everything the
 * long card carried (facts, traits, interests, Connect, Open chat) lives on
 * the profile a tap opens, which is where the decision was always made.
 *
 * EVERYTHING HERE IS SOMETHING THE SERVER SENT, and every line is omitted
 * outright when the profile behind it is empty. A dash where a fact should
 * be is the same lie as an invented one, told more quietly.
 *
 * THE RAIL IS ONE THING NOW (owner, 27 Aug). The manifesto band and the
 * activity tiles went out with the rest of the room's editorial voice; the
 * citizen's own preferences stay, because that panel is a door to a setting
 * rather than a sentence about the product.
 */

/** How somebody's own preferences are stored: keys inside the dating
 *  profile's `extras` JSON, which travels as a string. Extras that will not
 *  parse are not an error worth reporting to the person reading them — the
 *  panel simply has nothing to say and says nothing. */
interface Prefs { prefAgeMin?: number | null; prefAgeMax?: number | null; prefDistanceKm?: number | null }
function readPrefs(extras: string | null): Prefs {
  try { return extras ? (JSON.parse(extras) as Prefs) : {}; } catch { return {}; }
}

/** The one place the stored value is turned into a sentence. 'any' is not a
 *  narrower answer than the other three; it is the widest one, and "Everyone"
 *  is what it means. */
const SEEKING: Record<DatingProfile['seeking'], string> = {
  male: 'Men', female: 'Women', nonbinary: 'Non-binary people', any: 'Everyone',
};

/** A photograph from their DATING gallery, or null — answered with their
 *  initial rather than an empty frame. The account picture is no longer the
 *  fallback: it is the face the whole city knows somebody by, and putting it
 *  on a card shown to strangers linked the two identities the moment a
 *  gallery was empty. The server no longer sends it at all. */
const portraitOf = (m: CuratedMatch) => m.photos?.[0] ?? null;

/** `Architect · Pune`, `Architect`, `Pune`, or nothing at all. Built by
 *  filtering rather than by ternaries so a missing half never leaves the
 *  separator behind it. */
const placeLine = (m: CuratedMatch) => [m.occupation, m.city].filter(Boolean).join(' · ');

/**
 * THE MATCH, AS ONE CARD, AND THE CARD IS THE DOOR (owner, 27 Aug).
 *
 * Portrait with the figure small on it, the name, what they do and where,
 * and the one thing they wrote — nothing below the bio. Facts, traits,
 * interests, Connect and Open chat all live on the profile the tap opens:
 * this list's job is to hold the people who chose you back, not to be each
 * of their pages at once. Every match gets THIS card — the first is first
 * only by being first, not by being bigger.
 */
function CuratedCard({ match, kind }: { match: CuratedMatch; kind: MatchKind }) {
  const photo = portraitOf(match);
  const place = placeLine(match);
  return (
    <Link className="dt-lead dt-door" to={`/dating/match?u=${match.user.id}&kind=${kind}`}
      aria-label={`Open ${match.user.name}’s profile`}>
      <span className="dt-shot">
        <Portrait src={photo}
          fallback={<span className="dt-shot-none" aria-hidden>{match.user.name.slice(0, 1)}</span>} />
        <span className="dt-pct">{match.score}% match</span>
      </span>
      <span className="dt-lead-body">
        <h2 className="dating-display dt-who">
          {match.user.name}{match.age ? `, ${match.age}` : ''}
        </h2>
        {place && <p className="dt-place">{place}</p>}
        {/* The badge over the photograph says "69% match" and said only that.
            This is the same disclosure the detail screen carries as a sentence:
            the percentage is read on this row first. */}
        {coverageShort(match.coverage) && <p className="dt-cov">{coverageShort(match.coverage)}</p>}
        {match.bio && match.bio.trim() && (
          <blockquote className="dt-quote">{match.bio}</blockquote>
        )}
      </span>
    </Link>
  );
}

export function DatingMatches() {
  const kind: MatchKind = 'romantic';
  const profile = useDatingProfile();
  // This room keeps people; it never renders `candidates`. One is enough
  // for `top`, and it stops a 2,000-card payload refetching every 30 s.
  // `isSavedProfile`, not `Boolean(...)`: a new citizen gets a truthy prefill
  // from this read, and the stack refuses them with a 404. (Fifth audit, B2.)
  const stack = useDatingStack(kind, isSavedProfile(profile.data), 1);

  if (profile.isLoading) return <Spinner label="Consulting the stars…" />;

  // Before the !profile.data branch, which invites them to create the profile
  // they may already have. A failed read is not a blank slate, and telling
  // somebody to introduce themselves for a second time is the same insult the
  // dashboard's "Welcome," was — an app that has forgotten them and says so
  // brightly.
  if (profile.isError) {
    return (
      <div>
        <EmptyState
          icon="⚠️"
          title="We couldn’t open your dating profile"
          hint="This is ours to fix, not yours to redo — nothing you’ve entered has been lost. Try again in a moment."
        />
      </div>
    );
  }

  if (!isSavedProfile(profile.data)) {
    return (
      <div>
        <EmptyState
          icon="✨"
          title="First, tell the stars about you"
          hint="Curated matching needs your birth details and interests."
        />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/dating/profile"><Button variant="accent">Create your dating profile</Button></Link>
        </div>
      </div>
    );
  }

  const matched = stack.data?.matched ?? [];
  const prefs = readPrefs(profile.data.extras);
  const ageRange = prefs.prefAgeMin && prefs.prefAgeMax ? `${prefs.prefAgeMin}–${prefs.prefAgeMax}`
    : prefs.prefAgeMin ? `${prefs.prefAgeMin} and up`
    : prefs.prefAgeMax ? `Up to ${prefs.prefAgeMax}` : null;

  return (
    <div>
      <div className="dt-wrap">
        <div className="dt-col">
          {stack.isLoading ? (
            <Spinner label="Looking for your matches…" />
          ) : stack.isError ? (
            // The branch this precedes says nobody has matched you back. Said to
            // somebody whose read simply failed, that is a small, plausible,
            // disheartening lie — and said to somebody held in review, "try
            // again in a moment" is advice that can be followed for a week.
            <ReadFailure
              error={stack.error}
              title="We couldn’t open your matches"
              hint="This didn’t reach us — it isn’t a verdict on who’s out there. Try again in a moment."
            />
          ) : matched.length > 0 ? (
            /* Every match, the same card, in the order the server sends them:
               newest match first, score as the tie-break. That claim used to
               be in this comment and in the server's, and was true in neither
               — `stack` sorted by score alone, so the match a citizen had just
               been notified about could be ninth. Fixed on the server, where
               the order is decided; this page has never re-sorted and still
               doesn't. Each card is the door to the full profile. */
            <>{matched.map((m) => <CuratedCard key={m.user.id} match={m} kind={kind} />)}</>
          ) : (
            <>
              <EmptyState
                icon="🌙"
                title="Nobody has matched you back yet"
                hint="This page fills up when someone likes you back. Everyone in your city is in Potential Matches — start there."
              />
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <Link to="/dating/browse"><Button variant="accent">Browse Potential Matches</Button></Link>
              </div>
            </>
          )}
        </div>

        <aside className="dt-rail">
          <section className="dt-panel">
            <h2 className="dt-panel-h">Your preferences</h2>
            <dl className="dt-stats">
              <div><dt>Seeking</dt><dd>{SEEKING[profile.data.seeking]}</dd></div>
              {ageRange && <div><dt>Age</dt><dd>{ageRange}</dd></div>}
              {prefs.prefDistanceKm && <div><dt>Within</dt><dd>{prefs.prefDistanceKm} km</dd></div>}
            </dl>
            <p className="dt-note"><Link to="/dating/profile">Edit preferences →</Link></p>
          </section>
        </aside>
      </div>
    </div>
  );
}

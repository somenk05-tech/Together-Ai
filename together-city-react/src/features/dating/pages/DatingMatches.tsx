import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useDatingProfile, useDatingStack, useDatingChats, type CuratedMatch, type DatingProfile, type MatchKind } from '../api';
import { EngagedPanel } from '../components/MatchCards';

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
 * A MATCH IS NEVER HIDDEN BY THE CAP. The chat limit is three conversations,
 * and the old page swapped the whole list for the "you're getting to know
 * someone" panel when you hit it. Here the panel sits BELOW your matches
 * rather than instead of them: at capacity what is paused is starting
 * something new, not seeing the people who already chose you.
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
 * THE RAIL IS THREE THINGS THIS PAGE ALREADY KNEW. The hub's rule about
 * intentional dating, the two counts that are real — matches and open
 * conversations — and the citizen's own preferences read off their profile.
 * There is no view count and no likes-received: nothing in the city records
 * either, and a rail that shows a zero for something nobody measures is worse
 * than a rail that says so in one line.
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

/** A photograph if they uploaded one, the account picture if they did not.
 *  Null when there is neither, which the card answers with their initial
 *  rather than with an empty frame. */
const portraitOf = (m: CuratedMatch) => m.photos?.[0] ?? m.user.profileImage ?? null;

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
        {photo
          ? <img src={photo} alt="" loading="lazy" />
          : <span className="dt-shot-none" aria-hidden>{match.user.name.slice(0, 1)}</span>}
        <span className="dt-pct">{match.score}% match</span>
      </span>
      <span className="dt-lead-body">
        <h2 className="dating-display dt-who">
          {match.user.name}{match.age ? `, ${match.age}` : ''}
        </h2>
        {place && <p className="dt-place">{place}</p>}
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
  const stack = useDatingStack(kind, Boolean(profile.data), 1);
  const chats = useDatingChats();

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

  if (!profile.data) {
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

  const chatCap = stack.data?.chatCap ?? 3;
  const openChats = stack.data?.openChats ?? (chats.data?.filter((c) => c.conversationId).length ?? 0);
  const atCapacity = stack.data?.atCapacity ?? openChats >= chatCap;
  const activeChat = chats.data?.[0] ?? null;
  const matched = stack.data?.matched ?? [];
  const prefs = readPrefs(profile.data.extras);
  const ageRange = prefs.prefAgeMin && prefs.prefAgeMax ? `${prefs.prefAgeMin}–${prefs.prefAgeMax}`
    : prefs.prefAgeMin ? `${prefs.prefAgeMin} and up`
    : prefs.prefAgeMax ? `Up to ${prefs.prefAgeMax}` : null;

  return (
    <div>
      {/* ── THE SAME NOTE AS THE ROOM NEXT DOOR (owner, 23 Aug) ─────────────
          Potential Matches got the stationery card and this is its pair, so the
          two rooms a citizen moves between are one object seen twice. Same
          `.dnote-*` block, not a copy of it.

          THE WORDS ARE THE LEDE, BROKEN AT ITS OWN PUNCTUATION. The card wants
          a large line, a small one and a caption, and the paragraph had two
          sentences — so the second breaks at its comma: "…only by liking you
          back." / "Which is why this list is short, and why chat opens on it."
          The comma becomes a full stop, `which` takes a capital, and a comma
          joins the two clauses that are now alone in a line. Not a word is
          added or dropped.

          AND NO DISPLAY FACE, because the room next door has none. `.dt-who`
          and the band keep `.dating-display` and should: the serif is this
          hub's voice for PEOPLE and for the house speaking, and the masthead
          is a printed note. Two registers on purpose, rather than a serif
          masthead here and a sans one thirty pixels away in the rail.

          THE COUNT WAITS. `matched` is empty until the stack resolves, and
          "0 people" for a second is the page's own bad news arriving early —
          the same argument the error branch below makes. */}
      <header className="dnote">
        <div className="dnote-top">
          <h1 className="dnote-mark">Curated Matches.</h1>
          <span className="dnote-from">Together City &middot; Dating Hub</span>
        </div>
        <div className="dnote-rule" />
        <div className="dnote-row">
          <span className="dnote-to"><span className="dnote-lab">To:</span> <span className="dnote-val">You</span></span>
          <span><span className="dnote-lab">Chose you back:</span> <span className="dnote-val">
            {matched.length > 0 ? `${matched.length} ${matched.length === 1 ? 'person' : 'people'}` : '\u2014'}</span></span>
        </div>
        <div className="dnote-box">
          <p className="dnote-claim">The people you and they both chose.</p>
          <p className="dnote-sub">
            Nobody arrives here by being scored highly &mdash; only by liking you back.
          </p>
          <span className="dnote-tick" aria-hidden>
            <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 17 L11 25 L27 2" />
            </svg>
          </span>
        </div>
        <span className="dnote-cap">Which is why this list is short, and why chat opens on it</span>
      </header>

      <div className="dt-wrap">
        <div className="dt-col">
          {stack.isLoading ? (
            <Spinner label="Looking for your matches…" />
          ) : stack.isError ? (
            // The branch this precedes says nobody has matched you back. Said to
            // somebody whose read simply failed, that is a small, plausible,
            // disheartening lie.
            <EmptyState
              icon="⚠️"
              title="We couldn’t open your matches"
              hint="This didn’t reach us — it isn’t a verdict on who’s out there. Try again in a moment."
            />
          ) : matched.length > 0 ? (
            /* Every match, the same card, best first (the server sends them
               newest-match-first; each card is the door to the full profile). */
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

          {/* The same notice the match detail page carries, shown ONCE for the
              page rather than repeated under every person — it is a rule about
              how this hub works, not a property of anybody on it. */}
          <aside className="dt-band">
            <p className="dating-display">We believe in intentional dating.</p>
            <p>
              You can have up to {chatCap} conversations going at once. If one isn’t going
              anywhere, <strong>unmatch</strong> and move forward.
            </p>
          </aside>

          {/* BELOW THE MATCHES, NEVER INSTEAD OF THEM. At capacity what is paused
              is starting something new — the people who already chose you are
              still yours to see. */}
          {atCapacity && !stack.isLoading && !stack.isError && (
            <div style={{ marginTop: 24 }}>
              <EngagedPanel chat={activeChat} openChats={openChats} cap={chatCap} />
            </div>
          )}

          {matched.length > 0 && !atCapacity && (
            <p className="dt-onward">
              Looking for more? Browse <Link to="/dating/browse">Potential Matches</Link>.
            </p>
          )}
        </div>

        <aside className="dt-rail">
          <section className="dt-panel">
            <h2 className="dt-panel-h">Your activity</h2>
            <dl className="dt-stats">
              <div><dt>Matches</dt><dd>{matched.length}</dd></div>
              <div><dt>Conversations</dt><dd>{openChats}</dd></div>
            </dl>
            {/* Two numbers, and a line about the ones that are not here. The
                city counts neither profile views nor likes received, so a
                third and fourth tile would have had to be invented. */}
            <p className="dt-note">Views and likes received aren’t counted.</p>
          </section>

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

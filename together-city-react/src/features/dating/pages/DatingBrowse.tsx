import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { isSavedProfile, useDatingProfile, useDiscover, type CuratedMatch, type DiscoverSection, type MatchKind } from '../api';
import { MatchCard, Distribution, UndoAndAllowance } from '../components/MatchCards';
import { ReadFailure } from '../components/ReadFailure';
import { bandsOf, byCategory } from '../bands';

/** Cards per page of the ranked pool.
 *
 *  200, NOT 48 (owner, 26 Aug: "let user have as many potential matches as
 *  possible, but always the match with the highest potential card is always
 *  the first one"). In today's city 200 is simply everyone; at scale it is
 *  the 200 BEST — the pool is ranked server-side before the cut — and every
 *  "Show more" is the next 200 down, so nothing is ever out of reach. The
 *  page stays a page rather than the whole pool because photos are signed
 *  per page (the 26 Aug page-at-a-time decision), and a first paint that
 *  waits on the whole city is a first paint that loses the citizen.
 *
 *  The second half of the owner's sentence costs nothing here because it is
 *  structural, and a test now pins it: `everyone` sorts descending, the
 *  bands render strongest-band-first, and every server section is emitted
 *  score-descending — so the first card on the page is the global best in
 *  both the banded and the sparse-city view. */
const BROWSE_PAGE = 200;

/**
 * ── POTENTIAL MATCHES ───────────────────────────────────────────────────────
 *
 * The owner, 16 Aug: a room where the citizen can see the whole public pool
 * with everybody's compatibility percentage, and where two people who choose
 * each other end up in Curated Matches.
 *
 * THE ENGINE FOR THIS ALREADY EXISTED AND HAD NEVER BEEN OPENED. `GET
 * /dating/discover` scores every eligible candidate — no truncation, no floor,
 * the caps that used to cut each band at 24 were deliberately removed — and
 * returns them in tiers. It had no caller: `useDiscover` was written, exported,
 * and never imported by a page. So this room is a door onto a room that was
 * already furnished, rather than a second engine that would drift from the
 * first. Nothing here recomputes a score.
 *
 * WHAT "THE ENTIRE PUBLIC" MEANS, PRECISELY — because the honest answer is not
 * "everyone" and the difference matters:
 *   · people who have chosen to be in the pool (a dating profile, visible,
 *     moderation approved). Dating is opt-in by existing here at all.
 *   · minus anyone you share an accepted connection with, and anyone blocked in
 *     either direction. Family and friends never discover this profile, and
 *     that rule is older than this page.
 *   · minus people whose own stated filters exclude you — age, height, distance,
 *     deal-breakers. Showing somebody whose door is locked from the other side
 *     is not showing them.
 *   · minus people you have skipped, and people you have already matched — the
 *     matched are not gone, they are in Curated Matches, which is the whole
 *     point of the two rooms.
 * None of those exclusions is disclosed, here or anywhere: the server returns
 * the same silence whichever side's filter closed the door.
 *
 * GROUPED, NOT RANKED INTO A SINGLE COLUMN, and never truncated. The bands are
 * named — Excellent, Great, Strong, down to Little in common — because "12
 * Great match" is something a person can act on and "12 in 80–90" is something
 * they have to decode. The bands are counted off the very array rendered below
 * them, so the summary cannot disagree with the list.
 */
/** The server's tier, in the one word that adds something the label does not. */
const TIER_WORD: Record<DiscoverSection['tier'], string> = {
  ideal: 'Curated', recommended: 'Recommended', discovery: 'Discovery',
};

export function DatingBrowse() {
  const kind: MatchKind = 'romantic';
  const profile = useDatingProfile();
  // A page at a time. The pool is ranked server-side before the cut, so the
  // first page is the best of the city, and every "Show more" is the next
  // best rather than the next in whatever order the database returned.
  const [limit, setLimit] = useState(BROWSE_PAGE);
  // `isSavedProfile`, not `Boolean(...)`: the read returns a truthy prefill
  // for anyone with no dating row, and asking for matches on its strength is
  // a guaranteed 404 dressed as a network error. (Fifth audit, B2.)
  const discover = useDiscover(kind, isSavedProfile(profile.data), limit);

  /**
   * ONE PERSON, ONCE. `discover()` fills its sections through a shared `used`
   * set, so a candidate appears in exactly one tier — but the discovery pools
   * (New Members, Recently Active…) are built from the same scored list, and a
   * future change to that endpoint could put somebody in two places. Deduping
   * by user id here means this page cannot show a face twice whatever the
   * sections do, and the whole point of the room is one honest list.
   */
  const everyone = useMemo(() => {
    const seen = new Set<string>();
    const out: CuratedMatch[] = [];
    for (const s of discover.data?.sections ?? []) {
      for (const m of s.matches) {
        if (seen.has(m.user.id)) continue;
        seen.add(m.user.id);
        out.push(m);
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }, [discover.data]);

  /**
   * THE SERVER'S OWN TIERS, one person once, in the order they were sent.
   *
   * `discover()` labels and annotates every section it builds — "Early days in
   * your city — these are your closest matches so far", "Below 55% on our
   * scoring. Shown because the score is our opinion and the choice is yours" —
   * and this page read the matches out of them and threw every word away. Those
   * sentences are the whole difference between a resident with two viable
   * matches and one with two hundred, and only the server knows which they are.
   * Deduped by the same rule `everyone` uses, so the two lists hold one face
   * once and hold the same faces.
   */
  const sections = useMemo(() => {
    const seen = new Set<string>();
    const out: DiscoverSection[] = [];
    for (const s of discover.data?.sections ?? []) {
      const matches: CuratedMatch[] = [];
      for (const m of s.matches) {
        if (seen.has(m.user.id)) continue;
        seen.add(m.user.id);
        matches.push(m);
      }
      if (matches.length) out.push({ ...s, matches });
    }
    return out;
  }, [discover.data]);

  if (profile.isLoading) return <Spinner label="Consulting the stars…" />;

  // Before the !profile.data branch, which would invite them to create the
  // profile they may already have. A failed read is not a blank slate.
  if (profile.isError) {
    return (
      <EmptyState
        icon="⚠️"
        title="We couldn’t open your matchmaking profile"
        hint="This is ours to fix, not yours to redo — nothing you’ve entered has been lost. Try again in a moment."
      />
    );
  }

  if (!isSavedProfile(profile.data)) {
    return (
      <div>
        <EmptyState
          icon="✨"
          title="First, tell the stars about you"
          hint="Compatibility is worked out from your birth details and what you told us matters to you — there is nothing to score until then."
        />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/matchmaking/profile"><Button variant="accent">Create your matchmaking profile</Button></Link>
        </div>
      </div>
    );
  }

  const groups = byCategory(everyone);
  const strongest = everyone[0]?.score;

  return (
    <div>
      <UndoAndAllowance kind={kind} />

      {/* THE ROOM NEXT DOOR, NAMED ON THE WAY IN. The journey the owner asked
          for is browse here → both choose → they are in Curated Matches, and a
          citizen should not have to discover that by it happening to them. */}
      <div style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--paper)', borderRadius: 'var(--r-2)', padding: '13px 16px' }}>
        <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--accent-ink)', color: 'var(--muted)', flex: 'none' }}>💫</span>
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <strong>When you both like each other, they move to Curated Matches</strong> — and
          chat opens there. <Link to="/matchmaking/matches" style={{ fontWeight: 700 }}>Curated Matches →</Link>
        </div>
      </div>

      {discover.isLoading ? (
        <Spinner label="Scoring compatibility…" />
      ) : discover.isError ? (
        // Said to somebody whose read simply failed, "no one to show" is a
        // small, plausible, disheartening lie about their whole city — and
        // said to somebody whose profile is in review or rejected, "this
        // didn't reach us" is a different lie with no end to it. `ReadFailure`
        // renders the server's own sentence when the server sent one.
        <ReadFailure
          error={discover.error}
          title="We couldn’t score your matches"
          hint="This didn’t reach us — it isn’t a verdict on who’s out there. Try again in a moment."
        />
      ) : everyone.length === 0 ? (
        <>
          {/* AN EMPTY ROOM HAS TWO CAUSES AND THEY ARE NOT THE SAME SENTENCE.
              (Fourth audit, 28 Aug.)
              This state said "no one to show just yet" whatever emptied it, and
              the server has always sent the discriminator — "reported, never
              silent", says the comment above POOL_CEILING. `poolSize` is who the
              SQL found: right age, right seeking, visible, approved. Anyone lost
              after that was lost to a filter of this citizen's own — height,
              distance, diet, religion, children, intent, language — or to the
              other person's pointing back. In a city of eight one setting clears
              the room, and telling somebody their city is empty when it is their
              own boundary is both false and the one thing they cannot act on. */}
          {(discover.data?.poolSize ?? 0) > 0 ? (
            <>
              <EmptyState
                icon="🎚"
                title="Your settings are hiding everyone"
                hint={`${discover.data?.poolSize} ${discover.data?.poolSize === 1 ? 'person is' : 'people are'} looking for someone like you, and your filters rule ${discover.data?.poolSize === 1 ? 'them' : 'all of them'} out. Distance and the deal breakers are the two that empty a small city fastest.`}
              />
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <Link to="/matchmaking/profile"><Button variant="accent">Open my preferences</Button></Link>
              </div>
            </>
          ) : (
            <>
              <EmptyState
                icon="🌙"
                title="No one to show just yet"
                hint="New residents appear here the day they join — everyone, not only the strong matches."
              />
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <Link to="/matchmaking/profile"><Button variant="line">Check who can find you</Button></Link>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* A THIN MARKET IS NOT THE SAME ROOM AS A FULL ONE, and the server
              has always said which this is. `lowDensity` is true when fewer
              than six people clear the curated bar; saying so with the server's
              own two counts is the difference between "these are your best
              matches" and "these are all there are yet". Above the bands,
              because it changes how the bands should be read. */}
          {discover.data?.lowDensity && (
            <div style={{ marginTop: 22, background: 'var(--paper)', borderRadius: 'var(--r-2)', padding: '13px 16px', fontSize: 12.5, lineHeight: 1.5 }}>
              <strong>Your city is still filling up.</strong>{' '}
              {discover.data.idealCount === 0
                ? `None of the ${discover.data.totalDiscoverable} people here clear the curated bar yet`
                : `${discover.data.idealCount} of the ${discover.data.totalDiscoverable} people here ${discover.data.idealCount === 1 ? 'clears' : 'clear'} the curated bar`}
              , so the list below reaches further down than it would in a busier city.
            </div>
          )}

          <Distribution bands={bandsOf(everyone)} total={everyone.length} highlightScore={strongest} />

          {/* AND THEN IT IS GROUPED THE WAY THAT MARKET DESERVES. In a full
              city the bands are the useful cut, and they stay. In a thin one
              they are nine headings over a handful of people, so the server's
              own tiers take over — each with the sentence it wrote for exactly
              this case. Same cards either way; nothing is added or hidden. */}
          {discover.data?.lowDensity
            ? sections.map((s) => (
              <section key={s.key} style={{ marginTop: 26 }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                  margin: '0 0 6px', paddingBottom: 6, borderBottom: '1px solid var(--line)',
                }}>
                  <h2 style={{ fontSize: 16, margin: 0 }}>{s.label}</h2>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 'var(--r-full)', padding: '3px 10px' }}>
                    {TIER_WORD[s.tier]}
                  </span>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                    {s.matches.length} {s.matches.length === 1 ? 'person' : 'people'}
                  </span>
                </div>
                {s.note && <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 12px' }}>{s.note}</p>}
                {s.matches.map((m) => <MatchCard key={m.user.id} match={m} kind={kind} />)}
              </section>
            ))
            : groups.map((group) => (
              <section key={group.label} style={{ marginTop: 26 }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                  margin: '0 0 12px', paddingBottom: 6, borderBottom: '1px solid var(--line)',
                }}>
                  <h2 style={{ fontSize: 16, margin: 0 }}>{group.name}</h2>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 'var(--r-full)', padding: '3px 10px' }}>
                    {group.label}
                  </span>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                    {group.matches.length} {group.matches.length === 1 ? 'person' : 'people'}
                  </span>
                </div>
                {group.matches.map((m) => <MatchCard key={m.user.id} match={m} kind={kind} />)}
              </section>
            ))}
          {discover.data?.hasMore && (
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <Button variant="line" onClick={() => setLimit((n) => n + BROWSE_PAGE)} disabled={discover.isFetching}>
                {discover.isFetching ? 'Loading…' : `Show more — ${discover.data.shown} of ${discover.data.totalDiscoverable} so far`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useDatingProfile, useDiscover, type CuratedMatch, type MatchKind } from '../api';
import { MatchCard, Distribution, UndoAndAllowance, bandsOf, byCategory } from '../components/MatchCards';

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
 *   · minus anyone who set their own visibility to "only above my threshold"
 *     and whose threshold you do not meet. Their setting, not ours to relax.
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
export function DatingBrowse() {
  const kind: MatchKind = 'romantic';
  const profile = useDatingProfile();
  const discover = useDiscover(kind, Boolean(profile.data));

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

  if (profile.isLoading) return <Spinner label="Consulting the stars…" />;

  // Before the !profile.data branch, which would invite them to create the
  // profile they may already have. A failed read is not a blank slate.
  if (profile.isError) {
    return (
      <EmptyState
        icon="⚠️"
        title="We couldn’t open your dating profile"
        hint="This is ours to fix, not yours to redo — nothing you’ve entered has been lost. Try again in a moment."
      />
    );
  }

  if (!profile.data) {
    return (
      <div>
        <EmptyState
          icon="✨"
          title="First, tell the stars about you"
          hint="Compatibility is worked out from your birth details and what you told us matters to you — there is nothing to score until then."
        />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/dating/profile"><Button variant="accent">Create your dating profile</Button></Link>
        </div>
      </div>
    );
  }

  const groups = byCategory(everyone);
  const strongest = everyone[0]?.score;

  return (
    <div>
      {/* ── THE NOTE (owner, 23 Aug, with a piece of stationery for reference)
          A bold wordmark over a heavy rule, a labelled row, a boxed field with
          one large line in it, a ticked box, a letterspaced caption. The owner
          chose the variant that borrows no typeface, so every word here is set
          in the face the rest of the application uses.

          THE WORDMARK IS THE ROOM'S OWN NAME. The rail and config/hubs.ts say
          "Potential Matches"; a card that said "MATCHES." would be a room with
          two names, which is a thing a citizen has to learn twice.

          THE COUNT IS REAL AND IT WAITS. `everyone` is empty until discover
          resolves, and "0 people" for a second is a small, plausible,
          disheartening lie about somebody's whole city — the same argument the
          error branch below makes. So the row shows it only when there is one. */}
      <header className="dnote">
        <div className="dnote-top">
          <h1 className="dnote-mark">Potential Matches.</h1>
          <span className="dnote-from">Together City &middot; Dating Hub</span>
        </div>
        <div className="dnote-rule" />
        <div className="dnote-row">
          <span className="dnote-to"><span className="dnote-lab">To:</span> <span className="dnote-val">You</span></span>
          <span><span className="dnote-lab">Open to being found:</span> <span className="dnote-val">
            {everyone.length > 0 ? `${everyone.length} people` : '\u2014'}</span></span>
        </div>
        <div className="dnote-box">
          <p className="dnote-claim">Stop investing your time in the wrong connections.</p>
          <p className="dnote-sub">
            Discover your compatibility first. Then start getting to know each other.
          </p>
          <span className="dnote-tick" aria-hidden>
            <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 17 L11 25 L27 2" />
            </svg>
          </span>
        </div>
        <span className="dnote-cap">Because meaningful relationships should begin with intention</span>
        <p className="dnote-fine">
          Nobody is hidden for scoring low &mdash; the percentage is our reading of the two of
          you, and the choice is yours. Like someone and they hear nothing; like each other and
          you both do.
        </p>
      </header>

      <UndoAndAllowance kind={kind} />

      {/* THE ROOM NEXT DOOR, NAMED ON THE WAY IN. The journey the owner asked
          for is browse here → both choose → they are in Curated Matches, and a
          citizen should not have to discover that by it happening to them. */}
      <div style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--paper)', borderRadius: 'var(--r-2)', padding: '13px 16px' }}>
        <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--accent-ink)', color: 'var(--muted)', flex: 'none' }}>💫</span>
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <strong>When you both like each other, they move to Curated Matches</strong> — that is
          where a match lives, and where chat opens. <Link to="/dating/matches" style={{ fontWeight: 700 }}>Curated Matches →</Link>
        </div>
      </div>

      {discover.isLoading ? (
        <Spinner label="Scoring compatibility…" />
      ) : discover.isError ? (
        // Said to somebody whose read simply failed, "no one to show" is a
        // small, plausible, disheartening lie about their whole city.
        <EmptyState
          icon="⚠️"
          title="We couldn’t score your matches"
          hint="This didn’t reach us — it isn’t a verdict on who’s out there. Try again in a moment."
        />
      ) : everyone.length === 0 ? (
        <>
          <EmptyState
            icon="🌙"
            title="No one to show just yet"
            hint="Your city is just getting started here. As more residents join, they appear on this page the day they do — everyone, not only the strong matches."
          />
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link to="/dating/profile"><Button variant="line">Check who can find you</Button></Link>
          </div>
        </>
      ) : (
        <>
          <Distribution bands={bandsOf(everyone)} total={everyone.length} highlightScore={strongest} />

          {groups.map((group) => (
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
        </>
      )}
    </div>
  );
}

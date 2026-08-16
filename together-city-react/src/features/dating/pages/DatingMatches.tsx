import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useDatingProfile, useDatingStack, useDatingChats, type MatchKind } from '../api';
import { MatchStack, EngagedPanel } from '../components/MatchCards';

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
 * Matches. This page and that one draw a person identically, on purpose: a
 * card that means one thing here and something else there is how two rooms
 * start disagreeing about what a percentage is.
 *
 * A MATCH IS NEVER HIDDEN BY THE CAP. The chat limit is three conversations,
 * and the old page swapped the whole list for the "you're getting to know
 * someone" panel when you hit it. Here the panel sits BELOW your matches
 * rather than instead of them: at capacity what is paused is starting
 * something new, not seeing the people who already chose you.
 */
export function DatingMatches() {
  const kind: MatchKind = 'romantic';
  const profile = useDatingProfile();
  const stack = useDatingStack(kind, Boolean(profile.data));
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

  return (
    <div>
      <div className="eyebrow">Dating Hub</div>
      <h1 style={{ fontSize: 26 }}>Curated Matches</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 14px', lineHeight: 1.6 }}>
        The people you and they both chose. Nobody arrives here by being scored highly — only by
        liking you back, which is why this list is short and why chat opens on it.
      </p>

      {/* The same notice the match detail page carries, shown ONCE for the page
          rather than repeated under every card — it is a rule about how this hub
          works, not a property of any one person. */}
      <div style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--paper)', borderRadius: 14, padding: '13px 16px' }}>
        <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--accent-ink)', color: 'var(--muted)', flex: 'none' }}>🔒</span>
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <strong>We believe in intentional dating.</strong> You can have up to {chatCap} conversations
          going at once. If one isn’t going anywhere, <strong>unmatch</strong> and move forward.
        </div>
      </div>

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
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>{matched.length === 1 ? 'Your match' : 'Your matches'}</h2>
            <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 999, padding: '3px 11px' }}>
              💫 You both liked each other
            </span>
          </div>
          {/* MUTUAL MATCHES ARE A DECK, and this was a bug the owner once saw:
              the section used to be a full-bleed card, so a single match put a
              900px photograph at the top of the page. One person here is the
              flat single card, which is the right amount of furniture for
              "you both liked each other". */}
          <MatchStack people={matched} kind={kind} />
        </section>
      ) : (
        <>
          <EmptyState
            icon="🌙"
            title="Nobody has matched you back yet"
            hint="A match is two people choosing each other, so this page fills up from the other room. Everyone in your city is in Potential Matches, with your compatibility on every card."
          />
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link to="/dating/browse"><Button variant="accent">Browse Potential Matches</Button></Link>
          </div>
        </>
      )}

      {/* BELOW THE MATCHES, NEVER INSTEAD OF THEM. At capacity what is paused is
          starting something new — the people who already chose you are still
          yours to see. */}
      {atCapacity && !stack.isLoading && !stack.isError && (
        <div style={{ marginTop: 24 }}>
          <EngagedPanel chat={activeChat} openChats={openChats} cap={chatCap} />
        </div>
      )}

      {matched.length > 0 && !atCapacity && (
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 22, textAlign: 'center' }}>
          Looking for more? <Link to="/dating/browse" style={{ fontWeight: 700 }}>Potential Matches</Link> has
          everyone in your city, with your compatibility on every card.
        </p>
      )}
    </div>
  );
}

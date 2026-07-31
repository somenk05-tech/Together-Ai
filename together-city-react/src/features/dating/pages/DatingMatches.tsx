import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useDatingProfile, useLikeMatch, usePassMatch, useDatingStack, useDatingChats,
  type CuratedMatch, type MatchKind, type CompatibilityBand, type DatingChatSummary,
} from '../api';
import { SafetyMenu } from '../components/SafetyMenu';

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      style={{
        width: 54, height: 54, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
        background: `conic-gradient(var(--accent) ${score * 3.6}deg, var(--line) 0deg)`,
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>
        {score}%
      </div>
    </div>
  );
}

/** Photo hero + swipeable thumbnail strip. The primary photo fills a 16:10
 *  banner with a gradient scrim; the name, age and star-line sit on the image,
 *  and the score ring floats top-right. Tap a thumbnail to bring it forward. */
function MatchGallery({ photos, name, age, theirSign, yourSign, score, href }: {
  photos: string[]; name: string; age?: number; theirSign: string; yourSign: string; score: number; href?: string;
}) {
  const [active, setActive] = useState(0);
  const hero = photos[active] ?? photos[0];
  const HeroInner = (
    <>
      <img src={hero} alt={name} loading="lazy"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,12,8,.80) 0%, rgba(15,12,8,.18) 44%, rgba(15,12,8,0) 70%)' }} />
      <div style={{ position: 'absolute', top: 12, right: 12, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.45))' }}>
        <ScoreRing score={score} />
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12, color: '#fff' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 700, lineHeight: 1.15, textShadow: '0 1px 10px rgba(0,0,0,.5)' }}>
          {name}{age ? `, ${age}` : ''}
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.92, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
          {theirSign} · with your {yourSign} — written in the stars
        </div>
      </div>
    </>
  );
  const heroStyle: React.CSSProperties = { position: 'relative', display: 'block', aspectRatio: '16 / 10', background: 'var(--paper)', overflow: 'hidden' };
  return (
    <div>
      {href
        ? <Link to={href} style={heroStyle} aria-label={`Open ${name}'s profile`}>{HeroInner}</Link>
        : <div style={heroStyle}>{HeroInner}</div>}
      {photos.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 10px 2px', overflowX: 'auto' }}>
          {photos.map((p, i) => (
            <button key={i} type="button" onClick={() => setActive(i)} aria-label={`Photo ${i + 1}`}
              style={{ flex: 'none', width: 46, height: 46, padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                border: `2px solid ${i === active ? 'var(--accent)' : 'transparent'}`, opacity: i === active ? 1 : 0.8, background: 'none' }}>
              <img src={p} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, kind }: { match: CuratedMatch; kind: MatchKind }) {
  const like = useLikeMatch(kind);
  const pass = usePassMatch(kind);
  const [result, setResult] = useState<{ matched: boolean; conversationId: string | null } | null>(null);

  const matched = result?.matched || match.matched;
  const photos = match.photos ?? [];
  const hasPhotos = photos.length > 0;
  const detailHref = `/dating/match?u=${match.user.id}&kind=${kind}`;

  return (
    <article className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      {hasPhotos ? (
        <MatchGallery photos={photos} name={match.user.name} age={match.age}
          theirSign={match.theirSign} yourSign={match.yourSign} score={match.score} href={detailHref} />
      ) : (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '18px 18px 0' }}>
          <ScoreRing score={match.score} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link to={detailHref} style={{ fontWeight: 700, fontSize: 16 }}>{match.user.name}{match.age ? `, ${match.age}` : ''}</Link>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {match.theirSign} · with your {match.yourSign} — written in the stars
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: hasPhotos ? '14px 18px 18px' : '12px 18px 18px' }}>
      {match.bio && <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 0', color: 'var(--ink-soft)' }}>{match.bio}</p>}

      {match.breakdown && (
        <div style={{ marginTop: 12, background: 'var(--paper)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>{match.score}% compatibility</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '6px 14px' }}>
            {([['Astrology', match.breakdown.astrology], ['Personality', match.breakdown.personality], ['Goals', match.breakdown.relationshipGoals], ['Values', match.breakdown.values], ['Lifestyle', match.breakdown.lifestyle], ['Interests', match.breakdown.interests], ['Location', match.breakdown.location]] as [string, number][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span className="muted">{k}</span><span style={{ fontWeight: 600 }}>{v}%</span>
              </div>
            ))}
          </div>
          {match.reasons && match.reasons.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 12.5, margin: '10px 0 4px' }}>Why this match?</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: 'var(--ink-soft)' }}>
                {match.reasons.map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {/* On the card, not only the detail page. Most people never open the
          detail page, and "I had to go looking for it" is exactly the failure
          this control exists to prevent. Outside the breakdown block, because a
          match with no score breakdown still has a person behind it. */}
      <div style={{ marginTop: 12 }}>
        <SafetyMenu userId={match.user.id} kind={kind} compact />
      </div>

      {match.interests.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {match.interests.map((i) => (
            <span key={i} className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', fontSize: 12 }}>
              {i}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {matched ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)' }}>💫 It’s a match!</span>
            {match.conversationId
              ? <Link to={`/dating/chats?c=${match.conversationId}`}><Button variant="accent" size="sm">💬 Open chat</Button></Link>
              : <Link to={detailHref}><Button variant="accent" size="sm">💬 Connect to Chat</Button></Link>}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="accent" size="sm" disabled={like.isPending}
                onClick={() => like.mutate(match.user.id, { onSuccess: (r) => setResult(r) })}
              >
                {like.isPending ? '…' : kind === 'romantic' ? '♥ Like' : '＋ Connect'}
              </Button>
              {/* "Skip", not "Pass" — the match detail page has always said Skip,
                  and the same action on two screens should not have two names. */}
              <Button variant="line" size="sm" disabled={pass.isPending} onClick={() => pass.mutate(match.user.id)}>
                ✕ Skip
              </Button>
              {/* Chat is shown here, always, so it is obvious that it exists and
                  what opens it — but it stays disabled until both people have
                  chosen each other. A dating hub where a stranger can open a
                  thread you never agreed to is a harassment surface, and the
                  whole flow (anonymous, one at a time) is built the other way.
                  Disabled-with-a-reason beats hidden: hidden looks broken. */}
              <Button
                variant="line"
                size="sm"
                disabled
                title={match.likedByMe
                  ? 'Waiting for them to like you back — chat opens the moment they do.'
                  : 'Chat opens once you both like each other.'}
                style={{ opacity: 0.5, cursor: 'not-allowed' }}
              >
                💬 Chat
              </Button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, margin: '10px 0 0', textAlign: 'center' }}>
              {match.likedByMe
                ? 'You’ve liked them. They’re notified only if you both like each other — chat opens the moment they do.'
                : 'They’re notified only if you both like each other. Chat opens then, in Dating Chats.'}
            </p>
          </>
        )}
      </div>
      </div>
    </article>
  );
}

/** One titled group of match cards — curated, recommended, or a discovery pool. */
/** A compatibility score's category (band + friendly name).
 *
 *  These are the categories the pool is counted in and the list is grouped by,
 *  so there has to be one for every score a card can carry. The 0–20 row is new:
 *  §15.2 removed the floor that used to drop those people before they reached
 *  the page, and a card with no category would have fallen through to a nameless
 *  "Match" while the histogram counted it somewhere the list did not. */
const BAND_NAMES: [number, number, string][] = [
  [90, 100, 'Excellent match'], [80, 90, 'Great match'], [70, 80, 'Strong match'], [60, 70, 'Good match'],
  [50, 60, 'Fair match'], [40, 50, 'Modest match'], [30, 40, 'Low match'], [20, 30, 'Faint match'],
  [0, 20, 'Little in common'],
];
function bandFor(score: number): { label: string; name: string } {
  for (const [lo, hi, name] of BAND_NAMES) {
    if (score >= lo && (score < hi || (hi === 100 && score <= 100))) return { label: `${lo}–${hi}%`, name };
  }
  return { label: `${score}%`, name: 'Match' };
}

/** The candidates grouped into those categories, best first, empty ones dropped.
 *  One pass over BAND_NAMES so the group headers, the counts in them and the
 *  histogram can never disagree about which category somebody is in. */
function byCategory(matches: CuratedMatch[]): { name: string; label: string; matches: CuratedMatch[] }[] {
  return BAND_NAMES
    .map(([lo, hi, name]) => ({
      name,
      label: `${lo}–${hi}%`,
      matches: matches
        .filter((m) => m.score >= lo && (m.score < hi || (hi === 100 && m.score <= 100)))
        .sort((a, b) => b.score - a.score),
    }))
    .filter((g) => g.matches.length > 0);
}

/** Compatibility-band histogram — only rendered once there are real people, and
 *  only for bands that actually contain someone. The top match's own band is
 *  highlighted so the user sees which category they're being shown. */
function Distribution({ bands, total, highlightScore }: { bands: CompatibilityBand[]; total: number; highlightScore?: number }) {
  const rows = bands.filter((b) => b.count > 0);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((b) => b.count));
  return (
    <div className="card" style={{ marginTop: 22, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Your match pool</h2>
        <span className="muted" style={{ fontSize: 12.5 }}>{total} potential {total === 1 ? 'match' : 'matches'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((b) => {
          const isTop = highlightScore != null && highlightScore >= b.min && highlightScore < (b.max === 100 ? 101 : b.max);
          // The category's name, not just its numbers — "12 Great match" is a
          // thing somebody can act on; "12 in 80–90" is a thing they have to
          // decode. Same lookup the list groups by, so the two always agree.
          const name = bandFor(b.min).name;
          return (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 116, fontSize: 12, fontWeight: isTop ? 800 : 600, color: isTop ? 'var(--accent)' : 'var(--ink-soft)', flex: 'none' }}>
                {name}
                <span className="muted" style={{ display: 'block', fontSize: 10.5, fontWeight: 600 }}>{b.label}%</span>
              </span>
              <div style={{ flex: 1, height: 16, borderRadius: 999, background: 'var(--paper)', overflow: 'hidden', outline: isTop ? '1.5px solid var(--accent)' : 'none' }}>
                <div style={{ height: '100%', width: `${Math.max(6, (b.count / max) * 100)}%`, background: 'var(--accent)', opacity: 0.4 + 0.55 * (b.min / 100), borderRadius: 999 }} />
              </div>
              <span style={{ width: 30, textAlign: 'right', fontSize: 12.5, fontWeight: 700, flex: 'none' }}>{b.count}</span>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
        {/* This used to say "you meet your single strongest match first", which
            stopped being true the moment the page started showing everybody.  */}
        Everyone here fits what you asked for. They are listed strongest first and grouped by
        category, so you can start at the top or go looking — the percentage is our reading of
        the two of you, and the choice is yours.
      </p>
    </div>
  );
}

/** Shown while the user already has an active dating chat — the stack is hidden
 *  so they focus on that one connection. */
function EngagedPanel({ chat, openChats, cap }: { chat: DatingChatSummary | null; openChats: number; cap: number }) {
  return (
    <div className="card" style={{ padding: '22px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 34 }}>💬</div>
      <h2 style={{ fontSize: 18, margin: '6px 0 4px' }}>
        {openChats === 1 ? `You’re getting to know ${chat ? chat.name : 'someone'}` : `You have ${openChats} conversations going`}
      </h2>
      <p className="muted" style={{ fontSize: 13, margin: '0 auto 16px', maxWidth: 380, lineHeight: 1.55 }}>
        Intentional dating means a few conversations, not endless ones — {cap} at a time.
        Your match stack is paused while you give these your attention, and every match is still
        waiting when you unmatch one.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to={chat ? `/dating/chats?c=${chat.conversationId}` : '/dating/chats'}><Button variant="accent">Open your chat</Button></Link>
        <Link to="/dating/chats"><Button variant="line">Dating chats</Button></Link>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>To start another, unmatch one of these first.</p>
    </div>
  );
}

/** Curated Matches (romantic) / New Friends (platonic) — intentional-dating stack:
 *  a compatibility-band breakdown of the pool + your single strongest match. */
export function DatingMatches() {
  const kind: MatchKind = 'romantic';
  const profile = useDatingProfile();
  const stack = useDatingStack(kind, Boolean(profile.data));
  const chats = useDatingChats();

  if (profile.isLoading) return <Spinner label="Consulting the stars…" />;

  if (!profile.data) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 16px' }}>
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

  // Paused at the CAP, not at the first conversation. `engaged` meant "has any
  // chat", so one conversation hid the entire match stack — the page stopped
  // doing its job the moment it succeeded once.
  const chatCap = stack.data?.chatCap ?? 3;
  const openChats = stack.data?.openChats ?? (chats.data?.filter((c) => c.conversationId).length ?? 0);
  const atCapacity = stack.data?.atCapacity ?? openChats >= chatCap;
  const activeChat = chats.data?.[0] ?? null;
  const top = stack.data?.top ?? null;
  const matched = stack.data?.matched ?? [];
  // Everyone below the top card. The page used to render `top` and nothing
  // else — the whole ranked list was computed server-side and then thrown away
  // at `cards[0]`. Compatibility is our opinion; who to talk to is theirs.
  const rest = (stack.data?.candidates ?? []).filter((c) => c.user.id !== top?.user.id);

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Dating Hub</div>
      <h1 style={{ fontSize: 26 }}>Curated Matches</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 14px' }}>
        Curated, not endless — you meet your single strongest match, not an endless list. Below is how your whole match pool breaks down by compatibility.
      </p>

      {/* The same notice the match detail page carries, shown ONCE for the page
          rather than repeated under every card — it is a rule about how this hub
          works, not a property of any one person. */}
      <div style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--paper)', borderRadius: 14, padding: '13px 16px' }}>
        <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', border: '1.5px solid #caa94a', color: 'var(--muted)', flex: 'none' }}>🔒</span>
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <strong>We believe in intentional dating.</strong> You can have up to three conversations
          going at once. If one isn’t going anywhere, <strong>unmatch</strong> and move forward.
        </div>
      </div>

      {/* Mutual matches lead the page, always — before the engaged panel and
          before the next candidate. Matching is the thing this hub is for; the
          person you matched with should not have to be hunted for. Each card
          carries its own "Open chat" or "Connect to Chat", so this is also how
          you reach the Dating Chats section for that person. */}
      {matched.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>{matched.length === 1 ? 'Your match' : 'Your matches'}</h2>
            <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 999, padding: '3px 11px' }}>
              💫 You both liked each other
            </span>
          </div>
          {matched.map((m) => <MatchCard key={m.user.id} match={m} kind={kind} />)}
        </section>
      )}

      {stack.isLoading ? (
        <Spinner label="Scoring compatibility…" />
      ) : atCapacity ? (
        <EngagedPanel chat={activeChat} openChats={openChats} cap={chatCap} />
      ) : top ? (
        <>
          {/* Top match first */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Your top match</h2>
            <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 999, padding: '3px 11px' }}>
              {bandFor(top.score).name} · {top.score}%
            </span>
          </div>
          <MatchCard match={top} kind={kind} />

          {/* HOW THIS LIST WAS ORDERED (H2).
              Recommendations follow what you pick now, so the percentage is
              about you as well as about them — and that has to be on the screen
              showing it, not only in the commit that changed it. It renders
              whether or not anything has been learned: "ranked the standard way,
              six more decisions to go" is the same promise kept. */}
          {stack.data?.ranking && (
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '10px 0 0' }}>
              {stack.data.ranking.headline}
              {stack.data.ranking.notes.length > 0 && (
                <span style={{ display: 'block', marginTop: 4 }}>{stack.data.ranking.notes[0]}</span>
              )}
            </p>
          )}

          {/* Division / breakdown below the card — only once there are real people */}
          {stack.data && stack.data.totalCandidates > 0 && (
            <Distribution bands={stack.data.distribution} total={stack.data.totalCandidates} highlightScore={top.score} />
          )}

          {/* Everyone else, grouped by the same categories the pool is counted
              in, each group best-first, each card carrying its own percentage. */}
          {rest.length > 0 && (
            <section style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 18, margin: 0 }}>Everyone else</h2>
                <span className="muted" style={{ fontSize: 12 }}>
                  {rest.length} more {rest.length === 1 ? 'person' : 'people'}
                </span>
              </div>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 18px' }}>
                Every resident who fits what you asked for, strongest first, grouped by
                compatibility. The percentage is our reading of the two of you — a starting
                point, not a verdict — and who you reach out to is your call.
              </p>
              {byCategory(rest).map((group) => (
                <section key={group.label} style={{ marginBottom: 22 }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                    margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--line)',
                  }}>
                    <h3 style={{ fontSize: 15, margin: 0 }}>{group.name}</h3>
                    <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 999, padding: '3px 10px' }}>
                      {group.label}
                    </span>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                      {group.matches.length} {group.matches.length === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  {group.matches.map((m) => <MatchCard key={m.user.id} match={m} kind={kind} />)}
                </section>
              ))}
            </section>
          )}
        </>
      ) : (
        <EmptyState
          icon="🌙"
          title={kind === 'romantic' ? 'No one to show just yet' : 'No new friends to show yet'}
          hint="Your city is just getting started here. As more residents join, your strongest match will appear — check back soon."
        />
      )}
    </div>
  );
}

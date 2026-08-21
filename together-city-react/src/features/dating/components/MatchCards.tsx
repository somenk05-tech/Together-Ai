import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import {
  useLikeMatch, usePassMatch, useLikeAllowance, useSuperLike, useUndoPass,
  type CuratedMatch, type MatchKind, type CompatibilityBand, type DatingChatSummary,
} from '../api';
import { SafetyMenu } from './SafetyMenu';

/**
 * ── HOW A PERSON IS DRAWN IN THE DATING HUB ─────────────────────────────────
 *
 * Every one of these lived inside `pages/DatingMatches.tsx` as a module-private
 * function, because for a long time there was only one room that drew people.
 * There are two now — Potential Matches, where the whole city is browsed, and
 * Curated Matches, where the people who chose you back are kept — and a card
 * that means one thing on one page and something slightly different on the
 * other is how two rooms start disagreeing about what a percentage is.
 *
 * So this file is a MOVE, not a rewrite: the components are the ones that
 * shipped, with their reasoning intact. The `.mstack` family they wear is
 * already global in relief.css, so nothing about their material changed on the
 * way out of the page.
 */

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
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--scrim-deep) 0%, var(--scrim-top) 44%, var(--scrim-clear) 70%)' }} />
      <div style={{ position: 'absolute', top: 12, right: 12, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.45))' }}>
        <ScoreRing score={score} />
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12, color: 'var(--on-accent)' }}>
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

/**
 * THE MATCH STACK.
 *
 * Owner's reference: one card face-up with the photograph, the rest showing
 * only their foot. The foot is what makes it a list rather than a pile — name,
 * one line, one action — so the deck can be read without opening anything.
 *
 * TAPPING A BURIED FOOT BRINGS THAT PERSON FORWARD; tapping the PHOTOGRAPH
 * opens the whole profile. Two different targets on one card, which is the
 * only part of this that needs saying out loud: the picture is a link, the
 * foot is a control.
 *
 * BELOW THREE IT DOES NOT FAN. A stack of two is a pile of two things
 * pretending to be a deck, and this hub's promise is that the page is not
 * busy. Under the threshold they render as ordinary cards side by side.
 */
const STACK_MAX = 6;
const STACK_FANS_AT = 3;

export function MatchStack({ people, kind }: { people: CuratedMatch[]; kind: MatchKind }) {
  const [front, setFront] = useState(0);
  const shown = people.slice(0, STACK_MAX);
  const fans = shown.length >= STACK_FANS_AT;
  // The order the deck is drawn in: whoever is at the front comes first, and
  // everybody else keeps their ranking behind them. Re-ordering the array
  // rather than juggling z-index means the DOM order and the visual order are
  // the same thing, which is what keyboard and screen-reader users get.
  const order = fans
    ? [shown[front], ...shown.filter((_, i) => i !== front)]
    : shown;

  return (
    <div className={`mstack${fans ? '' : ' mflat'}`}
      style={fans ? { height: `calc(${(380 * 4) / 3}px + ${(shown.length - 1) * 62}px)` } : undefined}>
      {order.map((m, row) => {
        const isTop = row === 0;
        const photo = m.photos?.[0];
        const href = `/dating/match?u=${m.user.id}&kind=${kind}`;
        const label = `${m.user.name}${m.age ? `, ${m.age}` : ''}`;
        return (
          <article key={m.user.id} className="mcard"
            style={{ ['--mrow' as string]: row, transform: fans ? `translateY(${row * 62}px)` : undefined }}>
            {isTop && (
              <>
                <span className="mpct">◈ {m.score}%</span>
                <div className="mtop">
                  <span className="mbadge">★ {bandFor(m.score).name}</span>
                  <p className="mwho">{label}</p>
                </div>
              </>
            )}
            {/* THE PICTURE IS THE LINK. A whole card that navigates would make
                the foot's own button a button inside a link. */}
            <Link to={href} aria-label={`Open ${m.user.name}'s profile`} style={{ display: 'block' }}>
              {photo
                ? <img className="mshot" src={photo} alt="" loading="lazy" />
                : <span className="mshot" style={{ display: 'grid', placeItems: 'center', background: 'var(--accent-soft)',
                    color: 'var(--accent-ink)', fontSize: 54, fontFamily: 'var(--serif)' }}>{m.user.name.slice(0, 1)}</span>}
            </Link>
            <div className="mfoot">
              {photo
                ? <img className="mav" src={photo} alt="" loading="lazy" />
                : <span className="tc-avatar mav" aria-hidden>{m.user.name.slice(0, 1)}</span>}
              <span className="mname">
                <b>{label}</b>
                <i>{m.theirSign} · {m.score}% match</i>
              </span>
              {isTop
                ? <Link to={href} className="mgo on">Say hello</Link>
                : <button type="button" className="mgo"
                    onClick={() => setFront(shown.findIndex((x) => x.user.id === m.user.id))}>
                    Connect
                  </button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function MatchCard({ match, kind }: { match: CuratedMatch; kind: MatchKind }) {
  const like = useLikeMatch(kind);
  const pass = usePassMatch(kind);
  const superLike = useSuperLike(kind);
  const allowance = useLikeAllowance();
  const [result, setResult] = useState<{ matched: boolean; conversationId: string | null } | null>(null);
  // The server is the authority on the limit; this only decides what the button
  // looks like before it is pressed. A refusal still arrives as a real message.
  const supersLeft = allowance.data?.supersLeft ?? 0;
  const outOfLikes = (allowance.data?.likesLeft ?? 1) < 1;
  const limitError = (like.error ?? superLike.error) as { response?: { data?: { message?: string } } } | null;

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
            <span key={i} className="pill" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '4px 12px', fontSize: 12 }}>
              {i}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {matched ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-ink)' }}>💫 It’s a match!</span>
            {/* AND WHERE IT NOW LIVES. A like that lands a match moves this
                person into Curated Matches; saying so is the difference between
                a card that changed and a person who has quietly moved rooms. */}
            <Link to="/dating/matches" style={{ fontSize: 12.5, fontWeight: 700 }}>They’re in Curated Matches now →</Link>
            {match.conversationId
              ? <Link to={`/dating/chats?c=${match.conversationId}`}><Button variant="accent" size="sm">💬 Open chat</Button></Link>
              : <Link to={detailHref}><Button variant="accent" size="sm">💬 Connect to Chat</Button></Link>}
          </div>
        ) : (
          <>
            {/* A refused like is not a failed request — it is the rule speaking,
                and the server's sentence already says when it lifts. */}
            {limitError?.response?.data?.message && (
              <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-soft)', background: 'var(--paper)', borderRadius: 8, padding: '8px 11px' }}>
                {limitError.response.data.message}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="accent" size="sm" disabled={like.isPending}
                onClick={() => like.mutate(match.user.id, { onSuccess: (r) => setResult(r) })}
              >
                {like.isPending ? '…' : kind === 'romantic' ? '♥ Like' : '＋ Connect'}
              </Button>
              {/* One a day, and it says which day it is. Scarcity you cannot see
                  is a counter, not scarcity — so the count is on the button. */}
              {kind === 'romantic' && (
                <Button
                  variant="line" size="sm"
                  disabled={superLike.isPending || supersLeft < 1 || outOfLikes}
                  title={supersLeft < 1
                    ? `Your super-like comes back at midnight (${allowance.data?.resetsAtLocal ?? 'your local time'}).`
                    : 'They will be told you used your one super-like of the day on them.'}
                  onClick={() => superLike.mutate(match.user.id, { onSuccess: (r) => setResult({ matched: r.matched, conversationId: null }) })}
                >
                  {superLike.isPending ? '…' : `⭐ Super-like${supersLeft > 0 ? ` (${supersLeft})` : ''}`}
                </Button>
              )}
              {/* "Skip", not "Pass" — the match detail page has always said Skip,
                  and the same action on two screens should not have two names. */}
              <Button variant="line" size="sm" disabled={pass.isPending || outOfLikes} onClick={() => pass.mutate(match.user.id)}>
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
                ? 'You’ve liked them. They’re notified only if you both like each other — and the moment they do, they move to Curated Matches and chat opens.'
                : 'They’re notified only if you both like each other. That moves them to Curated Matches, and chat opens there.'}
            </p>
          </>
        )}
      </div>
      </div>
    </article>
  );
}

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
const inBand = (score: number, lo: number, hi: number) => score >= lo && (score < hi || (hi === 100 && score <= 100));

function bandFor(score: number): { label: string; name: string } {
  for (const [lo, hi, name] of BAND_NAMES) {
    if (inBand(score, lo, hi)) return { label: `${lo}–${hi}%`, name };
  }
  return { label: `${score}%`, name: 'Match' };
}

/** The candidates grouped into those categories, best first, empty ones dropped.
 *  One pass over BAND_NAMES so the group headers, the counts in them and the
 *  histogram can never disagree about which category somebody is in. */
export function byCategory(matches: CuratedMatch[]): { name: string; label: string; matches: CuratedMatch[] }[] {
  return BAND_NAMES
    .map(([lo, hi, name]) => ({
      name,
      label: `${lo}–${hi}%`,
      matches: matches
        .filter((m) => inBand(m.score, lo, hi))
        .sort((a, b) => b.score - a.score),
    }))
    .filter((g) => g.matches.length > 0);
}

/**
 * The same histogram the server used to send, counted off the list on screen.
 *
 * `/dating/stack` computes a `distribution`; `/dating/discover` does not, and
 * Potential Matches is built on discover because discover is the endpoint that
 * returns EVERYONE. Counting the bands from the very array being rendered is
 * better than either: the summary cannot disagree with the list beneath it,
 * because it is made of it.
 */
export function bandsOf(matches: CuratedMatch[]): CompatibilityBand[] {
  return BAND_NAMES.map(([lo, hi]) => ({
    label: `${lo}–${hi}`,
    min: lo,
    max: hi,
    count: matches.filter((m) => inBand(m.score, lo, hi)).length,
  }));
}

/** Compatibility-band histogram — only rendered once there are real people, and
 *  only for bands that actually contain someone. The top match's own band is
 *  highlighted so the user sees which category they're being shown. */
export function Distribution({ bands, total, highlightScore }: { bands: CompatibilityBand[]; total: number; highlightScore?: number }) {
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
              <div style={{ flex: 1, height: 16, borderRadius: 'var(--r-full)', background: 'var(--paper)', overflow: 'hidden', outline: isTop ? '1.5px solid var(--accent)' : 'none' }}>
                <div style={{ height: '100%', width: `${Math.max(6, (b.count / max) * 100)}%`, background: 'var(--accent)', opacity: 0.4 + 0.55 * (b.min / 100), borderRadius: 'var(--r-full)' }} />
              </div>
              <span style={{ width: 30, textAlign: 'right', fontSize: 12.5, fontWeight: 700, flex: 'none' }}>{b.count}</span>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
        Everyone here fits what you asked for. They are listed strongest first and grouped by
        category, so you can start at the top or go looking — the percentage is our reading of
        the two of you, and the choice is yours.
      </p>
    </div>
  );
}

/** Shown once the conversation cap is reached. It sits BELOW the matches rather
 *  than replacing them — a match is not something to hide from the person who
 *  made it, and the cap is about starting a new chat, not about looking. */
export function EngagedPanel({ chat, openChats, cap }: { chat: DatingChatSummary | null; openChats: number; cap: number }) {
  return (
    <div className="card" style={{ padding: '22px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 34 }}>💬</div>
      <h2 style={{ fontSize: 17, margin: '6px 0 4px' }}>
        {openChats === 1 ? `You’re getting to know ${chat ? chat.name : 'someone'}` : `You have ${openChats} conversations going`}
      </h2>
      <p className="muted" style={{ fontSize: 13, margin: '0 auto 16px', maxWidth: 380, lineHeight: 1.55 }}>
        Intentional dating means a few conversations, not endless ones — {cap} at a time.
        What is paused is starting another one, not looking: your matches stay on this page and
        the whole city stays in Potential Matches. Unmatch one and the next chat opens.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to={chat ? `/dating/chats?c=${chat.conversationId}` : '/dating/chats'}><Button variant="accent">Open your chat</Button></Link>
        <Link to="/dating/chats"><Button variant="line">Dating chats</Button></Link>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>To start another, unmatch one of these first.</p>
    </div>
  );
}

/**
 * Today's allowance, and the way back from a skip. (M2.)
 *
 * The undo says WHO it gave back. "Undone" on its own leaves somebody scanning
 * a list for a face they only half-saw, which is the state that made them want
 * undo in the first place.
 */
export function UndoAndAllowance({ kind }: { kind: MatchKind }) {
  const allowance = useLikeAllowance();
  const undo = useUndoPass(kind);
  const [said, setSaid] = useState<string | null>(null);
  const a = allowance.data;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, fontSize: 12.5 }}>
      <Button
        variant="line" size="sm" disabled={undo.isPending}
        onClick={() => undo.mutate(undefined, {
          onSuccess: (r) => setSaid(r.undone
            ? (r.theyLiked ? 'Skip undone — and they had already liked you.' : 'Skip undone — they are back in your matches.')
            : r.reason),
        })}
      >
        {undo.isPending ? '…' : '↩ Undo last skip'}
      </Button>
      {/* Only ever the real numbers: while the read is in flight this says
          nothing rather than guessing at a count. */}
      {a && (
        <span className="muted">
          {a.likesLeft} of {a.dailyLikes} likes left today
          {a.supersLeft > 0 ? ` · ⭐ ${a.supersLeft}` : ' · ⭐ used'}
        </span>
      )}
      {said && <span style={{ color: 'var(--ink-soft)' }}>{said}</span>}
    </div>
  );
}

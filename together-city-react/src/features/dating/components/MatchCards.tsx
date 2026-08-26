import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import {
  useLikeMatch, usePassMatch, useLikeAllowance, useSuperLike, useUndoPass,
  type CuratedMatch, type MatchKind, type CompatibilityBand, type DatingChatSummary,
} from '../api';
import { SafetyMenu } from './SafetyMenu';
// The band table, its names and inks, live in their own module: react-refresh
// cannot hot-reload a file that exports both components and plain functions,
// and three pages read these without rendering a single card. (The coverage
// sentence moved to the profile with the breakdown it explains — 26 Aug.)
import { bandFor } from '../bands';

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

/**
 * ── THE PERSON, FULL BLEED (owner, 26 Aug, with a reference) ────────────────
 *
 * The reference: one large photograph, the name and age in white ON it, where
 * they are, "Compatibility 92%", story-style segments across the top, "× Skip"
 * translucent and "♡ Connect" prominent at the foot. Nothing else. The bio,
 * the seven factor numbers, the interest pills and the coverage sentence all
 * moved to the profile a tap away — that page is where the decision to meet a
 * stranger is made, and the card's job is only to make somebody open it.
 *
 * WHAT SURVIVED THE REDRAW, deliberately:
 *   · the safety menu, under the photograph. Most people never open the detail
 *     page, and "I had to go looking for it" is exactly the failure this
 *     control exists to prevent.
 *   · the super-like, its count on the button, and the server's own sentence
 *     when an allowance refuses — the rule speaking, not a failed request.
 *   · "They're in Curated Matches now": a connection is a person quietly
 *     moving rooms, and the card says so where it happens.
 *   · "Skip", not "Pass" — the same action on two screens keeps one name.
 *
 * THE WORD ON THE BUTTON IS "CONNECT" because the owner's reference writes it
 * on the button. The room's rule at the top of the page still speaks of likes
 * — that copy is the owner's own three lines, pinned by its test — so the
 * captions here say "choose each other", which is both in one word.
 *
 * THE PHOTOGRAPH CARRIES A view-transition-name, and the profile's hero
 * carries the same one, so on browsers that support it the tap-through is the
 * picture growing into the page rather than a cut. Everywhere else the
 * attribute is inert and navigation is what it always was.
 */
export function MatchCard({ match, kind }: { match: CuratedMatch; kind: MatchKind }) {
  const like = useLikeMatch(kind);
  const pass = usePassMatch(kind);
  const superLike = useSuperLike(kind);
  const allowance = useLikeAllowance();
  const [result, setResult] = useState<{ matched: boolean; conversationId: string | null } | null>(null);
  const [shot, setShot] = useState(0);
  const touchX = useRef<number | null>(null);
  // The server is the authority on the limit; this only decides what the button
  // looks like before it is pressed. A refusal still arrives as a real message.
  const supersLeft = allowance.data?.supersLeft ?? 0;
  const outOfLikes = (allowance.data?.likesLeft ?? 1) < 1;
  const limitError = (like.error ?? superLike.error) as { response?: { data?: { message?: string } } } | null;

  const matched = result?.matched || match.matched;
  const chosen = match.likedByMe && !matched;
  const photos = match.photos ?? [];
  const n = photos.length;
  const active = Math.min(shot, Math.max(0, n - 1));
  const go = (delta: number) => setShot((x) => (n ? (x + delta + n) % n : 0));
  const detailHref = `/dating/match?u=${match.user.id}&kind=${kind}`;
  const band = bandFor(match.score);
  const label = `${match.user.name}${match.age ? `, ${match.age}` : ''}`;
  const conversationId = result?.conversationId ?? match.conversationId;

  // Same gesture, same threshold, as the profile's collage: a horizontal drag
  // past 40px is a swipe between photographs; anything shorter is a tap and
  // falls through to whatever was tapped.
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40 && n > 1) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return (
    <article className="pmatch">
      <div className="pm-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        style={{ viewTransitionName: `pm-${match.user.id}` } as React.CSSProperties}>
        {photos[active]
          ? <img className="pm-shot" src={photos[active]} alt={label} loading="lazy" draggable={false} />
          : <span className="pm-letter" aria-hidden>{match.user.name.slice(0, 1)}</span>}
        <div className="pm-scrim" aria-hidden />
        {n > 1 && (
          <div className="pm-segs" aria-hidden>
            {photos.map((_, k) => <span key={k} className={`pm-seg${k === active ? ' is-on' : ''}`} />)}
          </div>
        )}
        {n > 1 && !matched && (
          <>
            <button type="button" className="pm-zone is-l" aria-label="Previous photo" onClick={() => go(-1)} />
            <button type="button" className="pm-zone is-r" aria-label="Next photo" onClick={() => go(1)} />
          </>
        )}
        <Link to={detailHref} className="pm-id" viewTransition aria-label={`Open ${match.user.name}’s profile`}>
          <h3 className="dating-display pm-name">{label} <span className="pm-go" aria-hidden>›</span></h3>
          {match.city && <p className="pm-where"><span aria-hidden>📍</span> {match.city}</p>}
          <p className="pm-compat"><b>{match.score}%</b> Compatible · {band.name}</p>
        </Link>
        {matched ? (
          <div className="pm-hit">
            <h3 className="dating-display">It’s a Connection</h3>
            {/* AND WHERE THEY NOW LIVE. A connection is this person quietly
                moving rooms; saying so is the difference between a card that
                changed and a journey the citizen was promised. */}
            <p>You chose each other.</p>
            <Link to="/dating/matches">They’re in Curated Matches now →</Link>
            <div style={{ marginTop: 12 }}>
              {conversationId
                ? <Link to={`/dating/chats?c=${conversationId}`}><Button variant="accent" size="sm">💬 Open chat</Button></Link>
                : <Link to={detailHref}><Button variant="accent" size="sm">💬 Connect to Chat</Button></Link>}
            </div>
          </div>
        ) : (
          <div className="pm-acts">
            <button type="button" className="pm-skip" disabled={pass.isPending || outOfLikes}
              onClick={() => pass.mutate(match.user.id)}>
              <span aria-hidden>✕</span> Skip
            </button>
            <button type="button" className="pm-connect" disabled={like.isPending || chosen}
              onClick={() => like.mutate(match.user.id, { onSuccess: (r) => setResult(r) })}>
              {like.isPending ? '…' : chosen ? '♡ Chosen' : <><span aria-hidden>♡</span> Connect</>}
            </button>
          </div>
        )}
      </div>

      {/* A refused like is not a failed request — it is the rule speaking,
          and the server's sentence already says when it lifts. */}
      {!matched && limitError?.response?.data?.message && (
        <p className="pm-said">{limitError.response.data.message}</p>
      )}

      {!matched && (
        <div className="pm-under">
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
          <SafetyMenu userId={match.user.id} kind={kind} compact />
        </div>
      )}
      {!matched && (
        <p className="pm-fine">
          {chosen
            ? 'You’ve chosen them. They’ll only know if they choose you back — then chat opens in Curated Matches.'
            : 'They’re notified only if you both choose each other. That moves them to Curated Matches, and chat opens there.'}
        </p>
      )}
    </article>
  );
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
        Everyone here fits what you asked for, listed strongest first. Nine tenths of the
        percentage is your two charts; the rest is what you have both answered.
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
        Intentional dating means {cap} conversations at a time. Your matches stay right
        here — unmatch one and the next chat opens.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to={chat ? `/dating/chats?c=${chat.conversationId}` : '/dating/chats'}><Button variant="accent">Open your chat</Button></Link>
        <Link to="/dating/chats"><Button variant="line">Dating chats</Button></Link>
      </div>
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

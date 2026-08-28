import { useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { payError } from '@/features/financial/api';
import {
  useMatchDetail, useLikeMatch, usePassMatch, useConnectChat, useUnmatch,
  type MatchKind, type MatchDetail,
} from '../api';
import { EmailConfirmed, EMAIL_CONFIRMED_NOTE, SelfieOnFile, SELFIE_ON_FILE_NOTE } from '../components/SelfieOnFile';
import { SafetyMenu } from '../components/SafetyMenu';
import { bandFor, coverageNote } from '../bands';

const photoBox: CSSProperties = { position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'var(--paper)' };
const cover: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
const pill: CSSProperties = { border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '5px 13px', fontSize: 12.5, background: 'var(--accent-soft)' };
/** The two marks on the name, in words. Both wear this — one sentence per
 *  thing actually checked, in the same voice, so neither reads as the
 *  stronger claim. */
const checkNote: CSSProperties = { fontSize: 11.5, lineHeight: 1.55, margin: '10px 2px 0' };

/**
 * THE BAND COMES FROM ONE TABLE NOW, and it is `bandFor` in `bands.ts`.
 *
 * What stood here was three rows with no floor: anything under 75 returned a
 * green "Good Match" with "Some real things in common", so a 9% opened on this
 * page as a Good Match while the browse page — one tap away, same number —
 * called the same person "Little in common". The blurb went with it rather than
 * being re-banded, because it was inventing an assessment the engine had not
 * made; when there is no reason to show, the panel now says nothing.
 */

/** Swipeable photo gallery — matched users can slide/scroll through every photo.
 *  Swipe (touch), tap the left/right half, use the dots, or click a thumbnail. */
function Collage({ d }: { d: MatchDetail }) {
  const photos = d.photos ?? [];
  const n = photos.length;
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const active = Math.min(i, Math.max(0, n - 1));
  const go = (delta: number) => setI((x) => (n ? (x + delta + n) % n : 0));
  const goal = d.relationshipGoal || 'a connection';
  const location = [d.city, d.state].filter(Boolean).join(', ');

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return (
    <div>
      {/* The same view-transition-name the browse card's photograph carries,
          so on browsers that support it the tap-through is the picture growing
          into this page rather than a cut. Inert everywhere else. */}
      <div style={{ ...photoBox, aspectRatio: '4 / 5', touchAction: 'pan-y', viewTransitionName: `pm-${d.user.id}` } as CSSProperties} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {photos[active]
          ? <img src={photos[active]} alt={`${d.name} photo ${active + 1}`} style={cover} draggable={false} />
          : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 64, color: 'var(--accent-ink)', background: 'var(--accent-soft)', fontFamily: 'var(--serif)' }}>{d.name.slice(0, 1)}</div>}

        {/* tap zones for prev/next */}
        {n > 1 && <>
          <button type="button" aria-label="Previous photo" onClick={() => go(-1)} style={{ position: 'absolute', inset: '0 62% 22% 0', border: 'none', background: 'transparent', cursor: 'pointer' }} />
          <button type="button" aria-label="Next photo" onClick={() => go(1)} style={{ position: 'absolute', inset: '0 0 22% 62%', border: 'none', background: 'transparent', cursor: 'pointer' }} />
        </>}

        {/* progress dots */}
        {n > 1 && (
          <div style={{ position: 'absolute', top: 10, left: 12, right: 12, display: 'flex', gap: 4 }}>
            {photos.map((_, k) => (
              <button key={k} type="button" aria-label={`Photo ${k + 1}`} onClick={() => setI(k)}
                style={{ minWidth: 44, minHeight: 44, flex: 1, height: 3, borderRadius: 2, border: 'none', padding: 0, cursor: 'pointer', background: k === active ? 'var(--on-scrim)' : 'var(--on-scrim-dim)' }} />
            ))}
          </div>
        )}

        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--scrim-deep) 0%, var(--scrim-top) 46%, var(--scrim-clear) 72%)', pointerEvents: 'none' }} />
        <span style={{ position: 'absolute', top: 22, left: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11.5, fontWeight: 700, borderRadius: 'var(--r-full)', padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.3)' }}>
          <span aria-hidden>✦</span> Intentional Dating
        </span>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16, color: 'var(--on-accent)', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--serif)', fontSize: 29, fontWeight: 700, lineHeight: 1.05, textShadow: '0 2px 14px rgba(0,0,0,.5)' }}>
            <span>{d.name}{d.age ? `, ${d.age}` : ''}</span>
            <EmailConfirmed on={d.verified} />
            <SelfieOnFile on={Boolean(d.selfieOnFile)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, marginTop: 4, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
            Looking for <strong style={{ color: 'var(--danger-line)', fontWeight: 700 }}>{goal}</strong>
            <span aria-hidden style={{ color: 'var(--danger-line)' }}>♥</span>
          </div>
          {location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginTop: 6, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
              <span aria-hidden>📍</span>{location}
            </div>
          )}
        </div>
      </div>

      {/* The marker on the name, in words. This is the screen where somebody
          decides whether to meet a stranger, so the limits of what we checked
          belong here rather than in a tooltip nobody hovers. */}
      {d.verified && (
        <p className="muted" style={checkNote}>✉ {EMAIL_CONFIRMED_NOTE}</p>
      )}
      {d.selfieOnFile && (
        <p className="muted" style={checkNote}>📷 {SELFIE_ON_FILE_NOTE}</p>
      )}

      {/* Thumbnail strip — scroll/click through every photo */}
      {n > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 2px 2px', WebkitOverflowScrolling: 'touch' }}>
          {photos.map((p, k) => (
            <button key={k} type="button" onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`}
              style={{ flex: 'none', width: 58, height: 58, borderRadius: 'var(--r-1)', overflow: 'hidden', padding: 0, cursor: 'pointer',
                border: `2px solid ${k === active ? 'var(--accent)' : 'transparent'}`, opacity: k === active ? 1 : 0.75, background: 'none' }}>
              <img src={p} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ── THE PROFILE, READ AS A PAGE (owner, 26 Aug, same brief as the card) ─────
 *
 * The card upstairs now shows only the photograph and four facts, so this page
 * carries everything it used to split with the card, in the reference's order:
 * the number and the sentence under it, WHY — seven horizontal indicators
 * instead of seven numbers in a grid — then the person in their own words, the
 * facts of a life, what you would share, and what does not fit. The decision
 * rides the foot of the screen (`.pd-bar`) instead of waiting at the foot of
 * the page.
 *
 * The factor bars are the same seven numbers the grid drew, from the same
 * `d.breakdown` — a redraw, not a second engine. The thesis sentence stays
 * word for word: it is the page where the number is weighed.
 */
function Detail({ d, targetUserId, kind }: { d: MatchDetail; targetUserId: string; kind: MatchKind }) {
  const like = useLikeMatch(kind);
  const pass = usePassMatch(kind);
  const connect = useConnectChat(kind);
  const unmatch = useUnmatch(kind);
  const navigate = useNavigate();
  const [liked, setLiked] = useState(d.matched);

  const matched = liked || d.matched;
  const life: [string, string | null][] = [
    ['Height', d.heightCm ? `${d.heightCm} cm` : null],
    ['Languages', d.languages.length ? d.languages.join(', ') : null],
    ['Zodiac sign', d.theirSign || null],
    ['Education', d.education],
    ['Occupation', d.occupation],
    ['Diet', d.diet],
    ['Smoking', d.smoking],
    ['Drinking', d.drinking],
    ['Fitness', d.fitnessLevel],
  ];
  const shown = life.filter((row): row is [string, string] => Boolean(row[1]));
  const traits = [...d.values, ...d.personalityTraits];
  const band = bandFor(d.score);
  const covNote = coverageNote(d.coverage);

  // Connecting is free (26 Aug). The wallet path and its toast are gone with it.
  const doConnect = () => connect.mutate(
    { targetUserId },
    { onSuccess: (r) => navigate(`/dating/chats?c=${r.conversationId}`) },
  );

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        <Link to="/dating/matches" style={{ color: 'var(--muted)' }}>← Curated Matches</Link>
      </div>

      <div className="card" style={{ padding: 16, borderRadius: 22 }}>
        <Collage d={d} />

        {/* ── THE NUMBER, AND THE SENTENCE UNDER IT ────────────────────────
            One line of large type rather than a boxed panel with a heart in
            it: the reference's rule is that the number is the hero and a
            badge is a costume. The band's own ink says what kind of number
            it is; the first reason says why in words. */}
        <section className="pd-sec">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="dating-display" style={{ fontSize: 'var(--fs-9)', lineHeight: 1 }}>{d.score}%</span>
            <span style={{ fontSize: 'var(--fs-5)', fontWeight: 700, color: band.ink }}>{band.name}</span>
            <span className="muted" style={{ fontSize: 'var(--fs-3)' }}>Compatibility</span>
          </div>
          {d.reasons[0] && <p className="pd-sub" style={{ margin: '6px 0 0' }}>{d.reasons[0]}</p>}
        </section>

        {/* ── WHY — the seven factors as indicators, not a grid.
            `d.breakdown` has always arrived here; this is the same seven
            numbers redrawn, not a second engine. */}
        {d.breakdown && (
          <section className="pd-sec">
            <h2>Why you’re compatible</h2>
            {/* The thesis, in one sentence, on the page where the number is
                weighed. The weights are the engine's (matching.ts): nine
                tenths is the two charts; the other tenth is what you both
                said you want. A reader who disagrees with that can read the
                seven indicators below and decide for themselves. */}
            <p className="pd-sub">
              Nine tenths of this number is how your two charts sit together. The rest is what you both said you want — goals, values, personality, lifestyle, interests, distance.
            </p>
            {([['Astrology', d.breakdown.astrology], ['Personality', d.breakdown.personality], ['Goals', d.breakdown.relationshipGoals], ['Values', d.breakdown.values], ['Lifestyle', d.breakdown.lifestyle], ['Interests', d.breakdown.interests], ['Location', d.breakdown.location]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="pd-fac">
                <span>{k}</span>
                <div className="pd-track" role="img" aria-label={`${k}: ${v}%`}>
                  <div className="pd-fill" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
                </div>
                <b>{v}%</b>
              </div>
            ))}
            {covNote && <p className="pd-sub" style={{ margin: '10px 0 0' }}>{covNote}</p>}
          </section>
        )}

        {/* ── THE PERSON IN THEIR OWN WORDS ───────────────────────────────── */}
        {((d.bio && d.bio.trim()) || traits.length > 0) && (
          <section className="pd-sec">
            <h2>About {d.name}</h2>
            {d.bio && d.bio.trim() && (
              <p style={{ fontSize: 'var(--fs-5)', lineHeight: 1.6, margin: 0, color: 'var(--ink-soft)' }}>{d.bio}</p>
            )}
            {traits.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                {traits.map((v, k) => <span key={`${v}-${k}`} style={pill}>{v}</span>)}
              </div>
            )}
          </section>
        )}

        {/* ── THE FACTS OF A LIFE. Only the answered ones: an absent fact
            draws nothing, because a dash row is a form and this is a person. */}
        {shown.length > 0 && (
          <section className="pd-sec">
            <h2>Life details</h2>
            <dl className="pd-life">
              {shown.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
        )}

        {d.interests.length > 0 && (
          <section className="pd-sec">
            <h2>Interests</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {d.interests.map((i) => <span key={i} style={pill}>{i}</span>)}
            </div>
          </section>
        )}

        {/* ── YOUR CONNECTION — what you would share, and what to explore.
            Both lists from the engine's own sentences; a page that only ever
            agrees with itself reads as a sales pitch, so the frictions stay. */}
        {((d.reasons.length > 1) || (d.frictions && d.frictions.length > 0)) && (
          <section className="pd-sec">
            <h2>Your connection</h2>
            {d.reasons.length > 1 && (
              <ul className="dt-reasons">
                {d.reasons.slice(1).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            {d.frictions && d.frictions.length > 0 && (
              <>
                <div className="dt-why">One thing to explore</div>
                <ul className="dt-reasons is-friction">
                  {d.frictions.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </>
            )}
          </section>
        )}

        {(connect.isError || unmatch.isError) && (
          <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 10 }}>{payError(connect.error ?? unmatch.error)}</p>
        )}

        {/* ── THE DECISION, RIDING THE FOOT OF THE SCREEN ──────────────────
            On a page this long the buttons used to sit below four screens of
            reading. Sticky, over its own fade, clear of the home indicator. */}
        <div className="pd-bar">
          {matched ? (
            /* NO SKIP ONCE YOU ARE MATCHED.
               Skip is what you do to a stranger the city is offering you: it
               passes, and the queue moves on. After a match it sat beside
               Connect and Unmatch as a third thing that also removed the
               person, in a quieter word — two doors out of one room, one of
               them ambiguous. Somebody who wants out has Unmatch, which says
               what it does and asks before it does it. */
            <>
              <Button variant="accent" size="md" disabled={connect.isPending} onClick={doConnect}>
                {connect.isPending ? 'Connecting…' : '💬 Connect to Chat'}
              </Button>
              <Button variant="line" size="md" disabled={unmatch.isPending}
                onClick={() => { if (window.confirm('Unmatch this person? They’ll be removed from your matches.')) unmatch.mutate(targetUserId, { onSuccess: () => navigate('/dating/matches') }); }}
                style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)', flex: 'none' }}>
                Unmatch
              </Button>
            </>
          ) : (
            <>
              <Button variant="line" size="md" disabled={pass.isPending} style={{ flex: 'none' }}
                onClick={() => pass.mutate(targetUserId, { onSuccess: () => navigate('/dating/matches') })}>
                ✕ Skip
              </Button>
              <Button variant="accent" size="md" disabled={like.isPending}
                onClick={() => like.mutate(targetUserId, { onSuccess: (r) => setLiked(r.matched) })}>
                {like.isPending ? '…' : '♡ Connect'}
              </Button>
            </>
          )}
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 4, textAlign: 'center' }}>
          {/* The same correction as the card: told, never told WHO. */}
          {matched ? 'Chat opens in the Dating Hub.' : 'They’ll be told someone liked them, never who.'}
        </p>
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <SafetyMenu userId={targetUserId} kind={kind} />
        </div>
      </div>
    </div>
  );
}

export function DatingMatchDetail() {
  const [params] = useSearchParams();
  const targetUserId = params.get('u');
  const kind = (params.get('kind') === 'platonic' ? 'platonic' : 'romantic') as MatchKind;
  const detail = useMatchDetail(targetUserId, kind);

  if (!targetUserId) {
    return <div className="page-note">
      <EmptyState icon="✨" title="No profile selected" hint="Open a profile from your Curated Matches." />
      <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/dating/matches"><Button variant="accent">Back to matches</Button></Link></div>
    </div>;
  }
  if (detail.isLoading) return <Spinner label="Opening the profile…" />;
  if (detail.isError || !detail.data) {
    // L3. The server answers every reason with the same 404 on purpose — "they
    // filtered you out" is not ours to disclose, and the reasoning is written
    // where that decision lives. So this stays vague about THEM.
    //
    // What it stopped being vague about is the one cause on the citizen's own
    // side. The old hint listed three possibilities — paused, hidden, no longer
    // a match — all of them about the other person, none of them actionable,
    // which is what made this a dead end rather than an answer. Narrowing your
    // own preferences does exactly this, and saying so leaks nothing about
    // anybody: it is a fact about your settings, and the link goes to them.
    return <div className="page-note">
      <EmptyState
        icon="🌙"
        title="This profile isn’t available"
        hint="They may have paused or hidden their profile — or your own preferences have narrowed since you last saw them."
      />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <Link to="/dating/matches"><Button variant="accent">Back to matches</Button></Link>
        <Link to="/dating/profile"><Button variant="line">Check your preferences</Button></Link>
      </div>
    </div>;
  }
  return <Detail d={detail.data} targetUserId={targetUserId} kind={kind} />;
}

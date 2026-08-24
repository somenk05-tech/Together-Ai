import { useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { successToast } from '@/components/form-validation';
import { payError } from '@/features/financial/api';
import {
  useMatchDetail, useLikeMatch, usePassMatch, useConnectChat, useUnmatch,
  type MatchKind, type MatchDetail,
} from '../api';
import { SelfieOnFile, SELFIE_ON_FILE_NOTE } from '../components/SelfieOnFile';
import { SafetyMenu } from '../components/SafetyMenu';

const photoBox: CSSProperties = { position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'var(--paper)' };
const cover: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
const sectionH: CSSProperties = { margin: '0 0 6px', fontSize: 14, fontWeight: 700 };
const pill: CSSProperties = { border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '5px 13px', fontSize: 12.5, background: 'var(--accent-soft)' };

function matchLabel(score: number): { label: string; blurb: string } {
  if (score >= 85) return { label: 'Great Match', blurb: 'You share similar values & life goals.' };
  if (score >= 75) return { label: 'Strong Match', blurb: 'Lots of common ground to build on.' };
  return { label: 'Good Match', blurb: 'Some real things in common — see where it goes.' };
}

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
      <div style={{ ...photoBox, aspectRatio: '4 / 5', touchAction: 'pan-y' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
                style={{ minWidth: 44, minHeight: 44, flex: 1, height: 3, borderRadius: 2, border: 'none', padding: 0, cursor: 'pointer', background: k === active ? 'var(--on-accent)' : 'rgba(255,255,255,.42)' }} />
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
            <SelfieOnFile on={d.verified} />
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
        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, margin: '10px 2px 0' }}>
          📷 {SELFIE_ON_FILE_NOTE}
        </p>
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

function Detail({ d, targetUserId, kind }: { d: MatchDetail; targetUserId: string; kind: MatchKind }) {
  const like = useLikeMatch(kind);
  const pass = usePassMatch(kind);
  const connect = useConnectChat(kind);
  const unmatch = useUnmatch(kind);
  const navigate = useNavigate();
  const [liked, setLiked] = useState(d.matched);

  const matched = liked || d.matched;
  const lifestyle = [d.diet, d.smoking && `${d.smoking} smoker`, d.drinking && `${d.drinking} drinker`, d.fitnessLevel].filter(Boolean) as string[];
  const traitPills = [...d.values, ...d.personalityTraits, ...lifestyle];
  const stats: [string, string, string][] = [
    ['📏', 'Height', d.heightCm ? `${d.heightCm} cm` : '—'],
    ['🌐', 'Languages', d.languages.length ? d.languages.join(', ') : '—'],
    ['✦', 'Zodiac Sign', d.theirSign || '—'],
  ];
  const ml = matchLabel(d.score);

  const doConnect = () => connect.mutate(
    { targetUserId, method: 'wallet' },
    {
      onSuccess: (r) => {
        if (r.chargedInr > 0) successToast(`Connected — ₹${r.chargedInr} charged from your wallet.`);
        navigate(`/dating/chats?c=${r.conversationId}`);
      },
    },
  );

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        <Link to="/dating/matches" style={{ color: 'var(--muted)' }}>← Curated Matches</Link>
      </div>

      <div className="card" style={{ padding: 16, borderRadius: 22 }}>
        <Collage d={d} />

        {/* Stat strip */}
        <div style={{ marginTop: 14, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 4px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {stats.map(([icon, k, v], i) => (
            <div key={k} style={{ padding: '2px 16px', borderLeft: i ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12.5 }}>
                <span aria-hidden style={{ color: 'var(--accent-ink)' }}>{icon}</span>{k}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Detail grid */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 24px' }}>
          {d.bio && d.bio.trim() && (
            <div><div style={sectionH}>👤 About Me</div><p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{d.bio}</p></div>
          )}
          {d.interests.length > 0 && (
            <div><div style={sectionH}>🎬 Interests</div><p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{d.interests.join(', ')}</p></div>
          )}
          {d.personalityTraits.length > 0 && (
            <div><div style={sectionH}>❤ Personality</div><p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{d.personalityTraits.join(', ')}</p></div>
          )}
          {d.values.length > 0 && (
            <div><div style={sectionH}>✦ Values</div><p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{d.values.join(', ')}</p></div>
          )}
        </div>

        {traitPills.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
            {traitPills.map((v, k) => <span key={`${v}-${k}`} style={pill}>{v}</span>)}
          </div>
        )}

        {/* Compatibility panel */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, background: 'linear-gradient(135deg,var(--accent-soft),var(--wash))', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px' }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--card)', border: '2px solid var(--accent)', color: 'var(--accent-ink)', fontSize: 24 }}>♥</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Compatibility</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-ink)' }}>{d.score}%</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ok-ink)' }}>{ml.label}</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>{d.reasons[0] ?? ml.blurb}</p>
            {d.frictions && d.frictions.length > 0 && (
              <p className="dt-note">
                <strong>One thing to explore — </strong>{d.frictions[0]}
              </p>
            )}
          </div>
        </div>

        {/* Intentional-dating notice */}
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--paper)', borderRadius: 'var(--r-2)', padding: '13px 16px' }}>
          <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--accent-ink)', color: 'var(--muted)', flex: 'none' }}>🔒</span>
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            <strong>We believe in intentional dating.</strong> You can have up to three conversations
            going at once. If one isn’t going anywhere, <strong>unmatch</strong> and move forward.
          </div>
        </div>

        {(connect.isError || unmatch.isError) && (
          <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 10 }}>{payError(connect.error ?? unmatch.error)}</p>
        )}

        {/* Actions */}
        <div style={{ marginTop: 16 }}>
          {matched ? (
            /* NO SKIP ONCE YOU ARE MATCHED.
               Skip is what you do to a stranger the city is offering you: it
               passes, and the queue moves on. After a match it sat beside
               Connect and Unmatch as a third thing that also removed the
               person, in a quieter word — two doors out of one room, one of
               them ambiguous. Somebody who wants out has Unmatch, which says
               what it does and asks before it does it. */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'stretch' }}>
              <Button variant="accent" size="md" disabled={connect.isPending} onClick={doConnect}>
                {connect.isPending ? 'Connecting…' : '💬 Connect to Chat'}
              </Button>
              <Button variant="line" size="md" disabled={unmatch.isPending}
                onClick={() => { if (window.confirm('Unmatch this person? They’ll be removed from your matches.')) unmatch.mutate(targetUserId, { onSuccess: () => navigate('/dating/matches') }); }}
                style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }}>
                Unmatch
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="accent" size="md" disabled={like.isPending}
                onClick={() => like.mutate(targetUserId, { onSuccess: (r) => setLiked(r.matched) })}>
                {like.isPending ? '…' : kind === 'romantic' ? '♥ Like' : '＋ Connect'}
              </Button>
              <Button variant="line" size="md" disabled={pass.isPending}
                onClick={() => pass.mutate(targetUserId, { onSuccess: () => navigate('/dating/matches') })}>
                ✕ Skip
              </Button>
            </div>
          )}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10, textAlign: 'center' }}>
            {matched ? 'Chat opens in the Dating Hub — up to three at a time. Your first 3 are free.' : 'They’re notified only if you both like each other.'}
          </p>
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <SafetyMenu userId={targetUserId} kind={kind} />
          </div>
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

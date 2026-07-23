import { useState, type CSSProperties } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { payError, type PayMethod } from '@/features/financial/api';
import { useMatchDetail, useLikeMatch, usePassMatch, useUnlockChat, type MatchKind, type MatchDetail } from '../api';

const astrocard: CSSProperties = {
  background: 'linear-gradient(135deg,rgba(183,110,121,.14),rgba(212,175,94,.10))',
  border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginTop: 10,
};

/** Full-bleed, swipeable photo gallery. Tap the left/right half or use the
 *  arrows / dots to move between photos; name, age, verified tick and the
 *  compatibility ring sit over the image. */
function Gallery({ photos, name, age, verified, theirSign, yourSign, score }: {
  photos: string[]; name: string; age: number; verified: boolean; theirSign: string; yourSign: string; score: number;
}) {
  const [i, setI] = useState(0);
  const n = photos.length;
  const go = (d: number) => setI((x) => (n ? (x + d + n) % n : 0));
  const src = photos[i];

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', borderRadius: 18, overflow: 'hidden', background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
      {src
        ? <img src={src} alt={name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 46, color: 'var(--accent)', background: 'var(--accent-soft)', fontFamily: 'var(--serif)' }}>{name.slice(0, 1)}</div>}

      {/* tap zones */}
      {n > 1 && <>
        <button aria-label="Previous photo" onClick={() => go(-1)} style={{ position: 'absolute', inset: '0 60% 0 0', border: 'none', background: 'transparent', cursor: 'pointer' }} />
        <button aria-label="Next photo" onClick={() => go(1)} style={{ position: 'absolute', inset: '0 0 0 60%', border: 'none', background: 'transparent', cursor: 'pointer' }} />
      </>}

      {/* progress dots */}
      {n > 1 && (
        <div style={{ position: 'absolute', top: 10, left: 12, right: 12, display: 'flex', gap: 4 }}>
          {photos.map((_, k) => (
            <span key={k} style={{ flex: 1, height: 3, borderRadius: 2, background: k === i ? '#fff' : 'rgba(255,255,255,.4)' }} />
          ))}
        </div>
      )}

      {/* score ring */}
      <div style={{ position: 'absolute', top: 18, right: 14, width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.45))', background: `conic-gradient(var(--accent) ${score * 3.6}deg, rgba(255,255,255,.35) 0deg)` }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13.5 }}>{score}%</div>
      </div>

      {/* scrim + identity */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,12,8,.82) 0%, rgba(15,12,8,.15) 40%, transparent 66%)' }} />
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16, color: '#fff' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 27, fontWeight: 700, lineHeight: 1.1, textShadow: '0 1px 12px rgba(0,0,0,.55)' }}>
          {name}{age ? `, ${age}` : ''} {verified && <span style={{ color: 'var(--gold-bright)', fontSize: 20 }}>✓</span>}
        </div>
        <div style={{ fontSize: 13, opacity: 0.92, marginTop: 2, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
          {theirSign} · with your {yourSign} — written in the stars
        </div>
      </div>
    </div>
  );
}

function Detail({ d, targetUserId, kind }: { d: MatchDetail; targetUserId: string; kind: MatchKind }) {
  const like = useLikeMatch(kind);
  const pass = usePassMatch(kind);
  const unlock = useUnlockChat(kind);
  const navigate = useNavigate();
  const [liked, setLiked] = useState<{ matched: boolean } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const matched = liked?.matched || d.matched;
  const chatOpen = unlocked || Boolean(d.conversationId);

  const lifestyle = [d.diet, d.smoking && `${d.smoking} smoker`, d.drinking && `${d.drinking} drinker`, d.fitnessLevel].filter(Boolean) as string[];
  const facts = [
    d.occupation, d.education, d.heightCm ? `${d.heightCm} cm` : null,
    [d.city, d.state].filter(Boolean).join(', ') || null,
    d.languages.length ? d.languages.join(', ') : null,
    d.relationshipGoal,
  ].filter(Boolean) as string[];

  const breakdownRows: [string, number][] = [
    ['Astrology', d.breakdown.astrology], ['Personality', d.breakdown.personality],
    ['Goals', d.breakdown.relationshipGoals], ['Values', d.breakdown.values],
    ['Lifestyle', d.breakdown.lifestyle], ['Interests', d.breakdown.interests], ['Location', d.breakdown.location],
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 48px' }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        <Link to="/dating/matches" style={{ color: 'var(--muted)' }}>← Curated Matches</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,420px) 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <Gallery photos={d.photos} name={d.name} age={d.age} verified={d.verified} theirSign={d.theirSign} yourSign={d.yourSign} score={d.score} />

        <div>
          <p className="lede" style={{ color: 'var(--ink-soft)', fontSize: 14.5, margin: '0 0 16px' }}>{facts.join(' · ')}</p>

          {d.bio && <>
            <h3 style={{ margin: '0 0 8px' }}>About {d.name}</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)', marginBottom: 20 }}>{d.bio}</p>
          </>}

          {d.interests.length > 0 && <>
            <h3 style={{ margin: '0 0 10px' }}>Interests</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {d.interests.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          </>}

          {(d.values.length > 0 || d.personalityTraits.length > 0 || lifestyle.length > 0) && <>
            <h3 style={{ margin: '0 0 10px' }}>Values &amp; lifestyle</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {[...d.values, ...d.personalityTraits, ...lifestyle].map((v, k) => (
                <span key={`${v}-${k}`} className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '5px 13px', fontSize: 12.5, background: 'var(--accent-soft)' }}>{v}</span>
              ))}
            </div>
          </>}

          {/* Compatibility */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{d.score}% compatibility</h3>
              <span className="muted" style={{ fontSize: 12 }}>astrology-led</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '6px 16px' }}>
              {breakdownRows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span className="muted">{k}</span><span style={{ fontWeight: 600 }}>{v}%</span>
                </div>
              ))}
            </div>
            {d.reasons.length > 0 && (
              <div style={astrocard}>
                <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 4 }}>Why the stars like this</div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  {d.reasons.map((r, k) => <li key={k} style={{ marginBottom: 2 }}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          {matched ? (
            chatOpen ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>💫 It’s a match!</span>
                <Link to="/chats"><Button variant="accent">Open chat</Button></Link>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>💫 It’s a match!</span>
                  <Button variant="gold" onClick={() => setPayOpen(true)}>💬 Unlock chat · ₹199</Button>
                </div>
                <PaymentSheet open={payOpen} amountInr={199} label={`Unlock chat with ${d.name}`}
                  pending={unlock.isPending} error={unlock.isError ? payError(unlock.error) : null}
                  onCancel={() => setPayOpen(false)}
                  onPay={(method: PayMethod) => unlock.mutate({ targetUserId, method }, { onSuccess: () => { setUnlocked(true); setPayOpen(false); } })} />
              </>
            )
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="accent" disabled={like.isPending}
                onClick={() => like.mutate(targetUserId, { onSuccess: (r) => setLiked(r) })}>
                {like.isPending ? '…' : kind === 'romantic' ? '♥ Like' : '＋ Connect'}
              </Button>
              <Button variant="line" disabled={pass.isPending}
                onClick={() => pass.mutate(targetUserId, { onSuccess: () => navigate('/dating/matches') })}>
                Pass
              </Button>
            </div>
          )}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>They’re notified only if you both like each other.</p>
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
    return <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
      <EmptyState icon="✨" title="No profile selected" hint="Open a profile from your Curated Matches." />
      <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/dating/matches"><Button variant="accent">Back to matches</Button></Link></div>
    </div>;
  }
  if (detail.isLoading) return <Spinner label="Opening the profile…" />;
  if (detail.isError || !detail.data) {
    return <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
      <EmptyState icon="🌙" title="This profile isn’t available" hint="It may be paused, hidden, or no longer a match." />
      <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/dating/matches"><Button variant="accent">Back to matches</Button></Link></div>
    </div>;
  }
  return <Detail d={detail.data} targetUserId={targetUserId} kind={kind} />;
}

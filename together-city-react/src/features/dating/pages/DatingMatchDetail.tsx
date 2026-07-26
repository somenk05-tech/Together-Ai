import { useState, type CSSProperties } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { successToast } from '@/components/form-validation';
import { payError } from '@/features/financial/api';
import {
  useMatchDetail, useLikeMatch, usePassMatch, useConnectChat, useUnmatch,
  type MatchKind, type MatchDetail,
} from '../api';

const photoBox: CSSProperties = { position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'var(--paper)' };
const cover: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
const sectionH: CSSProperties = { margin: '0 0 6px', fontSize: 14, fontWeight: 700 };
const pill: CSSProperties = { border: '1px solid var(--line)', borderRadius: 999, padding: '5px 13px', fontSize: 12.5, background: 'var(--accent-soft)' };

function matchLabel(score: number): { label: string; blurb: string } {
  if (score >= 85) return { label: 'Great Match', blurb: 'You share similar values & life goals.' };
  if (score >= 75) return { label: 'Strong Match', blurb: 'Lots of common ground to build on.' };
  return { label: 'Good Match', blurb: 'Some real things in common — see where it goes.' };
}

/** Photo collage: tall hero + up to two stacked on the right, with identity overlay. */
function Collage({ d }: { d: MatchDetail }) {
  const photos = d.photos ?? [];
  const hero = photos[0];
  const right = photos.slice(1, 3);
  const goal = d.relationshipGoal || 'a connection';
  const location = [d.city, d.state].filter(Boolean).join(', ');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: right.length ? '1.5fr 1fr' : '1fr', gap: 10 }}>
      <div style={{ ...photoBox, aspectRatio: right.length ? '3 / 4' : '16 / 10' }}>
        {hero
          ? <img src={hero} alt={d.name} style={cover} />
          : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 64, color: 'var(--accent)', background: 'var(--accent-soft)', fontFamily: 'var(--serif)' }}>{d.name.slice(0, 1)}</div>}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,10,9,.86) 0%, rgba(12,10,9,.22) 46%, transparent 72%)' }} />
        {/* Intentional Dating badge */}
        <span style={{ position: 'absolute', top: 12, left: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.3)' }}>
          <span aria-hidden>✦</span> Intentional Dating
        </span>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--serif)', fontSize: 29, fontWeight: 700, lineHeight: 1.05, textShadow: '0 2px 14px rgba(0,0,0,.5)' }}>
            <span>{d.name}{d.age ? `, ${d.age}` : ''}</span>
            {d.verified && <span aria-label="Verified" title="Camera-verified" style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: '#2f9be6', color: '#fff', fontSize: 13, flex: 'none' }}>✓</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, marginTop: 4, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
            Looking for <strong style={{ color: '#f4a9b2', fontWeight: 700 }}>{goal}</strong>
            <span aria-hidden style={{ color: '#f4a9b2' }}>♥</span>
          </div>
          {location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginTop: 6, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
              <span aria-hidden>📍</span>{location}
            </div>
          )}
        </div>
      </div>
      {right.length > 0 && (
        <div style={{ display: 'grid', gridTemplateRows: right.length > 1 ? '1fr 1fr' : '1fr', gap: 10 }}>
          {right.map((p, i) => <div key={i} style={{ ...photoBox, minHeight: 120 }}><img src={p} alt="" style={cover} /></div>)}
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
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 48px' }}>
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
                <span aria-hidden style={{ color: 'var(--accent)' }}>{icon}</span>{k}
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
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, background: 'linear-gradient(135deg,var(--accent-soft),rgba(212,175,94,.12))', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px' }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--card)', border: '2px solid var(--accent)', color: 'var(--accent)', fontSize: 24 }}>♥</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Compatibility</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{d.score}%</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2e7d32' }}>{ml.label}</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>{d.reasons[0] ?? ml.blurb}</p>
          </div>
        </div>

        {/* Intentional-dating notice */}
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--paper)', borderRadius: 14, padding: '13px 16px' }}>
          <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', border: '1.5px solid #caa94a', color: 'var(--muted)', flex: 'none' }}>🔒</span>
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            <strong>We believe in intentional dating.</strong> You can chat with one person at a time.
            If you feel the conversation isn’t going anywhere, <strong>unmatch</strong> and move forward.
          </div>
        </div>

        {(connect.isError || unmatch.isError) && (
          <p style={{ color: '#c62828', fontSize: 12.5, marginTop: 10 }}>{payError(connect.error ?? unmatch.error)}</p>
        )}

        {/* Actions */}
        <div style={{ marginTop: 16 }}>
          {matched ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'stretch' }}>
              <Button variant="line" size="md" onClick={() => pass.mutate(targetUserId, { onSuccess: () => navigate('/dating/matches') })} disabled={pass.isPending}>✕ Skip</Button>
              <Button variant="accent" size="md" disabled={connect.isPending} onClick={doConnect}>
                {connect.isPending ? 'Connecting…' : '💬 Connect to Chat'}
              </Button>
              <Button variant="line" size="md" disabled={unmatch.isPending}
                onClick={() => { if (window.confirm('Unmatch this person? They’ll be removed from your matches.')) unmatch.mutate(targetUserId, { onSuccess: () => navigate('/dating/matches') }); }}
                style={{ color: '#c62828', borderColor: '#f0b0b0' }}>
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
            {matched ? 'Connecting opens an anonymous chat in the Dating Hub — one at a time. First 3 connections are free.' : 'They’re notified only if you both like each other.'}
          </p>
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

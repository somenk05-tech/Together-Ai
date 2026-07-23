import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { AiSuggestions } from '@/components/AiSuggestions';
import {
  useDatingProfile, useLikeMatch, useUnlockChat, useMatches, usePassMatch, type CuratedMatch, type MatchKind,
} from '../api';
import { payError, type PayMethod } from '@/features/financial/api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';

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
function MatchGallery({ photos, name, age, theirSign, yourSign, score }: {
  photos: string[]; name: string; age?: number; theirSign: string; yourSign: string; score: number;
}) {
  const [active, setActive] = useState(0);
  const hero = photos[active] ?? photos[0];
  return (
    <div>
      <div style={{ position: 'relative', aspectRatio: '16 / 10', background: 'var(--paper)', overflow: 'hidden' }}>
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
      </div>
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
  const unlock = useUnlockChat(kind);
  const [result, setResult] = useState<{ matched: boolean; conversationId: string | null } | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const matched = result?.matched || match.matched;
  const chatOpen = unlocked || Boolean(match.conversationId);
  const photos = match.photos ?? [];
  const hasPhotos = photos.length > 0;

  return (
    <article className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      {hasPhotos ? (
        <MatchGallery photos={photos} name={match.user.name} age={match.age}
          theirSign={match.theirSign} yourSign={match.yourSign} score={match.score} />
      ) : (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '18px 18px 0' }}>
          <ScoreRing score={match.score} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{match.user.name}{match.age ? `, ${match.age}` : ''}</div>
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
          chatOpen ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)' }}>💫 It’s a match!</span>
              <Link to="/chats"><Button variant="accent" size="sm">Open chat</Button></Link>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)' }}>💫 It’s a match!</span>
                <Button variant="accent" size="sm" onClick={() => setPayOpen(true)}>
                  💬 Unlock chat · ₹199
                </Button>
              </div>
              <PaymentSheet
                open={payOpen}
                amountInr={199}
                label={`Unlock chat with ${match.user.name}`}
                pending={unlock.isPending}
                error={unlock.isError ? payError(unlock.error) : null}
                onCancel={() => setPayOpen(false)}
                onPay={(method: PayMethod) => unlock.mutate({ targetUserId: match.user.id, method }, { onSuccess: () => { setUnlocked(true); setPayOpen(false); } })}
              />
            </div>
          )
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="accent" size="sm" disabled={like.isPending}
              onClick={() => like.mutate(match.user.id, { onSuccess: (r) => setResult(r) })}
            >
              {like.isPending ? '…' : kind === 'romantic' ? '♥ Like' : '＋ Connect'}
            </Button>
            <Button variant="line" size="sm" disabled={pass.isPending} onClick={() => pass.mutate(match.user.id)}>
              Pass
            </Button>
          </div>
        )}
      </div>
      </div>
    </article>
  );
}

/** Curated Matches (romantic) / New Friends (platonic) — only ≥75% ever shown. */
export function DatingMatches() {
  const [kind, setKind] = useState<MatchKind>('romantic');
  const profile = useDatingProfile();
  const matches = useMatches(kind, Boolean(profile.data));

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

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Dating Hub</div>
      <h1 style={{ fontSize: 26 }}>{kind === 'romantic' ? 'Curated Matches' : 'New Friends'}</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Curated, not endless — the AI shows only genuine matches (75%+), ranked by compatibility. Pass or match, and the list stays current.
      </p>

      <AiSuggestions kind="astrology" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['romantic', 'platonic'] as MatchKind[]).map((k) => (
          <button
            key={k} type="button" onClick={() => setKind(k)}
            className="pill"
            style={{
              cursor: 'pointer', borderRadius: 999, padding: '8px 18px', fontSize: 13, fontFamily: 'inherit',
              border: '1px solid var(--line)',
              background: kind === k ? 'var(--accent)' : 'transparent',
              color: kind === k ? '#fff' : 'var(--ink-soft)', fontWeight: kind === k ? 700 : 400,
            }}
          >
            {k === 'romantic' ? '♥ Curated Matches' : '☺ New Friends'}
          </button>
        ))}
      </div>

      {matches.isLoading && <Spinner label="Scoring compatibility…" />}
      {matches.data && matches.data.length === 0 && (
        <EmptyState icon="🌙" title="No ≥75% matches right now" hint="The city never pads the list — check back as more residents join." />
      )}
      {matches.data?.map((m) => <MatchCard key={m.user.id} match={m} kind={kind} />)}
    </div>
  );
}

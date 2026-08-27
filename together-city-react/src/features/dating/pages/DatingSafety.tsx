import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useAppeal, useDatingProfile, useMyAppeals } from '../api';

/**
 * The Safety Centre: what is checked, what is not, and the way to argue with
 * a decision. (26 Aug launch audit — there was no appeal path and no page
 * that said in one place what "safety check" means.)
 *
 * Plain sentences. This is the page somebody reads after their profile was
 * refused, and the page a stranger reads before meeting somebody; both of
 * them are owed the limits of what was checked, not reassurance.
 */
/** The emergency section's pieces, hoisted — scripts/size-system-ceiling.mjs
 *  counts inline style objects, and a new section must not raise the count. */
const helpCard: React.CSSProperties = { padding: '16px', marginTop: '12px' };
const helpH2: React.CSSProperties = { fontSize: 16, margin: '0' };
const helpIntro: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.65, margin: '8px 0 10px' };
const helpList: React.CSSProperties = { margin: '0', padding: '0 0 0 18px', fontSize: 13.5, lineHeight: 1.9 };
const helpFoot: React.CSSProperties = { fontSize: 12.5, lineHeight: 1.6, margin: '10px 0 0' };

export function DatingSafety() {
  const profile = useDatingProfile();
  const appeals = useMyAppeals();
  const appeal = useAppeal();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'dating_profile' | 'dating_photo'>('dating_profile');
  const [photoKey, setPhotoKey] = useState('');

  const p = profile.data;
  const review = p?.photoReview ?? {};
  const refusedPhotos = Object.entries(review).filter(([, s]) => s === 'rejected' || s === 'held').map(([k]) => k);
  const profileRefused = p?.moderation === 'rejected' || p?.moderation === 'review';
  const canAppeal = kind === 'dating_profile' ? profileRefused : Boolean(photoKey);

  const submit = () => appeal.mutate(
    { kind, targetId: kind === 'dating_photo' ? photoKey : undefined, text: text.trim() },
    { onSuccess: () => setText('') },
  );

  return (
    <div>
      <div className="eyebrow">Dating Hub · Safety</div>
      <h1 style={{ fontSize: 26 }}>Safety Centre</h1>

      <section className="card" style={{ padding: 16, marginTop: 14 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>What we check</h2>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: '8px 0 0' }}>
          Every dating profile passes a text check before it goes live, and every photo is looked at before anyone else sees it.
          A photo the machine cannot clear waits for a person; until then it shows to you and to nobody else.
          The ✉ mark on a profile means their email address is confirmed — that is all it means. Nobody&rsquo;s identity is verified, and nobody&rsquo;s age is checked beyond the date of birth they typed.
        </p>
      </section>

      <section className="card" style={{ padding: 16, marginTop: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Staying safe</h2>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: '8px 0 0' }}>
          Chat here first; you appear under your own name and photos, and the conversation stays in this hub.
          Meet in a public place and tell someone where you are going. Money never belongs in a conversation with someone you have not met — anyone who asks for it, report them.
          Report or block from any profile or chat; a report is read by a moderator, and the person you report is never told who reported them.
        </p>
      </section>

      <section className="card" style={helpCard}>
        <h2 style={helpH2}>If something has gone wrong</h2>
        <p className="muted" style={helpIntro}>
          If you are in danger right now, contact the emergency services first — before
          anything on this page. Reports here reach a moderator; they do not reach the police.
        </p>
        {/* Real numbers, plainly, for India — where Together City operates.
            tel: links, because somebody reading this on a phone should be one
            tap from the call, not copying digits in a bad moment. */}
        <ul style={helpList}>
          <li><a href="tel:112"><strong>112</strong></a> — national emergency number (police, fire, ambulance), all of India</li>
          <li><a href="tel:1091"><strong>1091</strong></a> — women&rsquo;s helpline</li>
          <li><a href="tel:1930"><strong>1930</strong></a> — cybercrime helpline, for financial fraud and online abuse (or <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">cybercrime.gov.in</a>)</li>
          <li><a href="tel:18005990019"><strong>1800-599-0019</strong></a> — Kiran, the national mental-health helpline, 24×7</li>
        </ul>
        <p className="muted" style={helpFoot}>
          These are national services, not part of Together City. If you are outside India,
          your local emergency number is the one to use.
        </p>
      </section>

      <section className="card" style={{ padding: 16, marginTop: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Argue with a decision</h2>
        {profile.isLoading && <Spinner />}
        {p && !profileRefused && refusedPhotos.length === 0 && (
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: '8px 0 0' }}>
            Nothing on your profile has been refused. If that changes, the way to appeal is here.
          </p>
        )}
        {p && (profileRefused || refusedPhotos.length > 0) && (
          <div style={{ marginTop: 10 }}>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
              {profileRefused
                ? `Your profile is ${p.moderation === 'review' ? 'waiting for a person to look at it' : 'not live'}${p.moderationReasons.length ? `: ${p.moderationReasons.join(' · ')}` : '.'}`
                : `${refusedPhotos.length} of your photos ${refusedPhotos.length === 1 ? 'is' : 'are'} not showing.`}
              {' '}A moderator reads every appeal and answers here.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {profileRefused && (
                <Button variant={kind === 'dating_profile' ? 'accent' : 'line'} size="sm" onClick={() => setKind('dating_profile')}>My profile</Button>
              )}
              {refusedPhotos.map((k, i) => (
                <Button key={k} variant={kind === 'dating_photo' && photoKey === k ? 'accent' : 'line'} size="sm" onClick={() => { setKind('dating_photo'); setPhotoKey(k); }}>
                  Photo {i + 1} ({review[k]})
                </Button>
              ))}
            </div>
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4}
              placeholder="What do you think we got wrong?"
              style={{ width: '100%', marginTop: 10, fontSize: 13.5, fontFamily: 'inherit', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--card)', color: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
              <Button size="sm" disabled={!canAppeal || text.trim().length < 10 || appeal.isPending} onClick={submit}>
                {appeal.isPending ? 'Sending…' : 'Send appeal'}
              </Button>
              {appeal.isSuccess && (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {appeal.data.duplicate ? 'You already have an open appeal for this — it is in the queue.' : 'Sent. You will hear back here.'}
                </span>
              )}
              {appeal.isError && <span className="muted" style={{ fontSize: 12.5 }}>That did not send. Try again in a moment.</span>}
            </div>
          </div>
        )}
        {appeals.data && appeals.data.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 8 }}>
            {appeals.data.map((a) => (
              <li key={a.id} style={{ fontSize: 13, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <strong>{a.kind === 'dating_profile' ? 'Profile' : 'Photo'}</strong> · {new Date(a.createdAt).toLocaleDateString()} ·{' '}
                {a.status === 'open' ? 'waiting for a moderator' : a.status === 'overturned' ? 'accepted' : 'decision stands'}
                {a.decision && <div className="muted" style={{ marginTop: 3 }}>{a.decision}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div style={{ marginTop: 16 }}><Link to="/dating"><Button variant="line" size="sm">Back to Dating Hub</Button></Link></div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import type { MatchDetail } from '../api';
import { bandFor, coverageNote } from '../bands';
import { startersFor, type Starter } from '../starters';

/**
 * ── THE PIECES THE DATING THREAD IS FURNISHED WITH (owner, 26 Aug) ──────────
 *
 * The chat redesign brief: a conversation that opens with a reason to talk
 * rather than an empty room. Three pieces, all of them fed by data the engine
 * already computes — nothing here invents a fact about a person:
 *
 *   EmptyIntro         — the room before the first message: both faces, the
 *                        number, and four tappable ways in.
 *   ConversationIdeas  — the quiet popover for a stalled conversation: the
 *                        same profile-read starters, and the one door to Mira,
 *                        who reads a thread only when invited.
 *   CompatibilitySheet — the number, opened: all seven factors as the same
 *                        indicators the profile page draws, then the engine's
 *                        reasons. The percentage stays useful after the match.
 *
 * All of it renders on the thread's stage and speaks in stage tokens — except
 * the sheet, which is a dialog, and a dialog is the app interrupting the
 * stage: it wears the city's white, the same call ChatStarter's modal made.
 */

/** The tappable ways in. Every tap only SEEDS the composer — the words are
 *  theirs to edit before anything is sent. */
export function ConversationStarters({ starters, onPick }: {
  starters: Starter[]; onPick: (question: string) => void;
}) {
  return (
    <div className="csstarts">
      {starters.map((s) => (
        <button key={s.label} type="button" className="csstart" onClick={() => onPick(s.question)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** The room before the first message (§10 of the brief): both faces, the
 *  number, one line, and the ways in. No confetti — the fact IS the moment. */
export function EmptyIntro({ name, score, myPhoto, theirPhoto, d, onPick }: {
  name: string; score: number | null; myPhoto: string | null; theirPhoto: string | null;
  d?: MatchDetail | null; onPick: (question: string) => void;
}) {
  const faces: [string | null, string][] = [[myPhoto, 'You'], [theirPhoto, name]];
  return (
    <div className="csempty">
      <div className="csempty-faces" aria-hidden>
        {faces.map(([photo, who], i) => photo
          ? <img key={who} src={photo} alt="" style={i ? { marginLeft: -14 } : undefined} />
          : <span key={who} style={i ? { marginLeft: -14 } : undefined}>{(who || '?').slice(0, 1)}</span>)}
      </div>
      {score != null && <b className="csintro-pct">{score}% compatible</b>}
      <p>There’s already something bringing you together.</p>
      {d?.reasons?.[0] && <p className="csempty-common">{d.reasons[0]}</p>}
      <i className="csintro-lab">Start the conversation — ask {name} about:</i>
      <ConversationStarters starters={startersFor({
        name, interests: d?.interests, city: d?.city, occupation: d?.occupation,
      })} onPick={onPick} />
      <small>You appear as the name and photos on your dating profile — nothing else is shown.</small>
    </div>
  );
}

/**
 * The quiet help for a stalled conversation. NOT a chatbot in the thread: the
 * starters are read off their profile, and the one line that involves Mira
 * only opens the same invited, stores-nothing panel every chat already has.
 */
export function ConversationIdeas({ starters, onPick, onMira, onClose }: {
  starters: Starter[]; onPick: (question: string) => void; onMira: () => void; onClose: () => void;
}) {
  return (
    <>
      <button type="button" className="cshead-more-scrim" aria-label="Close conversation ideas" onClick={onClose} />
      <div className="csideas" role="menu" aria-label="Conversation ideas">
        <b>Conversation ideas</b>
        {starters.map((s) => (
          <button key={s.label} type="button" className="csstart" role="menuitem"
            onClick={() => { onPick(s.question); onClose(); }}>
            {s.label}
          </button>
        ))}
        <button type="button" className="csstart" role="menuitem"
          onClick={() => { onMira(); onClose(); }}>
          Help me reply — ask Mira <span className="csideas-note">reads this chat only when you ask</span>
        </button>
      </div>
    </>
  );
}

/**
 * The number, opened (§8): overall, the seven real factors — the engine has
 * seven, and they are the seven this app draws everywhere; a "Communication"
 * bar would be a number nobody computed — then why you connect, in the
 * engine's own sentences, frictions included. A sheet that only ever agrees
 * with itself is a sales pitch.
 */
export function CompatibilitySheet({ name, score, otherUserId, d, onClose }: {
  name: string; score: number | null; otherUserId: string; d?: MatchDetail | null; onClose: () => void;
}) {
  const n = score ?? d?.score ?? null;
  const band = n != null ? bandFor(n) : null;
  const covNote = coverageNote(d?.coverage);
  const rows: [string, number][] = d?.breakdown
    ? [['Astrology', d.breakdown.astrology], ['Personality', d.breakdown.personality], ['Goals', d.breakdown.relationshipGoals],
       ['Values', d.breakdown.values], ['Lifestyle', d.breakdown.lifestyle], ['Interests', d.breakdown.interests], ['Location', d.breakdown.location]]
    : [];
  return (
    <>
      <button type="button" className="cssheet-scrim" aria-label="Close compatibility" onClick={onClose} />
      <div className="cssheet" role="dialog" aria-modal="true" aria-label="Your compatibility">
        <div className="cssheet-grab" aria-hidden />
        <h2>Your compatibility</h2>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          {n != null && <span className="dating-display" style={{ fontSize: 'var(--fs-9)', lineHeight: 1 }}>{n}%</span>}
          {band && <span style={{ fontSize: 'var(--fs-5)', fontWeight: 700, color: band.ink }}>{band.name}</span>}
        </div>
        {rows.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {rows.map(([k, v]) => (
              <div key={k} className="pd-fac">
                <span>{k}</span>
                <div className="pd-track" role="img" aria-label={`${k}: ${v}%`}>
                  <div className="pd-fill" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
                </div>
                <b>{v}%</b>
              </div>
            ))}
            {covNote && <p className="muted" style={{ fontSize: 'var(--fs-2)', lineHeight: 1.5, margin: '10px 0 0' }}>{covNote}</p>}
          </div>
        )}
        {(d?.reasons?.length ?? 0) > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 'var(--fs-5)', margin: '0 0 4px' }}>Why you connect</h3>
            <ul className="dt-reasons">
              {d!.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        {(d?.frictions?.length ?? 0) > 0 && (
          <>
            <div className="dt-why">One thing to explore</div>
            <ul className="dt-reasons is-friction">
              {d!.frictions!.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </>
        )}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <Link to={`/dating/match?u=${otherUserId}&kind=romantic`} style={{ fontWeight: 700, fontSize: 'var(--fs-3)' }}>
            Open {name}’s full profile →
          </Link>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}

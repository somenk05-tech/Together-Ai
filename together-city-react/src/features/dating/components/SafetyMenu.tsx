import { useState } from 'react';
import { useBlockMatch, useReportMatch, type MatchKind } from '../api';

/**
 * Report and block, on every surface where you can see a person (H6).
 *
 * There was no way to do either from inside Dating. Blocking existed only in
 * People/Connections, so a citizen in a bad dating conversation had to work out
 * that the control they needed lived in a different hub, about somebody they had
 * met in this one. Safety you cannot reach from where the harm is isn't safety.
 *
 * Three rules the layout follows:
 *
 *  · It is quiet until it is needed. A permanent red BLOCK button beside a
 *    stranger's face frames every match as a threat, which is its own harm on a
 *    hub about meeting people.
 *  · Block asks once. It is not undoable from here — deliberately: a confirm
 *    step somebody can skip is worse than a slightly slower one they cannot.
 *  · Report takes their words and does not require them. "This person" is often
 *    the whole report, and a mandatory box is a reason not to file.
 */
export function SafetyMenu({ userId, kind, compact = false }: {
  userId: string; kind: MatchKind; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | 'report' | 'block'>(null);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<null | 'reported' | 'blocked'>(null);
  const block = useBlockMatch();
  const report = useReportMatch();

  const close = () => { setOpen(false); setMode(null); setReason(''); };

  if (done) {
    return (
      <span className="muted" style={{ fontSize: 12 }}>
        {done === 'blocked'
          ? 'Blocked. They can’t see you or reach you, and they’re not told.'
          : 'Reported. A moderator will look at this — they aren’t told who reported them.'}
      </span>
    );
  }

  const linkStyle: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: compact ? 11.5 : 12.5, color: 'var(--muted)',
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={linkStyle}
        aria-label="Report or block this person">
        ⋯ Report or block
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Report or block"
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(12,10,9,.62)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, background: 'var(--card)', borderRadius: 18, padding: 20, boxShadow: 'var(--shadow)' }}>

            {mode === null && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>What would you like to do?</h3>
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 16px' }}>
                  Neither of these tells them anything. They won’t know you reported them, and a block
                  looks to them like nothing happened.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button type="button" onClick={() => setMode('report')}
                    style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <strong style={{ fontSize: 14 }}>Report them</strong>
                    <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                      Sends this to a moderator to review. They stay in your matches unless you also block.
                    </span>
                  </button>
                  <button type="button" onClick={() => setMode('block')}
                    style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: '1px solid #e6b4b4', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <strong style={{ fontSize: 14, color: '#b3261e' }}>Block them</strong>
                    <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                      Removes the match, closes any chat, and hides you from each other everywhere in the city.
                    </span>
                  </button>
                </div>
                <button type="button" onClick={close} style={{ ...linkStyle, marginTop: 14 }}>Cancel</button>
              </>
            )}

            {mode === 'report' && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>Report this person</h3>
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 12px' }}>
                  Tell us what happened, in your own words. You don’t have to — send it blank if you’d
                  rather not write it out. A moderator reads this; they’re never told who reported them.
                </p>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={500}
                  aria-label="What happened"
                  placeholder="Optional — what happened?"
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
                {report.isError && (
                  <p style={{ color: '#c62828', fontSize: 12.5 }}>That didn’t send. Try again.</p>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <button type="button" disabled={report.isPending}
                    onClick={() => report.mutate({ userId, kind, reason: reason.trim() || undefined }, {
                      onSuccess: () => { setDone('reported'); close(); },
                    })}
                    style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {report.isPending ? 'Sending…' : 'Send report'}
                  </button>
                  <button type="button" onClick={close} style={linkStyle}>Cancel</button>
                </div>
              </>
            )}

            {mode === 'block' && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>Block this person?</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 6px' }}>
                  You won’t see each other anywhere in Together City again — not in matches, not in
                  the feed, not in messages. Any chat between you closes.
                </p>
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 14px' }}>
                  They are not told. To them it looks like nothing happened. You can undo this from
                  your blocked list in People.
                </p>
                {block.isError && (
                  <p style={{ color: '#c62828', fontSize: 12.5 }}>That didn’t go through. Try again.</p>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" disabled={block.isPending}
                    onClick={() => block.mutate({ userId, kind }, { onSuccess: () => { setDone('blocked'); close(); } })}
                    style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: 'none', background: '#b3261e', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {block.isPending ? 'Blocking…' : 'Yes, block them'}
                  </button>
                  <button type="button" onClick={close} style={linkStyle}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

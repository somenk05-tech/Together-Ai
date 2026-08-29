import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useReport } from './api';

/**
 * ── REPORTING A THING, RATHER THAN A PERSON ─────────────────────────────────
 *
 * The 30 Aug audit found the report control wired in exactly one place: a
 * button on somebody's profile, hard-coded to `targetType: 'user'`. The API had
 * accepted posts and comments all along and the moderation queue could render
 * both. So to report an abusive photograph a citizen had to open the author's
 * profile and report the PERSON — which loses the evidence, and asks a
 * moderator to judge an account on the strength of a complaint that names
 * nothing.
 *
 * The reason was collected with `window.prompt`: no categories, no cancel on
 * some mobile browsers, and silently unavailable wherever popups are blocked.
 * A moderator reading "asdf" in a free-text box cannot triage; a moderator
 * reading "Harassment or hate" can.
 *
 * ONE COMPONENT FOR ALL THREE TARGETS. A post, a comment and a person are the
 * same gesture with a different id, and writing it once is what stops the third
 * one being forgotten again.
 */

const REASONS = [
  'Spam or a scam',
  'Harassment or hate',
  'Nudity or violence',
  'False information',
  'Something else',
] as const;

export function ReportMenu({ targetType, targetId, label = 'Report', compact = false }: {
  targetType: 'user' | 'post' | 'comment';
  targetId: string;
  label?: string;
  /** A comment's row has no space for a word — the flag stands alone there. */
  compact?: boolean;
}) {
  const report = useReport();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Outside tap and Escape both close it — the same pattern the post menu uses,
  // as a listener rather than a full-screen backdrop, because a fixed element
  // inside a card with paint containment measures against the card.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (done) {
    return (
      <span className="sl-reported">
        <Icon name="accepted" size={13} /> Reported
      </span>
    );
  }

  const send = (reason: string) => {
    setFailed(false);
    report.mutate({ targetType, targetId, reason }, {
      onSuccess: () => { setDone(true); setOpen(false); },
      // A safety action that fails silently is the one failure nobody can
      // recover from, because there is nothing to tell them to try again.
      onError: () => { setFailed(true); setOpen(false); },
    });
  };

  return (
    <span className="sl-report" ref={box}>
      <button type="button" className="sl-report-b" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Report this ${targetType}`} disabled={report.isPending}
        onClick={() => setOpen((o) => !o)}>
        <Icon name="flag" size={13} />{!compact && <span> {label}</span>}
      </button>
      {open && (
        <div className="sl-report-menu" role="menu">
          <div className="sl-report-h">What’s wrong with this {targetType === 'user' ? 'account' : targetType}?</div>
          {REASONS.map((r) => (
            <button key={r} type="button" role="menuitem" className="sl-report-r" onClick={() => send(r)}>{r}</button>
          ))}
        </div>
      )}
      {failed && <span className="sl-report-fail" role="alert">That report didn’t send — try again.</span>}
    </span>
  );
}

import type { CSSProperties } from 'react';
import { Button } from '@/components/ui';
import type { PendingChange, ReleaseStatus } from './release.api';

/**
 * ── CHOOSE WHAT GOES LIVE, AND SEE IT ARRIVE (owner, 16 Sep) ────────────────
 *
 * "Give options of what things will go live and give an option to select what
 * can go live now." — every waiting change is a row with a tick, the places
 * it touches in words, and its explanation behind a fold. All are ticked to
 * start with; untick what should wait.
 *
 * "Add if the changes have been deployed." — ReleaseProgress says where the
 * last release is: building, stopped, deploying, or live, with Vercel's and
 * Railway's own word for each.
 *
 * `off` holds the UNticked ids, so a change that arrives later starts ticked.
 */
const small: CSSProperties = { fontSize: 12.5, margin: 0, lineHeight: 1.55 };
const list: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 };
const item: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'start',
  padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-1)' };
const tick: CSSProperties = { width: 18, height: 18, margin: '2px 0 0', accentColor: 'var(--accent)' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };

/** The ticked changes that lean on an unticked older one (they touch the same files). */
export function needsUnticked(changes: PendingChange[], off: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  changes.forEach((c, i) => {
    if (off.has(c.sha) || !c.files) return;
    // Newest first: the older changes are further down the list.
    const older = changes.slice(i + 1).find((o) => off.has(o.sha) && o.files?.some((f) => c.files?.includes(f)));
    if (older) out.set(c.sha, older.title);
  });
  return out;
}

export function ChangePicker({ changes, off, onChange, disabled }: {
  changes: PendingChange[];
  off: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const leans = needsUnticked(changes, off);
  const flip = (sha: string) => {
    const next = new Set(off);
    if (next.has(sha)) next.delete(sha); else next.add(sha);
    onChange(next);
  };
  const chosen = changes.length - changes.filter((c) => off.has(c.sha)).length;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={row}>
        <span style={small}><strong>{chosen}</strong> of {changes.length} chosen</span>
        <Button variant="line" size="sm" disabled={disabled || off.size === 0} onClick={() => onChange(new Set())}>
          Choose all
        </Button>
        <Button variant="line" size="sm" disabled={disabled || chosen === 0}
          onClick={() => onChange(new Set(changes.map((c) => c.sha)))}>
          Choose none
        </Button>
      </div>
      <ul style={list} aria-label="Changes waiting to go live">
        {changes.map((c) => (
          <li key={c.sha} style={item} data-change={c.short}>
            <input type="checkbox" style={tick} checked={!off.has(c.sha)} disabled={disabled}
              onChange={() => flip(c.sha)} aria-label={`Send “${c.title}” now`} />
            <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
              <strong style={{ ...small, overflowWrap: 'anywhere' }}>{c.title}</strong>
              <span className="muted" style={small}>
                {c.areas?.length ? c.areas.join(' · ') : 'Where it lands: GitHub did not say'}
                {c.at && ` · ${new Date(c.at).toLocaleString()}`}
              </span>
              {leans.has(c.sha) && (
                <span style={{ ...small, color: 'var(--danger-ink)' }}>
                  Touches the same files as “{leans.get(c.sha)}”, which is not chosen — it may need it.
                </span>
              )}
              {(c.details || c.files?.length) && (
                <details>
                  <summary style={small}>What it changes<span className="fold-state" aria-hidden /></summary>
                  {c.details && <p style={{ ...small, whiteSpace: 'pre-line', marginTop: 4 }}>{c.details}</p>}
                  {c.files && c.files.length > 0 && (
                    <p className="muted" style={{ ...small, marginTop: 4, overflowWrap: 'anywhere' }}>
                      {c.files.length} file{c.files.length === 1 ? '' : 's'}: {c.files.slice(0, 12).join(', ')}
                      {c.files.length > 12 ? '…' : ''}
                    </p>
                  )}
                  <a style={small} href={c.url} target="_blank" rel="noreferrer">Open {c.short} on GitHub</a>
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STAGE: Record<ReleaseStatus['stage'], string> = {
  none: 'No release in progress.',
  building: 'Building — togethercity.app has not changed yet.',
  failed: 'The last release stopped before going live. Nothing changed on togethercity.app.',
  deploying: 'Released. Vercel and Railway are deploying it now.',
  deployed: 'Live — deployed on togethercity.app.',
  'deploy-failed': 'Released, but a deploy failed. The live site may still show the previous version.',
};

const WORD: Record<string, string> = {
  success: 'deployed', inactive: 'deployed', failure: 'failed', error: 'failed',
  in_progress: 'deploying', queued: 'waiting', pending: 'waiting',
};

export function ReleaseProgress({ status }: { status: ReleaseStatus | undefined }) {
  if (!status || (status.stage === 'none' && !status.main)) return null;
  const bad = status.stage === 'failed' || status.stage === 'deploy-failed';
  return (
    <div style={{ display: 'grid', gap: 4 }} role="status" data-stage={status.stage}>
      <strong style={{ ...small, color: bad ? 'var(--danger-ink)' : undefined }}>{STAGE[status.stage]}</strong>
      {status.main && (
        <span className="muted" style={small}>
          togethercity.app is built from <a href={status.main.url} target="_blank" rel="noreferrer">{status.main.title}</a>
          {status.main.at && ` · ${new Date(status.main.at).toLocaleString()}`}
        </span>
      )}
      {status.deploys.map((d) => (
        <span key={d.name} style={small}>
          {d.name}: <strong>{WORD[d.state] ?? d.state}</strong>
          {d.at && <span className="muted"> · {new Date(d.at).toLocaleTimeString()}</span>}
        </span>
      ))}
      {status.run && (status.stage === 'building' || status.stage === 'failed') && (
        <a style={small} href={status.run.url} target="_blank" rel="noreferrer">
          {status.stage === 'failed' ? 'See why it stopped' : 'Watch the build'}
        </a>
      )}
    </div>
  );
}

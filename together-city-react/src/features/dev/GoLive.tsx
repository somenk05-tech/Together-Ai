import { useEffect, useState, type CSSProperties } from 'react';
import { Button, Switch } from '@/components/ui';
import {
  useGoLive, usePendingChanges, useReleaseRuns, useReleaseState, useReleaseStatus, type ReleaseRun,
} from './release.api';
import { ChangePicker, ReleaseProgress } from './ChangePicker';

/**
 * ── THE GO LIVE BUTTON (owner, 16 Sep) ──────────────────────────────────────
 *
 * "Create a copy of the entire website for the developer where I continue to
 * work, while a leaner version is launched. Anything I work on stays on the
 * developer site until I press the Go live button."
 *
 * On the developer site (dev.togethercity.app) this panel sends `develop` to
 * the live site — everything, or only the changes ticked in the list — says
 * which hubs the live site shows, and follows the release until Vercel and
 * Railway have deployed it. On the live site it only reports — the live site
 * cannot release itself.
 *
 * It follows the page's own two-step pattern: choose, write a reason, then
 * press. The press is recorded with who and why like every switch on /dev.
 */
const panel: CSSProperties = { display: 'grid', gap: 12, padding: '16px 18px', margin: '16px 0 0' };
const hubGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 };
const hubRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  minHeight: 44, padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-1)' };
const reasonBox: CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const small: CSSProperties = { fontSize: 12.5, margin: 0, lineHeight: 1.55 };

export function GoLive({ password }: { password: string }) {
  const state = useReleaseState(password);
  const s = state.data;
  const runs = useReleaseRuns(password, Boolean(s?.tokenSet));
  const goLive = useGoLive(password);
  const onDevCopy = s?.channel === 'dev';
  const pending = usePendingChanges(onDevCopy);
  const status = useReleaseStatus(onDevCopy);
  const [off, setOff] = useState<Set<string>>(new Set());

  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [arming, setArming] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Start from what the live site shows today.
  useEffect(() => {
    if (s) setChosen(new Set(s.hubs.filter((h) => h.live).map((h) => h.key)));
  }, [s]);

  if (!s) return null;

  const live = s.channel === 'live';
  const changes = pending.data?.changes ?? [];
  const waiting = pending.data?.waiting ?? null;
  const picked = changes.filter((c) => !off.has(c.sha)).map((c) => c.sha);
  const sendAll = off.size === 0 || picked.length === changes.length;
  const ready = reason.trim().length >= 8 && chosen.size > 0 && (sendAll || picked.length > 0);
  const toggle = (key: string) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const press = () => {
    setErr(null);
    goLive.mutate({ hubs: [...chosen], reason: reason.trim(), commits: sendAll ? undefined : picked }, {
      onSuccess: () => { setArming(false); setReason(''); setSent(true); setOff(new Set()); },
      onError: (e: unknown) => {
        const m = e as { response?: { data?: { message?: string | string[] } } };
        const raw = m?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'The release could not be started.');
      },
    });
  };

  return (
    <section className="card" style={panel} aria-labelledby="go-live-h" data-release={s.channel}>
      <div>
        <div className="eyebrow">{live ? 'This is the live site' : 'This is the developer copy'}</div>
        <h2 id="go-live-h" style={{ fontSize: 18, margin: '4px 0 0' }}>
          {live ? 'What the live site shows' : 'Go live'}
        </h2>
      </div>

      {live ? (
        <p className="muted" style={small}>
          Changes reach this site only from the developer copy&apos;s Go live button. It shows these
          hubs: <strong>{s.hubs.filter((h) => h.live).map((h) => h.label).join(', ')}</strong>. The rest
          have no door here and their addresses say &ldquo;opening soon&rdquo;.
        </p>
      ) : (
        <p className="muted" style={small}>
          Everything on this site is private until you press Go live. The button builds this copy
          from a clean checkout and, only if it builds, sends it to togethercity.app. Choose which
          hubs the live site shows; everything else stays here.
        </p>
      )}

      {!live && (
        <div style={hubGrid} role="group" aria-label="Hubs on the live site">
          {s.hubs.map((h) => (
            <div key={h.key} style={hubRow} data-hub={h.key}>
              <span style={{ fontSize: 13 }}>
                {h.label}
                <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                  {chosen.has(h.key) ? 'Live' : 'Developer only'}
                </span>
              </span>
              <Switch checked={chosen.has(h.key)} onChange={() => toggle(h.key)}
                label={`${h.label} ${chosen.has(h.key) ? 'live' : 'developer only'}`} hideLabel
                disabled={goLive.isPending} />
            </div>
          ))}
        </div>
      )}

      {!live && <ReleaseProgress status={status.data} />}

      {!live && waiting !== null && (
        waiting === 0
          ? <p className="muted" style={small}>Nothing is waiting: togethercity.app has every change on this copy.</p>
          : <ChangePicker changes={changes} off={off} onChange={setOff} disabled={goLive.isPending} />
      )}

      {!live && !s.tokenSet && (
        <p style={{ ...small, color: 'var(--danger-ink)' }} role="alert">
          GITHUB_RELEASE_TOKEN is not set on this environment, so the button cannot ask GitHub to
          release. See RELEASE.md, step 4.
        </p>
      )}

      {!live && s.canGoLive && !arming && (
        <div style={row}>
          <Button variant="accent" onClick={() => { setSent(false); setArming(true); }} disabled={chosen.size === 0}>
            Go live
          </Button>
          <span className="muted" style={{ fontSize: 12 }}>
            {chosen.size} of {s.hubs.length} hubs will be live.
          </span>
        </div>
      )}

      {arming && (
        <div style={{ display: 'grid', gap: 8 }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
            aria-label="What is going live"
            placeholder="What is going live? It is written into main's history."
            style={reasonBox} />
          <div style={row}>
            <Button variant="accent" size="sm" disabled={!ready || goLive.isPending} onClick={press}>
              {goLive.isPending ? 'Asking GitHub…'
                : sendAll ? 'Send this copy to togethercity.app'
                : `Send ${picked.length} chosen change${picked.length === 1 ? '' : 's'} to togethercity.app`}
            </Button>
            <Button variant="line" size="sm" onClick={() => { setArming(false); setReason(''); setErr(null); }}>
              Cancel
            </Button>
            {!ready && <span className="muted" style={{ fontSize: 12 }}>A reason is required.</span>}
          </div>
        </div>
      )}

      {err && <p style={{ ...small, color: 'var(--danger-ink)' }} role="alert">{err}</p>}
      {sent && (
        <p style={small} role="status">
          Release started. It takes a few minutes: build, then main moves, then Vercel and Railway deploy —
          the progress above follows it.
        </p>
      )}

      {s.tokenSet && <Runs runs={runs.data?.runs ?? null} url={s.runsUrl} />}
    </section>
  );
}

function Runs({ runs, url }: { runs: ReleaseRun[] | null; url: string }) {
  if (runs === null) {
    return <p className="muted" style={small}>GitHub did not answer. <a href={url} target="_blank" rel="noreferrer">See releases on GitHub</a>.</p>;
  }
  if (runs.length === 0) return <p className="muted" style={small}>Nothing has been released with the button yet.</p>;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <strong style={{ fontSize: 12.5 }}>Recent releases</strong>
      {runs.map((r) => (
        <p key={r.id} style={small}>
          <a href={r.url} target="_blank" rel="noreferrer">{new Date(r.createdAt).toLocaleString()}</a>
          {' · '}{r.status === 'completed' ? (r.conclusion === 'success' ? 'Live' : `Stopped (${r.conclusion ?? 'unknown'}) — nothing changed`) : 'Running…'}
        </p>
      ))}
    </div>
  );
}

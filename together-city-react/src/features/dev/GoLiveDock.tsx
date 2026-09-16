import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/auth.store';
import { useCitySwitches } from '@/hooks/useCityDesign';
import { releaseApi, usePendingChanges } from './release.api';

/**
 * ── A GO LIVE BUTTON WHEREVER THERE IS A CHANGE (owner, 16 Sep) ─────────────
 *
 * "I want a go live button wherever there is a change in the developer site."
 *
 * On dev.togethercity.app, for the owner, whenever `develop` holds changes
 * that togethercity.app does not, a small button sits in the corner of every
 * page (Mira has the other corner). It lists what is waiting and releases all
 * of it — the same release as /dev: built first, and only then sent live.
 *
 * WHAT IT DOES NOT DO. It does not appear on the live site, for anybody else,
 * or when nothing is waiting. Reading what is waiting needs only the owner's
 * session; pressing asks for the /dev password, which is never stored.
 * Which hubs the live site shows is kept as it is — change that on /dev.
 */
const dock: CSSProperties = { position: 'fixed', left: 16, bottom: 'calc(var(--safe-bottom, 0px) + 16px)', zIndex: 180 };
const panel: CSSProperties = { position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--safe-bottom, 0px) + 16px)',
  zIndex: 250, maxWidth: 420, maxHeight: 'min(78vh, 640px)', overflowY: 'auto', display: 'grid', gap: 10, padding: '16px 18px' };
const field: CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' };
const small: CSSProperties = { fontSize: 12.5, margin: 0, lineHeight: 1.55 };

export function GoLiveDock() {
  const { pathname } = useLocation();
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const { channel } = useCitySwitches();
  const onDevCopy = channel === 'dev' && authed;
  const pending = usePendingChanges(onDevCopy);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const waiting = pending.data?.waiting ?? 0;
  // /dev has the full panel already; everywhere else, only when something waits.
  if (!onDevCopy || pathname.startsWith('/dev') || (!sentTo && waiting < 1)) return null;

  const ready = password.length > 0 && reason.trim().length >= 8 && !busy;
  const press = async () => {
    setBusy(true); setErr(null);
    try {
      const state = await releaseApi.state(password);
      const hubs = state.hubs.filter((h) => h.live).map((h) => h.key);
      const res = await releaseApi.goLive(password, hubs, reason.trim());
      setSentTo(res.runsUrl);
      setPassword(''); setReason('');
      void qc.invalidateQueries({ queryKey: ['release', 'pending'] });
    } catch (e: unknown) {
      const m = e as { response?: { status?: number; data?: { message?: string | string[] } } };
      const raw = m?.response?.data?.message;
      setErr(m?.response?.status === 403 ? 'Wrong password.'
        : Array.isArray(raw) ? raw.join(', ') : raw ?? 'The release could not be started.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div style={dock}>
        <Button variant="accent" size="sm" onClick={() => setOpen(true)}
          aria-label={sentTo ? 'Release started' : `Go live: ${waiting} change${waiting === 1 ? '' : 's'} waiting`}>
          {sentTo ? 'Going live…' : `Go live · ${waiting}`}
        </Button>
      </div>
    );
  }

  return (
    <section className="card" style={panel} role="dialog" aria-label="Go live">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>{sentTo ? 'Release started' : 'Not live yet'}</strong>
        <Button variant="line" size="sm" onClick={() => setOpen(false)} aria-label="Close">Close</Button>
      </div>

      {sentTo ? (
        <p style={small} role="status">
          GitHub is building this copy. If it builds, togethercity.app updates in a few minutes; if it
          does not, nothing changes. <a href={sentTo} target="_blank" rel="noreferrer">Watch the release</a>.
        </p>
      ) : (
        <>
          <p className="muted" style={small}>
            {waiting} change{waiting === 1 ? '' : 's'} on this developer copy {waiting === 1 ? 'is' : 'are'} not on
            togethercity.app. Go live sends all of {waiting === 1 ? 'it' : 'them'}.
          </p>
          <ol style={{ ...small, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {(pending.data?.changes ?? []).map((c) => (
              <li key={c.sha}>
                <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a>
                {c.at && <span className="muted"> · {new Date(c.at).toLocaleDateString()}</span>}
              </li>
            ))}
          </ol>
          <p className="muted" style={small}>
            Hubs stay as they are on the live site; choose which hubs are live on the developer page.
          </p>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="off" aria-label="Developer password" placeholder="Developer password" style={field} />
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
            aria-label="What is going live" placeholder="What is going live?" style={field} />
          <Button variant="accent" size="sm" disabled={!ready} onClick={() => { void press(); }}>
            {busy ? 'Asking GitHub…' : 'Send to togethercity.app'}
          </Button>
          {err && <p style={{ ...small, color: 'var(--danger-ink)' }} role="alert">{err}</p>}
        </>
      )}
    </section>
  );
}

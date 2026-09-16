import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/auth.store';
import { useCitySwitches } from '@/hooks/useCityDesign';
import { releaseApi, usePendingChanges, useReleaseStatus, type ReleaseStatus } from './release.api';
import { ChangePicker, ReleaseProgress } from './ChangePicker';

/**
 * ── A GO LIVE BUTTON WHEREVER THERE IS A CHANGE (owner, 16 Sep) ─────────────
 *
 * "I want a go live button wherever there is a change in the developer site."
 * "Also give options of what things will go live, and an option to select
 * what can go live now." "Also add if the changes have been deployed."
 *
 * On dev.togethercity.app, for the owner, whenever `develop` holds changes
 * that togethercity.app does not, a small button sits in the corner of every
 * page (Mira has the other corner). It lists what is waiting — where each
 * change lands, what it does — with a tick on each. Send everything, or only
 * the ticked ones; either way it is built first and only then sent live.
 * After the press the button follows the release: building, deploying, live.
 *
 * WHAT IT DOES NOT DO. It does not appear on the live site, for anybody else,
 * or when nothing is waiting or moving. Reading needs only the owner's
 * session; pressing asks for the /dev password, which is never stored.
 * Which hubs the live site shows is kept as it is — change that on /dev.
 */
const dock: CSSProperties = { position: 'fixed', left: 16, bottom: 'calc(var(--safe-bottom, 0px) + 16px)', zIndex: 180 };
const panel: CSSProperties = { position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--safe-bottom, 0px) + 16px)',
  zIndex: 250, maxWidth: 460, maxHeight: 'min(82vh, 720px)', overflowY: 'auto', display: 'grid', gap: 10, padding: '16px 18px' };
const field: CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' };
const small: CSSProperties = { fontSize: 12.5, margin: 0, lineHeight: 1.55 };
const SIX_HOURS = 6 * 60 * 60_000;

/** Right after a press GitHub has not listed the new run yet: that is still "building". */
function stageAfter(status: ReleaseStatus | undefined, sentAt: number | null): ReleaseStatus['stage'] {
  const stage = status?.stage ?? 'none';
  if (sentAt === null) return stage;
  const run = status?.run;
  if (!run || Date.parse(run.createdAt) < sentAt - 30_000) return 'building';
  return stage;
}

export function GoLiveDock() {
  const { pathname } = useLocation();
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const { channel } = useCitySwitches();
  const onDevCopy = channel === 'dev' && authed;
  const pending = usePendingChanges(onDevCopy);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const status = useReleaseStatus(onDevCopy, sentAt !== null);
  const stage = stageAfter(status.data, sentAt);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  // Once it has landed (or stopped), the pending list is stale.
  useEffect(() => {
    if (stage === 'deployed' || stage === 'failed') void qc.invalidateQueries({ queryKey: ['release', 'pending'] });
  }, [stage, qc]);

  const waiting = pending.data?.waiting ?? 0;
  const changes = pending.data?.changes ?? [];
  const lastRun = status.data?.run ? Date.parse(status.data.run.createdAt) : 0;
  const moving = stage === 'building' || stage === 'deploying'
    || ((stage === 'failed' || stage === 'deploy-failed') && Date.now() - lastRun < SIX_HOURS);
  const sentTo = sentAt !== null;
  // /dev has the full panel already; everywhere else, only when something waits or moves.
  if (!onDevCopy || pathname.startsWith('/dev') || (!sentTo && !moving && waiting < 1)) return null;

  const picked = changes.filter((c) => !off.has(c.sha)).map((c) => c.sha);
  // Everything ticked (and nothing beyond the list): send everything, as a merge.
  const everything = off.size === 0 || picked.length === changes.length;
  const sendAll = everything;
  const ready = password.length > 0 && reason.trim().length >= 8 && picked.length > 0 && !busy;

  const press = async () => {
    setBusy(true); setErr(null);
    try {
      const state = await releaseApi.state(password);
      const hubs = state.hubs.filter((h) => h.live).map((h) => h.key);
      await releaseApi.goLive(password, hubs, reason.trim(), sendAll ? undefined : picked);
      setSentAt(Date.now());
      setPassword(''); setReason(''); setOff(new Set());
      void qc.invalidateQueries({ queryKey: ['release'] });
    } catch (e: unknown) {
      const m = e as { response?: { status?: number; data?: { message?: string | string[] } } };
      const raw = m?.response?.data?.message;
      setErr(m?.response?.status === 403 ? 'Wrong password.'
        : Array.isArray(raw) ? raw.join(', ') : raw ?? 'The release could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const label = stage === 'building' ? 'Building…'
    : stage === 'deploying' ? 'Deploying…'
    : stage === 'failed' || stage === 'deploy-failed' ? 'Release stopped'
    : sentTo && stage === 'deployed' ? 'Live now'
    : `Go live · ${waiting}`;

  if (!open) {
    return (
      <div style={dock}>
        <Button variant="accent" size="sm" onClick={() => setOpen(true)}
          aria-label={waiting > 0 ? `Go live: ${waiting} change${waiting === 1 ? '' : 's'} waiting. ${label}` : label}>
          {label}
        </Button>
      </div>
    );
  }

  const close = () => {
    setOpen(false);
    // A finished release needs no more watching.
    if (stage === 'deployed' || stage === 'failed' || stage === 'deploy-failed') setSentAt(null);
  };

  return (
    <section className="card" style={panel} role="dialog" aria-label="Go live">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>Go live</strong>
        <Button variant="line" size="sm" onClick={close} aria-label="Close">Close</Button>
      </div>

      {(sentTo || moving || stage === 'deployed') && <ReleaseProgress status={status.data && { ...status.data, stage }} />}

      {waiting > 0 && (
        <>
          <p className="muted" style={small}>
            {waiting} change{waiting === 1 ? '' : 's'} on this developer copy {waiting === 1 ? 'is' : 'are'} not on
            togethercity.app. Untick anything that should wait.
            {waiting > changes.length && ` Only the newest ${changes.length} are listed; sending all of them sends every one.`}
          </p>
          <ChangePicker changes={changes} off={off} onChange={setOff} disabled={busy || stage === 'building'} />
          <p className="muted" style={small}>
            Hubs stay as they are on the live site; choose which hubs are live on the developer page.
          </p>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="off" aria-label="Developer password" placeholder="Developer password" style={field} />
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
            aria-label="What is going live" placeholder="What is going live?" style={field} />
          <Button variant="accent" size="sm" disabled={!ready || stage === 'building'} onClick={() => { void press(); }}>
            {busy ? 'Asking GitHub…'
              : sendAll ? `Send all ${waiting} to togethercity.app`
              : `Send ${picked.length} chosen to togethercity.app`}
          </Button>
          {stage === 'building' && <p className="muted" style={small}>One release at a time — wait for this one to finish.</p>}
          {err && <p style={{ ...small, color: 'var(--danger-ink)' }} role="alert">{err}</p>}
        </>
      )}
    </section>
  );
}

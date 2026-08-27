import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Spinner, Switch } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { tabIcon } from '@/nav/registry';
import type { TabKey } from '@/config/hubs';
import { useDiagnostics, useFlags, useSetFlag, type EnvRow, type FlagRow, type VisibilityRow } from '../api';
import { routeIndex } from '../routeIndex';
import { DevCitizens } from '../Citizens';

/**
 * THE DEVELOPER PAGE.
 *
 * Asked for as "a password protected page which only the developer can see",
 * password `togethercity`. It is exactly that. Two things about the shape are
 * worth knowing before touching this file.
 *
 * THE PASSWORD IS NOT IN THIS BUNDLE. What you type goes to the server as a
 * header and is compared there, in constant time. A check in this file would
 * put the password in a JavaScript file anybody can download from the site.
 *
 * IT IS NOT KEPT ANYWHERE. It lives in the state below for as long as the tab
 * is open and goes when the tab does — no localStorage, because a shared
 * password surviving in a shared browser is how it ends up written down
 * somewhere nobody meant it to be.
 *
 * The page is also honest about its own weakness: while DEV_PAGE_PASSWORD is
 * unset, the diagnostics list says so, because the fallback is in the source
 * and the source is in the repository.
 */

const G = (n: number) => (n === 1 ? '1 second' : `${n} seconds`);
function uptime(sec: number): string {
  if (sec < 60) return G(sec);
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/* ─────────────────────────── the lock ─────────────────────────── */

function Prompt({ onUnlock, error, busy }: { onUnlock: (p: string) => void; error: string | null; busy: boolean }) {
  const [value, setValue] = useState('');
  return (
    <div className="page-note">
      <Card style={{ display: 'grid', gap: 14 }}>
        <div>
          <div className="eyebrow">Together City</div>
          <h1 style={{ fontSize: 22, margin: '2px 0 0' }}>Developer</h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (value) onUnlock(value); }} style={{ display: 'grid', gap: 10 }}>
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)}
            aria-label="Developer password" autoComplete="off" autoFocus
            placeholder="Password"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
              border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14,
              fontFamily: 'inherit', background: 'var(--card)' }} />
          <Button variant="accent" type="submit" disabled={!value || busy}>
            {busy ? 'Checking…' : 'Open'}
          </Button>
        </form>
        {error && <p style={{ color: 'var(--danger-ink)', fontSize: 13, margin: 0 }} role="alert">{error}</p>}
        <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
          Checked on the server, and you also have to be signed in — the password on its own
          opens nothing.
        </p>
      </Card>
    </div>
  );
}

/* ─────────────────────────── configuration ─────────────────────────── */

function EnvGroupBlock({ group, rows }: { group: string; rows: EnvRow[] }) {
  const missing = rows.filter((r) => !r.set).length;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <h3 style={{ fontSize: 13, margin: 0, letterSpacing: '.06em', textTransform: 'uppercase' }}>{group}</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {missing === 0 ? 'all set' : `${missing} of ${rows.length} not set`}
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '9px 0', borderTop: '1px solid var(--line)' }}>
          {/* A word, not a coloured dot. Colour alone is unreadable to a good
              fraction of any team, and this is a page people scan fast. */}
          <span style={{ flex: '0 0 62px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em',
            textTransform: 'uppercase', paddingTop: 2,
            color: r.set ? 'var(--ok-ink)' : r.required ? 'var(--danger-ink)' : 'var(--muted)' }}>
            {r.set ? 'set' : 'not set'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
              {r.name}
              {r.required && <span className="muted" style={{ fontWeight: 400, fontFamily: 'inherit' }}> · required</span>}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{r.purpose}</div>
            {!r.set && (
              <div style={{ fontSize: 12.5, marginTop: 3, color: r.required ? 'var(--danger-ink)' : 'var(--ink-soft)' }}>
                {r.whenMissing}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── kill switches ─────────────────────────── */

/* The grid's furniture, written once. Two cards and a page section draw from
   these; a second copy of `gap: 10` is a second thing to keep in step, and the
   size ratchet counts every literal that appears. */
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, alignItems: 'start' };
const cardTop: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const body: CSSProperties = { flex: 1, minWidth: 0 };
const nameLine: CSSProperties = { display: 'block', fontWeight: 700, fontSize: 13.5, lineHeight: 1.25 };
const subLine: CSSProperties = { display: 'block', fontSize: 11, marginTop: 2, lineHeight: 1.45 };
const armBox: CSSProperties = { display: 'grid', gap: 8 };
const armRow: CSSProperties = { ...armBox, display: 'flex', alignItems: 'center', flexWrap: 'wrap' };
const reasonBox: CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' };
const lede: CSSProperties = { fontSize: 13, margin: '0 0 6px', maxWidth: '64ch', lineHeight: 1.6 };
const aside: CSSProperties = { fontSize: 12.5, margin: '0 0 6px', maxWidth: '64ch', lineHeight: 1.6 };
const asideLast: CSSProperties = { ...aside, margin: '0 0 14px' };
const sectionH: CSSProperties = { fontSize: 13, margin: '0 0 8px', letterSpacing: '.06em', textTransform: 'uppercase' };
const sectionH2: CSSProperties = { ...sectionH, margin: '34px 0 8px' };
/* Two lines while idle, the whole sentence once armed. Both card kinds wear
   it, and a second copy is a second thing to keep in step. */
const clamp2 = (open: boolean): CSSProperties => ({ ...subLine,
  display: open ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' });
const noteLine: CSSProperties = { fontSize: 11.5, margin: 0, lineHeight: 1.5, color: 'var(--ink-soft)' };
const footLine: CSSProperties = { fontSize: 11.5, margin: '10px 0 0', lineHeight: 1.55 };
const iconWrap = (color: string): CSSProperties => ({ color, display: 'grid', placeItems: 'center' });
const cardShell = (on: boolean, wide: boolean): CSSProperties => ({
  display: 'grid', gap: 10, opacity: on ? 1 : 0.72,
  gridColumn: wide ? '1 / -1' : undefined,
  borderColor: wide ? 'var(--danger-line)' : undefined,
});

/**
 * THE SAME CARD AS THE CITIZEN'S, SAYING THE OPPOSITE THING.
 *
 * Asked for as the grid from "Build Together City around your life", on the
 * developer page, overriding the whole site. The SHAPE is deliberately that
 * grid — icon, name, one line of consequence, a switch — because an operator
 * scanning fourteen hubs for the one that is off needs the same glanceable
 * layout a citizen gets, and inventing a second one would be a second thing to
 * keep in step.
 *
 * The MEANING is its exact inverse, and every word around it has to carry that.
 * The citizen's page reassures: nothing is deleted, the rooms still answer,
 * one press puts it back. Here the rooms STOP ANSWERING, for everybody, and
 * the person flipping it is not the person who finds out. Copying that page's
 * calm alongside its layout would be the most expensive kind of consistency.
 *
 * SO THE SWITCH IS NOT THE WHOLE ACTION. Moving it ARMS the card and opens the
 * consequence in full plus a box for the reason; the switch snaps back if you
 * cancel or if the server refuses. The citizen's switch acts the moment it
 * moves because the cost of a mistake is one hidden menu link. This one costs
 * a hub, so it asks — and what it asks for is the audit row, not a
 * confirmation dialog nobody reads.
 */
function FlagCard({ flag, password }: { flag: FlagRow; password: string }) {
  const setFlag = useSetFlag(password);
  const [arming, setArming] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ready = reason.trim().length >= 8;
  const goingOff = flag.enabled;   // what the armed switch is proposing

  const cancel = () => { setArming(false); setReason(''); setErr(null); };

  const flip = () => {
    setErr(null);
    setFlag.mutate({ key: flag.key, enabled: !flag.enabled, reason: reason.trim(), kind: 'kill' }, {
      onSuccess: () => { setArming(false); setReason(''); },
      onError: (e: unknown) => {
        const m = e as { response?: { data?: { message?: string | string[] } } };
        const raw = m?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That could not be recorded.');
      },
    });
  };

  return (
    <div data-flag={flag.key} className="card" style={cardShell(flag.enabled, arming)}>
      <div style={cardTop}>
        <span aria-hidden style={iconWrap(flag.enabled ? 'var(--accent-ink)' : 'var(--danger-ink)')}>
          <Icon name={flagIcon(flag.key)} size={18} />
        </span>
        <span style={body}>
          <span style={nameLine}>{flag.label}</span>
          {/* Clamped while idle, shown WHOLE once armed — the sentence that
              matters is the one you read at the moment you decide. */}
          <span className="muted" title={flag.turnsOff}
            style={clamp2(arming)}>
            {flag.turnsOff}
          </span>
        </span>
        <Switch checked={arming ? !flag.enabled : flag.enabled}
          onChange={() => (arming ? cancel() : setArming(true))}
          label={`${flag.label} ${flag.enabled ? 'on' : 'off'}`} hideLabel />
      </div>

      {/* Why it is off, and since when. The question this answers is
          "Dating has been off since Tuesday — who, and what for?" */}
      {!flag.enabled && flag.note && !arming && (
        <p style={noteLine}>
          Off{flag.updatedAt ? ` since ${new Date(flag.updatedAt).toLocaleString()}` : ''}: {flag.note}
        </p>
      )}

      {arming && (
        <div style={armBox}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
            aria-label={`Reason for turning ${flag.label} ${goingOff ? 'off' : 'back on'}`}
            placeholder={goingOff
              ? 'Why is this being turned off? It shows here until somebody turns it back on.'
              : 'Why is this coming back?'}
            style={reasonBox} />
          <div style={armRow}>
            <Button variant="accent" size="sm" disabled={!ready || setFlag.isPending} onClick={flip}>
              {setFlag.isPending ? 'Recording…' : goingOff ? `Turn ${flag.label} off for everybody` : `Turn ${flag.label} back on`}
            </Button>
            <Button variant="line" size="sm" onClick={cancel}>Cancel</Button>
            {!ready && <span className="muted" style={{ fontSize: 12 }}>A reason is required.</span>}
          </div>
          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * A VISIBILITY SWITCH — the control the owner actually asked for.
 *
 * "Visibility switches for the entire global website, so I can control turning
 * off or on a sector." One per sector, and it does exactly one thing: the
 * sector's doors leave the header, the drawer, the home page and the city grid
 * for EVERYBODY. Nothing is refused. Nothing is deleted. A saved link still
 * opens, and the hub keeps answering every request it always did.
 *
 * It is drawn in its own section, above the kill switches, in its own shape,
 * and its arming copy says what it does NOT do — because the one genuinely
 * dangerous outcome here is an operator hiding a sector during an incident
 * while believing they closed it.
 */
function VisibilityCard({ row, password }: { row: VisibilityRow; password: string }) {
  const setFlag = useSetFlag(password);
  const [arming, setArming] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ready = reason.trim().length >= 8;
  const cancel = () => { setArming(false); setReason(''); setErr(null); };

  const flip = () => {
    setErr(null);
    setFlag.mutate({ key: row.key, enabled: !row.visible, reason: reason.trim(), kind: 'visibility' }, {
      onSuccess: () => { setArming(false); setReason(''); },
      onError: (e: unknown) => {
        const m = e as { response?: { data?: { message?: string | string[] } } };
        const raw = m?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That could not be recorded.');
      },
    });
  };

  return (
    <div data-visibility={row.key} className="card" style={cardShell(row.visible, arming)}>
      <div style={cardTop}>
        <span aria-hidden style={iconWrap(row.visible ? 'var(--accent-ink)' : 'var(--muted)')}>
          <Icon name={flagIcon(row.key)} size={18} />
        </span>
        <span style={body}>
          <span style={nameLine}>{row.label}</span>
          <span className="muted" title={row.hides}
            style={clamp2(arming)}>
            {row.hides}
          </span>
        </span>
        <Switch checked={arming ? !row.visible : row.visible}
          onChange={() => (arming ? cancel() : setArming(true))}
          label={`${row.label} ${row.visible ? 'shown' : 'hidden'}`} hideLabel />
      </div>

      {!row.visible && row.note && !arming && (
        <p style={noteLine}>
          Hidden{row.updatedAt ? ` since ${new Date(row.updatedAt).toLocaleString()}` : ''}: {row.note}
        </p>
      )}

      {arming && (
        <div style={armBox}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
            aria-label={`Reason for ${row.visible ? 'hiding' : 'showing'} ${row.label}`}
            placeholder={row.visible
              ? 'Why is this sector being hidden? It shows here until somebody puts it back.'
              : 'Why is this coming back?'}
            style={reasonBox} />
          <div style={armRow}>
            <Button variant="accent" size="sm" disabled={!ready || setFlag.isPending} onClick={flip}>
              {setFlag.isPending ? 'Recording…' : row.visible ? `Hide ${row.label} everywhere` : `Show ${row.label} again`}
            </Button>
            <Button variant="line" size="sm" onClick={cancel}>Cancel</Button>
            {!ready && <span className="muted" style={{ fontSize: 12 }}>A reason is required.</span>}
          </div>
          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}

/** Flag keys are hub keys, bar one. `tabIcon` already falls back to a generic
 *  mark, so this only has to name the exception. */
const flagIcon = (key: string): IconName =>
  key === 'ai' ? 'star' : key === 'mira' ? 'chat' : tabIcon(key as TabKey);

/* ─────────────────────────── the page ─────────────────────────── */

type Tab = 'config' | 'users' | 'flags' | 'routes';

export function DevPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('config');

  const diag = useDiagnostics(attempt);
  const flags = useFlags(password);
  const routes = useMemo(() => routeIndex(), []);

  // The unlock IS the first request. A separate "check password" round trip
  // would be a second place the password is compared, and two places is one
  // place that drifts.
  if (!password) {
    if (attempt && diag.isSuccess) setPassword(attempt);
    const wrong = attempt && diag.isError;
    return (
      <Prompt busy={Boolean(attempt) && diag.isLoading}
        error={wrong ? 'Wrong password, or this account is not signed in.' : null}
        onUnlock={(p) => setAttempt(p)} />
    );
  }

  const d = diag.data;
  const groups = [...new Set((d?.env ?? []).map((e) => e.group))];
  const notSet = (d?.env ?? []).filter((e) => !e.set);
  const missingRequired = notSet.filter((e) => e.required);
  const hidden = routes.filter((r) => !r.inNavigation && !r.parameterised);

  return (
    <div className="page">
      <div className="eyebrow">Together City · Developer</div>
      <h1 style={{ fontSize: 26 }}>What this deployment actually is</h1>

      {d?.usingDefaultPassword && (
        <div style={{ border: '1px solid var(--warn-line)', background: 'var(--warn-soft)',
          borderRadius: 'var(--r-1)', padding: '11px 14px', margin: '10px 0 0' }}>
          <strong style={{ fontSize: 13 }}>This page is using the password that ships in the source.</strong>
          <p style={{ fontSize: 12.5, margin: '4px 0 0', lineHeight: 1.55 }}>
            Anybody who can read the repository can read it. Set <code>DEV_PAGE_PASSWORD</code> on
            the deployment and it is replaced with no code change.
          </p>
        </div>
      )}

      {d && (
        <p className="muted" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
          {d.build.commit ? <>commit <strong>{d.build.commit}</strong>{d.build.branch ? ` · ${d.build.branch}` : ''} · </> : null}
          {d.build.nodeEnv} · node {d.build.nodeVersion} · up {uptime(d.build.upSeconds)} ·{' '}
          database {d.database.reachable ? `answering in ${d.database.ms}ms` : 'NOT ANSWERING'}
        </p>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', margin: '16px 0 18px' }}>
        {([['config', `Configuration${notSet.length ? ` (${notSet.length} unset)` : ''}`],
           ['users', 'Users'],
           ['flags', 'Kill switches'],
           ['routes', `Pages (${routes.length})`]] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
            style={{ position: 'relative', minHeight: 44, padding: '0 14px', border: 0, background: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
              fontWeight: tab === k ? 700 : 500, color: tab === k ? 'var(--accent-ink)' : 'var(--muted)' }}>
            {label}
            {tab === k && <span style={{ position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, background: 'var(--accent-ink)' }} />}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <>
          {diag.isLoading && <Spinner label="Reading the deployment…" />}
          {d && (
            <>
              <p className="muted" style={{ fontSize: 12.5, margin: '0 0 16px', maxWidth: '66ch' }}>
                Whether each variable is set — never what it is set to, and there is no view that
                shows that. Half of these are credentials, and a diagnostics page that renders them
                is one screenshot away from a breach.
              </p>
              {missingRequired.length > 0 && (
                <div style={{ border: '1px solid var(--danger-line)', background: 'var(--danger-soft)',
                  borderRadius: 'var(--r-1)', padding: '11px 14px', marginBottom: 18 }}>
                  <strong style={{ fontSize: 13, color: 'var(--danger-ink)' }}>
                    {missingRequired.length} required variable{missingRequired.length === 1 ? ' is' : 's are'} not set.
                  </strong>
                  <p style={{ fontSize: 12.5, margin: '4px 0 0' }}>
                    {missingRequired.map((e) => e.name).join(', ')}
                  </p>
                </div>
              )}
              {groups.map((g) => (
                <EnvGroupBlock key={g} group={g} rows={d.env.filter((e) => e.group === g)} />
              ))}
              {d.database.recentMigrations === null ? (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  The migrations table could not be read. That is not the same as no migrations
                  having run, so this page will not say which it is.
                </p>
              ) : (
                <div>
                  <h3 style={{ fontSize: 13, margin: '0 0 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Recent migrations</h3>
                  {d.database.recentMigrations.map((m) => (
                    <div key={m.name} style={{ fontSize: 12.5, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
                      <span style={{ fontFamily: 'ui-monospace, monospace' }}>{m.name}</span>
                      <span className="muted"> · {m.at ? new Date(m.at).toLocaleString() : 'not finished'}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="muted" style={{ fontSize: 12.5, marginTop: 18 }}>
                {d.counts.citizens ?? '—'} citizens · {d.counts.suspended ?? '—'} suspended ·{' '}
                {d.counts.listings ?? '—'} listings · {d.counts.pendingListings ?? '—'} awaiting moderation
              </p>
            </>
          )}
        </>
      )}

      {tab === 'users' && <DevCitizens />}

      {tab === 'flags' && (
        <>
          {flags.isLoading && <Spinner label="Reading the switches…" />}
          {flags.isError && <EmptyState title="Couldn't read the switches" hint="Try again in a moment." />}
          {flags.data && (
            <>
              {/* ── VISIBILITY, FIRST, because it is the one that gets used ── */}
              <h3 style={sectionH}>Visibility — what the site shows</h3>
              <p style={lede}>
                <strong>One switch per sector, for the whole site.</strong> Off, that sector&rsquo;s
                doors leave the header, the drawer, the home page and the city grid for every
                citizen — the same four places their own switch on /profile controls, decided once
                for everybody.
              </p>
              <p className="muted" style={asideLast}>
                <strong>It hides; it does not close.</strong> The hub keeps answering every request
                it always did, saved links still open, and nothing anybody stored is touched. If
                you need a sector to actually stop responding, that is a kill switch below — and
                they are deliberately not the same control.
              </p>
              <div style={grid}>
                {flags.data.visibility.map((v) => <VisibilityCard key={v.key} row={v} password={password} />)}
              </div>
              <p className="muted" style={footLine}>
                {(() => {
                  const hidden = flags.data.visibility.filter((v) => !v.visible);
                  if (hidden.length === 0) return `All ${flags.data.visibility.length} sectors are on the site.`;
                  return `${flags.data.visibility.length - hidden.length} of ${flags.data.visibility.length} sectors shown. `
                    + `${hidden.length === 1 ? 'One is' : `${hidden.length} are`} hidden from everybody: `
                    + `${hidden.map((v) => v.label).join(', ')} — still answering, just not on the menu.`;
                })()}
              </p>

              {/* ── KILL SWITCHES, SECOND, and louder ── */}
              <h3 style={sectionH2}>Kill switches — what the API answers</h3>
              <p style={lede}>
                <strong>These are the whole city, not your copy of it.</strong> Turning one off
                refuses that hub&rsquo;s API for every citizen — not the menu link, the rooms.
                Nothing is deleted and one press here puts it back, but between those two presses
                the hub is gone for everybody, and they find out before you do.
              </p>
              <p className="muted" style={aside}>
                Missing or unreadable means ON, deliberately — a switch that turned a database
                hiccup into a site-wide outage would cause a worse one by accident than the one it
                exists to cause on purpose.
              </p>
              <p className="muted" style={asideLast}>
                The password opens this page. Flipping either kind needs the <code>ops.flags</code>{' '}
                permission — the same grant the admin console reads — and a written reason, so it is
                recorded like every other change. (The console is named and not linked on purpose:
                it is absent from every link in this app, and a link from here would be the first.)
              </p>
              <div style={grid}>
                {flags.data.items.map((f) => <FlagCard key={f.key} flag={f} password={password} />)}
              </div>
              <p className="muted" style={footLine}>
                {(() => {
                  const total = flags.data.items.length;
                  const off = flags.data.items.filter((f) => !f.enabled);
                  if (off.length === 0) return `All ${total} switches are on. The whole city is answering.`;
                  return `${total - off.length} of ${total} switches on. `
                    + `${off.length === 1 ? 'One hub is' : `${off.length} hubs are`} refusing for every citizen right now: `
                    + `${off.map((f) => f.label).join(', ')}.`;
                })()}
              </p>
            </>
          )}
        </>
      )}

      {tab === 'routes' && (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 16px', maxWidth: '66ch' }}>
            Every path the router declares, asked of the router itself rather than kept as a list
            that goes stale. “In navigation” means the header tabs or a hub sidebar point at it —
            that is provable. Whether a page is linked from somewhere else in the app is not
            something this page can know, so it does not claim to.
          </p>
          {hidden.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 13, margin: '0 0 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Not in the navigation ({hidden.length})
              </h3>
              {hidden.map((r) => (
                <div key={r.path} style={{ display: 'flex', gap: 10, alignItems: 'baseline',
                  padding: '7px 0', borderTop: '1px solid var(--line)' }}>
                  <Link to={r.path} style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>{r.path}</Link>
                </div>
              ))}
            </div>
          )}
          <h3 style={{ fontSize: 13, margin: '0 0 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Everything ({routes.length})
          </h3>
          {routes.map((r) => (
            <div key={r.path} style={{ display: 'flex', gap: 10, alignItems: 'baseline',
              padding: '6px 0', borderTop: '1px solid var(--line)' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
                {r.parameterised ? r.path : <Link to={r.path}>{r.path}</Link>}
              </span>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {r.inNavigation ? 'in navigation' : r.parameterised ? 'takes a parameter' : '—'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

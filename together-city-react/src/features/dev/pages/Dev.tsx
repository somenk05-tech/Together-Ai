import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useDiagnostics, useFlags, useSetFlag, type EnvRow, type FlagRow } from '../api';
import { routeIndex } from '../routeIndex';

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
    <div style={{ maxWidth: 380, margin: '12vh auto 0' }}>
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
              border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14,
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

function FlagRowView({ flag, password }: { flag: FlagRow; password: string }) {
  const setFlag = useSetFlag(password);
  const [arming, setArming] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ready = reason.trim().length >= 8;

  const flip = () => {
    setErr(null);
    setFlag.mutate({ key: flag.key, enabled: !flag.enabled, reason: reason.trim() }, {
      onSuccess: () => { setArming(false); setReason(''); },
      onError: (e: unknown) => {
        const m = e as { response?: { data?: { message?: string | string[] } } };
        const raw = m?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That could not be recorded.');
      },
    });
  };

  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span style={{ flex: '0 0 46px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em',
          textTransform: 'uppercase', paddingTop: 3,
          color: flag.enabled ? 'var(--ok-ink)' : 'var(--danger-ink)' }}>
          {flag.enabled ? 'on' : 'off'}
        </span>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{flag.label}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{flag.turnsOff}</div>
          {!flag.enabled && flag.note && (
            <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--ink-soft)' }}>
              Turned off{flag.updatedAt ? ` ${new Date(flag.updatedAt).toLocaleString()}` : ''}: {flag.note}
            </div>
          )}
        </div>
        {!arming && (
          <Button variant="line" size="sm" onClick={() => setArming(true)}>
            {flag.enabled ? 'Turn off' : 'Turn back on'}
          </Button>
        )}
      </div>

      {arming && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
            aria-label={`Reason for turning ${flag.label} ${flag.enabled ? 'off' : 'back on'}`}
            placeholder={flag.enabled
              ? 'Why is this being turned off? It shows here until somebody turns it back on.'
              : 'Why is this coming back?'}
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
              border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13.5,
              fontFamily: 'inherit', background: 'var(--card)' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="accent" size="sm" disabled={!ready || setFlag.isPending} onClick={flip}>
              {setFlag.isPending ? 'Recording…' : flag.enabled ? `Turn ${flag.label} off for everybody` : `Turn ${flag.label} back on`}
            </Button>
            <Button variant="line" size="sm" onClick={() => { setArming(false); setReason(''); setErr(null); }}>Cancel</Button>
            {!ready && <span className="muted" style={{ fontSize: 12 }}>A reason is required.</span>}
          </div>
          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── the page ─────────────────────────── */

type Tab = 'config' | 'flags' | 'routes';

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
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <div className="eyebrow">Together City · Developer</div>
      <h1 style={{ fontSize: 26 }}>What this deployment actually is</h1>

      {d?.usingDefaultPassword && (
        <div style={{ border: '1px solid var(--warn-line)', background: 'var(--warn-soft)',
          borderRadius: 10, padding: '11px 14px', margin: '10px 0 0' }}>
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
                  borderRadius: 10, padding: '11px 14px', marginBottom: 18 }}>
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

      {tab === 'flags' && (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px', maxWidth: '66ch' }}>
            Turning one off refuses that hub's API for every citizen, not just its menu link.
            Missing or unreadable means ON, deliberately — a switch that turned a database hiccup
            into a site-wide outage would cause a worse one by accident than the one it exists to
            cause on purpose.
          </p>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px', maxWidth: '66ch' }}>
            The password opens this page. Flipping a switch needs the <code>ops.flags</code>{' '}
            permission — the same grant the admin console reads — and a written reason, so it is
            recorded like every other change. (The console is named and not linked on purpose:
            it is absent from every link in this app, and a link from here would be the first.)
          </p>
          {flags.isLoading && <Spinner label="Reading the switches…" />}
          {flags.isError && <EmptyState title="Couldn't read the switches" hint="Try again in a moment." />}
          {flags.data?.items.map((f) => <FlagRowView key={f.key} flag={f} password={password} />)}
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

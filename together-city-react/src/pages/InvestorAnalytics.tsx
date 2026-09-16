import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/api/client';
import { useAuthStore } from '@/store/auth.store';
import { getDashboardOverview, readForExport, type Access } from '@/features/insights/api';
import { DEFINITIONS } from '@/features/insights/definitions';
import { RANGE_LABEL, dateLabel } from '@/features/insights/format';
import { exportCsv } from '@/features/insights/export';
import {
  Acquisition, Adoption, AiSection, CityActivitySection, Depth, Engagement, Funnel, HealthSection, LiveFeed,
  Monetisation, Profile, Pulse, Reach, RetentionSection, Snapshot, Traction, WhatChanged, type Ctx,
} from '@/features/insights/sections';
import type { RangeKey } from '@/features/insights/types';

/**
 * ── /investor/analytics — THE CONTROL ROOM BEHIND THE CITY (owner, 16 Sep) ─
 *
 * "Build a production-quality investor + founder analytics dashboard … never
 * fabricate real traction … create a separate page for analytics and add the
 * link below the numbers." Linked from the live counter on the deck.
 *
 * WHO SEES WHAT. A signed-in account holding `analytics.read` (the founder)
 * sees the founder view; anybody with the deck's password sees the investor
 * view, which leaves out per-model AI detail and error-by-error health. The
 * password is held for this tab only, exactly as the deck holds it.
 *
 * WHAT IS REAL. Every number is read from the city's own tables by
 * together-city-chat/src/insights. "—" means it could not be measured, and the
 * card says why. The "Sample data" switch fills the page with round, invented
 * numbers to show its shape — every card then says SAMPLE, and the page says
 * so above everything else.
 */
const KEY_STORE = 'tc:investor-key';
const RANGES: RangeKey[] = ['24h', '7d', '30d', '90d', 'all'];

const remembered = (): string | null => {
  try { return sessionStorage.getItem(KEY_STORE); } catch { return null; }
};
const remember = (v: string | null) => {
  try { if (v) sessionStorage.setItem(KEY_STORE, v); else sessionStorage.removeItem(KEY_STORE); } catch { /* asked again */ }
};
const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

/** Which door this visitor can open: the founder's, the investor's, or neither yet. */
function useAccess(): { access: Access | null; checking: boolean; failed: (() => void) | null; setKey: (k: string | null) => void } {
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const [key, setKeyState] = useState<string | null>(remembered);
  const founder = useQuery({
    queryKey: ['insights', 'founder-door'],
    queryFn: () => http.get('/insights', { params: { section: 'health' } }).then(() => true),
    enabled: authed,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const setKey = (k: string | null) => { remember(k); setKeyState(k); };
  if (authed && founder.isLoading) return { access: null, checking: true, failed: null, setKey };
  if (authed && founder.data) return { access: { kind: 'founder' }, checking: false, failed: null, setKey };
  if (key) return { access: { kind: 'investor', password: key }, checking: false, failed: null, setKey };
  // A signed-in check that failed for any reason but "not allowed" is a
  // connection problem, and says so rather than asking for a password.
  const down = authed && founder.isError && ![401, 403].includes(statusOf(founder.error) ?? 0);
  return { access: null, checking: false, failed: down ? () => { void founder.refetch(); } : null, setKey };
}

export function InvestorAnalytics() {
  const { access, checking, failed, setKey } = useAccess();
  if (checking) return <main className="ix ix-center"><p className="ix-sub">Opening the control room…</p></main>;
  if (failed) {
    return (
      <main className="ix ix-center">
        <p className="ix-sub" role="alert">The city did not answer. <button type="button" className="ix-link" onClick={failed}>Try again</button></p>
      </main>
    );
  }
  if (!access) return <Gate onOpen={setKey} />;
  return <Dashboard access={access} onLock={() => setKey(null)} />;
}

function Gate({ onOpen }: { onOpen: (k: string) => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value || busy) return;
    setBusy(true); setError(null);
    try {
      await http.get('/insights/investor', { params: { section: 'health' }, headers: { 'x-investor-password': value } });
      onOpen(value);
    } catch (err) {
      setError(statusOf(err) === 403 ? 'Wrong password.' : statusOf(err) === 429 ? 'Too many tries. Wait a minute.' : 'The city did not answer. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="ix ix-center">
      <form className="ix-gate" onSubmit={(e) => { void submit(e); }}>
        <p className="ix-eyebrow">Together City · Investor</p>
        <h1 className="ix-h1">Product intelligence</h1>
        <label className="ix-sub" htmlFor="ix-key">Enter the investor password, or sign in with an account that holds analytics access.</label>
        <input id="ix-key" type="password" autoComplete="current-password" value={value}
          onChange={(e) => setValue(e.target.value)} placeholder="Password" />
        <button type="submit" className="btn btn-accent" disabled={!value || busy}>{busy ? 'Checking…' : 'Open'}</button>
        {error && <p className="ix-error" role="alert">{error}</p>}
        <Link className="ix-link" to="/investor">← Back to the deck</Link>
      </form>
    </main>
  );
}

function Dashboard({ access, onLock }: { access: Access; onLock: () => void }) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [sample, setSample] = useState(false);
  const [present, setPresent] = useState(false);
  const [asInvestor, setAsInvestor] = useState(false);
  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['insights'] });
  const founder = access.kind === 'founder' && !asInvestor;
  const ctx: Ctx = { range, access, sample, founder, present };

  // The investor view of a founder is the same data with the founder-only parts hidden.
  const overview = useQuery({
    queryKey: ['insights', 'overview', range, access.kind, sample],
    queryFn: () => getDashboardOverview(range, access),
    enabled: !sample,
    staleTime: 30_000,
  });
  const locked = statusOf(overview.error) === 403;
  useEffect(() => { if (locked && access.kind === 'investor') onLock(); }, [locked, access.kind, onLock]);
  const [updated, setUpdated] = useState<number>(Date.now());
  useEffect(() => { if (overview.dataUpdatedAt) setUpdated(overview.dataUpdatedAt); }, [overview.dataUpdatedAt]);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 15_000); return () => window.clearInterval(t); }, []);
  const ago = Math.round((Date.now() - updated) / 60_000);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPresent(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const doExport = async (kind: 'csv' | 'pdf' | 'snapshot') => {
    if (kind === 'csv') {
      setExporting(true);
      try {
        exportCsv({ range, sample, ...(await readForExport(range, access, sample)) });
      } finally {
        setExporting(false);
      }
      return;
    }
    if (kind === 'snapshot') setPresent(true);
    window.setTimeout(() => window.print(), 150);
  };

  return (
    <main className={`ix${present ? ' ix-present' : ''}${sample ? ' ix-is-sample' : ''}`}>
      <header className="ix-top">
        <div className="ix-brand">
          <Link to="/investor" className="ix-wordmark">Together City</Link>
          <span className="ix-eyebrow">{founder ? 'Founder' : 'Investor'} · Product intelligence</span>
        </div>
        <div className="ix-controls">
          <span className={`ix-live${fetching ? ' busy' : ''}`}>
            <span className="ix-live-dot" aria-hidden /> Live · updated {ago < 1 ? 'just now' : `${ago} min ago`}
          </span>
          <div className="ix-seg" role="radiogroup" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={range === r}
                className={range === r ? 'on' : undefined} onClick={() => setRange(r)}>
                {r === 'all' ? 'All time' : r.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="ix-btn" onClick={() => { void qc.invalidateQueries({ queryKey: ['insights'] }); }}
            aria-label="Refresh every section">Refresh</button>
          <details className="ix-menu">
            <summary className="ix-btn">{exporting ? 'Exporting…' : 'Export'}</summary>
            <div className="ix-menu-list">
              <button type="button" onClick={() => { void doExport('csv'); }}>CSV — every number on this page</button>
              <button type="button" onClick={() => { void doExport('pdf'); }}>PDF — print this page</button>
              <button type="button" onClick={() => { void doExport('snapshot'); }}>Investor snapshot — presentation, printed</button>
            </div>
          </details>
          {access.kind === 'founder' && (
            <button type="button" className="ix-btn" aria-pressed={asInvestor} onClick={() => setAsInvestor((v) => !v)}>
              {asInvestor ? 'Founder view' : 'Investor view'}
            </button>
          )}
          <button type="button" className="ix-btn" aria-pressed={present} onClick={() => setPresent((v) => !v)}>
            {present ? 'Exit presentation' : 'Present'}
          </button>
          <label className="ix-toggle">
            <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> Sample data
          </label>
        </div>
      </header>

      {sample && (
        <p className="ix-banner" role="status">
          SAMPLE DATA — invented numbers that show the page’s shape. They are not Together City’s. Turn off “Sample data” to see the real city.
        </p>
      )}
      {!sample && overview.data && (
        <p className="ix-counting">
          Live · counting since {overview.data.countingSince ? dateLabel(overview.data.countingSince) : 'the first visit'}
          {overview.data.tracking.memberDays ? ` · daily activity recorded from ${dateLabel(`${overview.data.tracking.memberDays}T00:00:00Z`)}` : ''}
          {' '}· {RANGE_LABEL[range]}
        </p>
      )}

      <div className="ix-body">
        <Snapshot ctx={ctx} />
        <Pulse ctx={ctx} />
        {!present && <WhatChanged ctx={ctx} />}
        <Traction ctx={ctx} />
        {!present && <Funnel ctx={ctx} />}
        <CityActivitySection ctx={ctx} />
        {!present && <Adoption ctx={ctx} />}
        <Depth ctx={ctx} />
        {!present && <Engagement ctx={ctx} />}
        <RetentionSection ctx={ctx} />
        <AiSection ctx={ctx} />
        {!present && <Acquisition ctx={ctx} />}
        <Reach ctx={ctx} />
        {!present && <Profile ctx={ctx} />}
        <Monetisation ctx={ctx} />
        {!present && <HealthSection ctx={ctx} />}
        {!present && <LiveFeed ctx={ctx} />}
        {!present && (
          <section className="ix-sec" id="definitions" aria-labelledby="definitions-h">
            <header className="ix-sec-head"><h2 className="ix-h2" id="definitions-h">How every number is counted</h2></header>
            <details className="ix-table-fold">
              <summary>Read the definitions<span className="fold-state" aria-hidden /></summary>
              <dl className="ix-defs">
                {Object.entries(DEFINITIONS).map(([k, v]) => (
                  <div key={k}><dt>{k.replace(/^stage_/, 'journey: ').replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </details>
          </section>
        )}
      </div>

      <footer className="ix-foot">
        <span>Together City · the control room behind the city</span>
        {access.kind === 'investor' && <button type="button" className="ix-link" onClick={onLock}>Lock</button>}
        <Link className="ix-link" to="/investor">Back to the deck</Link>
      </footer>
    </main>
  );
}

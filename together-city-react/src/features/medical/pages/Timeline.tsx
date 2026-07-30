import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Spinner, EmptyState } from '@/components/ui';
import { useRecords, useConsults, useBloodHistory } from '../api';

interface TLItem { date: Date; label: string; title: string; note?: string; icon: string }

const fmt = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
const label = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Health Timeline — your own longitudinal history: doctor appointments, tests
 *  and records, plotted in date order. Individual only; no dummy data. */
export function Timeline() {
  const records = useRecords();
  const consults = useConsults();
  const blood = useBloodHistory();

  const loading = records.isLoading || consults.isLoading || blood.isLoading;

  const items: TLItem[] = useMemo(() => {
    const out: TLItem[] = [];
    for (const c of consults.data ?? []) {
      const d = fmt(c.scheduledAt) ?? fmt(c.createdAt);
      if (!d) continue;
      const scheduled = fmt(c.scheduledAt) && d.getTime() > Date.now();
      out.push({
        date: d, icon: '🩺',
        label: label(d),
        title: `${c.doctorName}${c.specialty ? ` — ${c.specialty}` : ''}`,
        note: [c.reason, scheduled ? 'Upcoming appointment' : c.status].filter(Boolean).join(' · ') || undefined,
      });
    }
    for (const r of records.data ?? []) {
      const d = fmt(r.recordedOn);
      if (!d) continue;
      out.push({ date: d, icon: '📄', label: label(d), title: r.title || r.kind, note: r.detail || undefined });
    }
    for (const b of blood.data?.items ?? []) {
      const d = fmt(b.takenOn);
      if (!d) continue;
      const flags = b.alertCount > 0 ? `${b.alertCount} flagged` : b.flagged?.length ? `${b.flagged.length} to watch` : 'all in range';
      out.push({
        date: d, icon: '🩸', label: label(d),
        title: `Blood test${b.lab ? ` — ${b.lab}` : ''}`,
        note: `${b.markerCount} markers · ${flags}`,
      });
    }
    return out.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [records.data, consults.data, blood.data]);

  return (
    <>
      <div className="rise" style={{ marginBottom: 26 }}>
        <div className="eyebrow">Medical Hub · Timeline</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Health Timeline</h1>
        <p className="lede" style={{ marginTop: 6 }}>Your doctor appointments, tests and records — plotted across your years, in date order.</p>
      </div>

      {loading && <Spinner label="Building your timeline…" />}

      {!loading && items.length === 0 && (
        <EmptyState icon="🗓️" title="Your timeline is empty"
          hint="Book a doctor consult, save a record, or add a blood test and it will appear here automatically." />
      )}

      {!loading && items.length > 0 && (
        <div className="rise d2" style={{ position: 'relative', paddingLeft: 28, margin: '20px 0' }}>
          <span style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, background: 'var(--line)' }} />
          {items.map((it, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 22 }}>
              <span style={{ position: 'absolute', left: -28, top: 4, width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--card)', boxShadow: '0 0 0 2px var(--accent)' }} />
              <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>{it.label}</div>
              <h4>{it.icon} {it.title}</h4>
              {it.note && <p className="muted" style={{ fontSize: 12.5 }}>{it.note}</p>}
            </div>
          ))}
        </div>
      )}

      <section className="blk rise d3">
        <div className="blk-head"><h2>Take action</h2></div>
        <div className="grid3">
          <Link className="card lift" to="/medical/records" style={{ display: 'block' }}><h4>Open a record</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Jump to the source report or visit note.</p></Link>
          <Link className="card lift" to="/medical/tests" style={{ display: 'block' }}><h4>Book a test</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Add a new blood test or health screen.</p></Link>
          <Link className="card lift" to="/medical/connections" style={{ display: 'block' }}><h4>Share with a doctor</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Consent-scoped, expiring link.</p></Link>
        </div>
      </section>

      <div className="trust">
        <span>◈ Your Longitudinal History</span><span>◈ Auto-Plotted from Records</span><span>◈ Private to You</span><span>◈ Shareable, Consent-Scoped</span>
      </div>
    </>
  );
}

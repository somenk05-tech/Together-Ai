import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner, EmptyState } from '@/components/ui';
import { useConsents, useSetConsent } from '../api';

const BLURB: Record<string, string> = {
  nutrition: 'Blood work powers your meal plans & supplement dosage',
  beauty: 'Skin & hormone panels sharpen skincare recommendations',
  fitness: 'Core connection — vitals, steps & sleep sync',
};

const audit = [
  { icon: '◈', bg: 'var(--green-soft)', fg: 'var(--green)', t: 'Nutrition Hub viewed your Vitamin D panel', m: '12 Jul 2026, 9:14 AM' },
  { icon: '◈', bg: 'var(--rose-soft)', fg: 'var(--rose)', t: 'Beauty Market read your Hormone & Skin Profile', m: '8 Jul 2026, 4:02 PM' },
  { icon: '✗', bg: 'var(--muted)', fg: '#fff', t: 'Consent updated — Dating access revoked', m: '2 Jun 2026' },
  { icon: '◈', bg: 'var(--green-soft)', fg: 'var(--green)', t: 'Nutrition Hub read Lipid Profile for meal planning', m: '21 Apr 2025, 8:30 AM' },
];

const directory = [
  { icon: '✚', bg: 'var(--blue-soft)', fg: 'var(--blue)', t: 'Apollo Hospitals — Bandra', m: 'Hospital · 1.2 km · cashless network', cta: 'Directions', to: '/medical/emergency' },
  { icon: '⚕', bg: 'var(--blue-soft)', fg: 'var(--blue)', t: 'Cloudnine Clinic', m: 'Clinic · Women & child care · 2.0 km', cta: 'Book', to: '/medical/consults' },
  { icon: '℞', bg: 'var(--green-soft)', fg: 'var(--green)', t: 'Wellness Forever Pharmacy', m: 'Pharmacy · Open 24/7 · 0.6 km', cta: 'Order', to: '/chats' },
  { icon: '◈', bg: 'var(--purple-soft)', fg: 'var(--purple)', t: 'Metropolis Healthcare Labs', m: 'Diagnostic Lab · NABL accredited · 1.5 km', cta: 'Book Test', to: '/medical/tests' },
  { icon: '✦', bg: 'var(--gold-soft)', fg: 'var(--gold)', t: 'Sarvodaya Wellness Centre', m: 'Wellness & Physiotherapy · 2.8 km', cta: 'Book', to: '/medical/consults' },
  { icon: '✦', bg: 'var(--gold-soft)', fg: 'var(--gold)', t: 'ReLiva Physiotherapy', m: 'Physiotherapy · Home visits available · 1.9 km', cta: 'Book', to: '/medical/consults' },
];

function ShareTag({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <span className={`tag ${on ? 'green' : 'soon'}`} style={{ cursor: 'pointer' }} onClick={onClick}>
      {on ? '● ON' : '○ OFF'}
    </span>
  );
}

/** Connections in TC — consent-gated sharing, audit log & the health services directory (ported from medical-connections.html). */
export function Connections() {
  const consents = useConsents();
  const set = useSetConsent();
  const [family, setFamily] = useState(true);

  if (consents.isLoading) return <Spinner label="Loading your connections…" />;
  if (consents.isError || !consents.data) return <EmptyState title="Couldn't load connections" hint="Start the backend and reload." />;

  return (
    <>
      <div className="rise" style={{ marginBottom: 26 }}>
        <div className="eyebrow">Medical Hub · 04</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Connections in TC</h1>
        <p className="lede" style={{ marginTop: 6 }}>Consent-gated sharing — decide exactly which hubs may read your medical data, and see who has looked.</p>
      </div>

      <section className="blk rise d1">
        <div className="blk-head"><h2>Who can see your medical data</h2></div>
        {consents.data.map((c) => (
          <div key={c.hub} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', boxShadow: 'var(--shadow)', marginBottom: 10 }}>
            <div><div style={{ fontWeight: 600 }}>{c.label} Hub</div><div className="muted" style={{ fontSize: 12.5 }}>{BLURB[c.hub] ?? c.reads}</div></div>
            <ShareTag on={c.granted} onClick={() => set.mutate({ hub: c.hub, granted: !c.granted })} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', boxShadow: 'var(--shadow)', marginBottom: 10 }}>
          <div><div style={{ fontWeight: 600 }}>Family Profiles</div><div className="muted" style={{ fontSize: 12.5 }}>Immediate family only — Ananya, Papa, Maa</div></div>
          <ShareTag on={family} onClick={() => setFamily((f) => !f)} />
        </div>
      </section>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Audit log</h2><span className="muted" style={{ fontSize: 12 }}>Last 30 days</span></div>
        <div className="rows">
          {audit.map((a, i) => (
            <div className="row" key={i}>
              <div className="av" style={{ background: a.bg, color: a.fg }}>{a.icon}</div>
              <div className="grow"><div className="t">{a.t}</div><div className="m">{a.m}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="blk rise d3">
        <div className="blk-head"><h2>Explore health &amp; wellness services within Together City</h2></div>
        <div className="rows">
          {directory.map((d) => (
            <div className="row" key={d.t}>
              <div className="thumb" style={{ background: d.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: d.fg, fontSize: 20 }}>{d.icon}</div>
              <div className="grow"><div className="t">{d.t}</div><div className="m">{d.m}</div></div>
              <Link className="btn btn-sm btn-line" to={d.to}>{d.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      <div className="trust">
        <span>◈ Consent-Gated</span><span>◈ Fully Auditable</span><span>◈ Revoke Anytime</span><span>◈ 100% Encrypted</span>
      </div>
    </>
  );
}

import { Spinner, EmptyState } from '@/components/ui';
import { useConsents, useSetConsent } from '../api';

const BLURB: Record<string, string> = {
  nutrition: 'Blood work powers your meal plans & supplement dosage',
  beauty: 'Skin & hormone panels sharpen skincare recommendations',
  fitness: 'Core connection — vitals, steps & sleep sync',
};

function ShareTag({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <span className={`tag ${on ? 'green' : 'soon'}`} style={{ cursor: 'pointer' }} onClick={onClick}>
      {on ? '● ON' : '○ OFF'}
    </span>
  );
}

/** Connections in TC — consent-gated sharing. The fabricated audit log and
 *  services directory this page shipped with were removed in FE-17.3; the
 *  consent switches below are real and take effect immediately. */
export function Connections() {
  const consents = useConsents();
  const set = useSetConsent();
  if (consents.isLoading) return <Spinner label="Loading your connections…" />;
  if (consents.isError || !consents.data) return <EmptyState title="Couldn't load connections" hint="Nothing has been granted or revoked — we couldn’t read who has access. Try again in a moment." />;

  return (
    <>
      <div className="rise" style={{ marginBottom: 26 }}>
        <div className="eyebrow">Medical Hub · 04</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Connections in TC</h1>
        <p className="lede" style={{ marginTop: 6 }}>Consent-gated sharing — you decide exactly which hubs may read your medical data, and you can change your mind at any moment.</p>
      </div>

      <section className="blk rise d1">
        <div className="blk-head"><h2>Who can see your medical data</h2></div>
        {consents.data.map((c) => (
          <div key={c.hub} className="onpaper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', boxShadow: 'var(--shadow)', marginBottom: 10 }}>
            <div><div style={{ fontWeight: 600 }}>{c.label} Hub</div><div className="muted" style={{ fontSize: 12.5 }}>{BLURB[c.hub] ?? c.reads}</div></div>
            <ShareTag on={c.granted} onClick={() => set.mutate({ hub: c.hub, granted: !c.granted })} />
          </div>
        ))}
      </section>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Who has looked</h2></div>
        <div className="card">
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
            We don’t have an honest answer for you yet. Together City does not currently record which hub read
            which part of your medical data, so anything listed here would be invented — and an invented answer
            is the last thing that belongs on a privacy page. The switches above are real: turn one off and that
            hub stops reading, immediately. A true read-by-read log is what should live here, and when it exists
            this is where you will find it.
          </p>
        </div>
      </section>

      <div className="trust">
        {/* Two claims, both checkable in the code above: the consent rows gate
            every hub's read, and setConsent takes effect immediately. A third
            said "Encrypted at Rest". Nothing in this API encrypts anything —
            it was written in FE-17.2 to replace "100% Encrypted", which was the
            same fault, and swapping one unverified claim for another is not a
            fix. Removed rather than reworded: there is no true version of it
            to write yet. */}
        <span>◈ Consent-Gated</span><span>◈ Revoke Anytime</span>
      </div>
    </>
  );
}

import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { AiSuggestions } from '@/components/AiSuggestions';
import { useBeautyInsights, isConsentBlocked, type BeautyInsight } from '../api';

const statusColor = (s: string) => (s === 'low' ? '#c62828' : s === 'high' ? '#e65100' : 'var(--muted)');

function InsightCard({ ins }: { ins: BeautyInsight }) {
  return (
    <article className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15.5 }}>{ins.concern}</strong>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
          color: statusColor(ins.status), border: `1px solid ${statusColor(ins.status)}`, borderRadius: 999, padding: '1px 9px' }}>
          {ins.marker} {ins.status} · {ins.value}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>{ins.mechanism}</p>
      <p style={{ fontSize: 13.5, margin: '10px 0 0' }}><strong>What helps:</strong> {ins.advice}</p>
    </article>
  );
}

/** Biomarker Insights — the cross-hub loop. Reads Medical biomarkers only if Beauty consent is granted. */
export function Insights() {
  const q = useBeautyInsights();

  if (q.isLoading) return <Spinner label="Reading your markers…" />;

  // The consent gate: Medical returned 403 because Beauty access is revoked.
  if (q.isError && isConsentBlocked(q.error)) {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
        <div className="eyebrow">Beauty Market · Insights</div>
        <h1 style={{ fontSize: 26 }}>Beauty can't read your markers</h1>
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid #c62828' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#c62828' }}>🔒 Access revoked</div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: '8px 0 14px' }}>
            You've turned Beauty off in your Medical Hub privacy settings, so it can't read your blood
            biomarkers. This is enforced on the server — not just hidden here. Your stated-concern
            recommendations still work in the market.
          </p>
          <Link to="/medical/consent"><Button variant="accent" size="sm">Manage consent in Medical</Button></Link>
        </div>
      </div>
    );
  }
  if (q.isError || !q.data) return <EmptyState title="Couldn't load insights" hint="Start the backend and reload." />;

  const { insights, hasPanel } = q.data;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Beauty Market · Insights</div>
      <h1 style={{ fontSize: 26 }}>What your labs say for skin & hair</h1>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 4px' }}>{q.data.source}</p>

      <AiSuggestions kind="beauty" />

      {!hasPanel ? (
        <div className="card" style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            No blood panel yet. Add one in the Medical Hub and your skin/hair insights will appear here.
          </p>
          <div style={{ marginTop: 12 }}>
            <Link to="/medical/blood"><Button variant="accent" size="sm">Add a blood panel</Button></Link>
          </div>
        </div>
      ) : insights.length === 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            Good news — none of your markers point to a nutrition-linked skin or hair concern right now.
            Keep to your routine and revisit after your next panel.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {insights.map((ins) => <InsightCard key={ins.marker} ins={ins} />)}
          <Link to="/beauty/market"><Button variant="line" size="sm">See matched products →</Button></Link>
        </div>
      )}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 16 }}>{q.data.disclaimer}</p>
    </div>
  );
}

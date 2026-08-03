import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { realestateApi, priceLabel } from '../api';

/** Moderator dashboard — the pending/review queue with AI reasons + confidence.
 *  Gated server-side by the MODERATION_ADMINS handle list (403 otherwise). */
export function Moderation() {
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ['realestate', 'moderation', 'queue'], queryFn: () => realestateApi.moderationQueue(), retry: false });
  const decide = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'approved' | 'rejected'; reason?: string }) => realestateApi.moderationDecide(id, decision, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['realestate'] }),
  });

  if (queue.isLoading) return <Spinner label="Loading the queue…" />;
  if (queue.isError) return <EmptyState icon="🔒" title="Moderator access required" hint="Ask an admin to add your handle to the moderation team." />;

  const items = queue.data ?? [];
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Real Estate · Moderation</div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Review queue</h1>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>Listings awaiting a decision — automated checks below each. Approve to publish, or reject with a reason.</p>

      {items.length === 0 ? (
        <EmptyState icon="✅" title="Queue is clear" hint="No listings are pending or in manual review." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((p) => (
            <div key={p.id} className="card">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>{p.title}</h3>
                <span className="muted" style={{ fontSize: 12 }}>{p.locality}, {p.city} · {priceLabel(p.priceInr, p.listingType)} · {p.areaSqft} sqft · {p.photoCount} photos</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: p.moderation === 'review' ? 'var(--warn-ink)' : 'var(--warn-ink)' }}>
                  {p.moderation} · conf {p.result ? Math.round(p.result.confidence * 100) : '—'}% · risk {p.result?.score ?? '—'}
                </span>
              </div>

              {p.result && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 6 }}>
                  {p.result.checks.map((c) => (
                    <div key={c.name} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <span style={{ color: c.pass ? 'var(--ok-ink)' : 'var(--danger-ink)', fontWeight: 700 }}>{c.pass ? '✓' : '✕'}</span>
                      <span><strong>{c.name}</strong> — {c.detail}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <Button size="sm" variant="accent" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, decision: 'approved' })}>Approve &amp; publish</Button>
                <Button size="sm" variant="line" disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: p.id, decision: 'rejected', reason: 'Rejected by moderator.' })}>Reject</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

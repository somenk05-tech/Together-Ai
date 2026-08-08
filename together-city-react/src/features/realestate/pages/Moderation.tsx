import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { realestateApi, priceLabel } from '../api';
import { Masthead } from '../components/Masthead';

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
    <div>
      {/* MASTHEAD ONLY, AND DELIBERATELY NOTHING ELSE.
          A moderator works this page dozens of times a day and every row is a
          decision. Density is the feature here — thinning it out into ruled
          sections with air between them would mean fewer listings per screen
          for somebody paid in listings per screen. The reference's argument
          does not apply to a tool. */}
      <Masthead mark={['Review', 'Queue']} title={`${items.length} awaiting a decision`}
        nav={[
          { label: 'Explore', to: '/realestate/explore' },
          { label: 'Under construction', to: '/realestate/under-construction' },
        ]}>
        Every listing here failed an automated check or was held for a human.
        The checks are printed under each one. Approve to publish it into
        Explore, or reject it with a reason the owner will see.
      </Masthead>
      <div style={{ height: 24 }} />

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

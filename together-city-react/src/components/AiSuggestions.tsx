import { useState } from 'react';
import { Card, Button, Spinner } from '@/components/ui';
import { useAiSuggestions, type AiKind } from '@/api/ai.api';

const META: Record<AiKind, { icon: string; title: string; cta: string }> = {
  recipes: { icon: '🍲', title: 'AI meal ideas', cta: 'Suggest meals' },
  astrology: { icon: '✨', title: 'Cosmic compatibility', cta: 'Read the stars' },
  beauty: { icon: '🧴', title: 'Your beauty routine', cta: 'Suggest a routine' },
  fitness: { icon: '💪', title: 'Your training plan', cta: 'Suggest a plan' },
};

/**
 * Reusable AI-suggestions panel. Lazily loads on first "Get suggestions" tap so
 * it doesn't fire the (billable) AI call on every page view. Works with or
 * without the API key — the backend returns a deterministic fallback when off.
 */
export function AiSuggestions({ kind }: { kind: AiKind }) {
  const [open, setOpen] = useState(false);
  const q = useAiSuggestions(kind, open);
  const meta = META[kind];

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 20 }}>{meta.icon}</div>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: 0 }}>{meta.title}</h4>
          {q.data?.intro && open && <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>{q.data.intro}</p>}
        </div>
        {q.data?.aiPowered && open && <span className="tag" style={{ alignSelf: 'flex-start' }}>✨ AI</span>}
        {!open && <Button variant="accent" size="sm" onClick={() => setOpen(true)}>{meta.cta}</Button>}
        {open && <Button variant="line" size="sm" disabled={q.isFetching} onClick={() => void q.refetch()}>{q.isFetching ? '…' : '↻'}</Button>}
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {q.isLoading ? <Spinner /> : q.isError ? (
            <p className="muted" style={{ fontSize: 13 }}>Couldn’t load suggestions — try again.</p>
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>{q.data?.intro ?? 'Nothing to suggest yet — fill in your profile first.'}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {q.data!.items.map((it, i) => (
                <div key={i} style={{ padding: '10px 2px', borderTop: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{it.title}</span>
                    {it.tag && <span className="tag" style={{ fontSize: 10.5 }}>{it.tag}</span>}
                  </div>
                  <p style={{ fontSize: 13, margin: '3px 0 0', lineHeight: 1.5 }}>{it.detail}</p>
                </div>
              ))}
            </div>
          )}
          {q.data?.note && <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>{q.data.note}</p>}
        </div>
      )}
    </Card>
  );
}

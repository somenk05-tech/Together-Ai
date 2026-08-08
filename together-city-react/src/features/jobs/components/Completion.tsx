import { useProfileCompletion } from '../api';

/**
 * HOW FINISHED IS THIS PROFILE, SECTION BY SECTION.
 *
 * One number would be useless. "You are 62% complete" tells somebody nothing
 * about what to do next, and the thing they need to do next is usually one
 * specific missing sentence — so every section carries its own bar and names
 * what is missing, in the citizen's words rather than the column's.
 *
 * The overall figure is kept, small, because it is the thing people look for.
 * It is not the argument.
 */
export function Completion({ onReview }: { onReview?: () => void }) {
  const c = useProfileCompletion();

  if (c.isLoading) {
    return <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Working out what is left…</p>;
  }
  // We do not know rather than "nothing is missing". An absent answer printed
  // as a full bar is the profile flattering itself.
  if (c.isError || !c.data) {
    return (
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        We could not work out what is still missing just now. Your profile is unaffected.
      </p>
    );
  }
  const d = c.data;

  return (
    <div className="card" style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div className="eyebrow">How complete your profile is</div>
        <span style={{ fontWeight: 800, fontSize: 15, marginLeft: 'auto' }}>{d.overall}%</span>
      </div>

      {d.needsConfirming > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>
            {d.needsConfirming === 1
              ? 'One entry is still marked unchecked.'
              : `${d.needsConfirming} entries are still marked unchecked.`}
          </span>
          {onReview && (
            <button type="button" className="cvctl" onClick={onReview}>Check them</button>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {d.sections.map((s) => (
          <div key={s.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</span>
              <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{s.done} of {s.total}</span>
            </div>
            <div
              role="progressbar" aria-label={s.label}
              aria-valuenow={s.percent} aria-valuemin={0} aria-valuemax={100}
              style={{ height: 6, borderRadius: 999, background: 'var(--wash)', boxShadow: 'var(--edge-in)', marginTop: 6, overflow: 'hidden' }}
            >
              <div style={{ width: `${s.percent}%`, height: '100%', borderRadius: 999, background: 'var(--ink)' }} />
            </div>
            {s.missing.length > 0 && (
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                Still to add: {s.missing.join(', ')}.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

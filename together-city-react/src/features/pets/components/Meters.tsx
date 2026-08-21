/**
 * THE TWO METERS THIS HUB DRAWS: a ring and a bar.
 *
 * PLAYFUL, NOT CLINICAL — the brief's words and the right call. A pet owner
 * checking whether their dog got its walk does not want a medical chart. But
 * playful is not the same as vague, so both meters carry their real number in
 * text beside the drawing: the picture is the feeling, the figure is the fact.
 */

export function Ring(
  { value, max, label, caption, size = 108 }:
  { value: number; max: number; label: string; caption: string; size?: number },
) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={pct >= 1 ? 'var(--ok-ink)' : 'var(--accent)'}
            strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            style={{ transition: 'stroke-dasharray var(--dur-slow) var(--ease)' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: size * 0.24, fontWeight: 700, lineHeight: 1 }}>{value}</div>
            <div className="muted" style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</div>
          </div>
        </div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{caption}</p>
    </div>
  );
}

export function Bar(
  { value, tone, label, right }:
  { value: number; tone: 'ok' | 'warn' | 'danger'; label: string; right?: string },
) {
  const ink = tone === 'ok' ? 'var(--ok-ink)' : tone === 'warn' ? 'var(--warn-ink)' : 'var(--danger-ink)';
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{right ?? `${value}`}</span>
      </div>
      <div style={{ height: 8, borderRadius: 'var(--r-full)', background: 'var(--wash)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(3, Math.min(100, value))}%`, height: '100%', background: ink, borderRadius: 'var(--r-full)', transition: 'width var(--dur-slow) var(--ease)' }} />
      </div>
    </div>
  );
}

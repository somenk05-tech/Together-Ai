import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { changeText, count, dayLabel } from './format';
import type { Change, Metric } from './types';

/**
 * ── THE DASHBOARD'S PIECES (owner, 16 Sep) ─────────────────────────────────
 *
 * Every chart is plain SVG drawn from the data it is given — one series, the
 * city's ink, a hairline grid, a crosshair or a per-mark tooltip, and a table
 * behind a fold with every value in it, so nothing is read by hover alone.
 * No chart library: the page is one of the lightest in the city.
 */

/** "How is this counted?" — a focusable (i) with the definition. */
export function InfoTip({ text }: { text: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  // Keep the words on the screen: shift them sideways when the (i) is near an edge.
  const place = () => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const half = Math.min(280, window.innerWidth * 0.7) / 2;
    const mid = r.left + r.width / 2;
    const room = 12;
    const shift = Math.min(0, window.innerWidth - room - (mid + half)) + Math.max(0, room - (mid - half));
    el.style.setProperty('--tip-shift', `${Math.round(shift)}px`);
  };
  return (
    <span className="ix-tip" ref={ref} onPointerEnter={place} onFocus={place}>
      <button type="button" className="ix-tip-b" aria-describedby={id} aria-label="How this is counted">i</button>
      <span role="tooltip" id={id} className="ix-tip-t">{text}</span>
    </span>
  );
}

/** A change, in words and an arrow; nothing at all when there is nothing honest to say. */
export function Trend({ change, kind, vs, short }: { change: Change; kind: 'pct' | 'pts'; vs?: string; short?: boolean }) {
  const text = changeText(change, kind);
  const why = change.note ?? 'No comparison yet';
  if (!text) return short ? <span className="ix-trend flat" title={why}>Not enough data</span> : <span className="ix-trend flat">{why}</span>;
  const dir = (change.pct ?? 0) > 0 ? 'up' : (change.pct ?? 0) < 0 ? 'down' : 'flat';
  return (
    <span className={`ix-trend ${dir}`}>
      <span aria-hidden>{dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}</span> {text}
      {vs && <span className="ix-trend-vs"> {vs}</span>}
    </span>
  );
}

/** The sample watermark. */
export function NotRealBadge({ on }: { on?: boolean }) {
  return on ? <span className="ix-sample">Sample</span> : null;
}

/** One number, its name, its change and its definition. */
export function MetricCard({ label, metric, show, info, vs, sample, big }: {
  label: string; metric: Metric | undefined; show: (n: number | null) => string; info: string;
  vs?: string; sample?: boolean; big?: boolean;
}) {
  const m = metric;
  const missing = !m || m.value === null;
  return (
    <div className={`ix-card${big ? ' big' : ''}${missing ? ' missing' : ''}${sample ? ' not-real' : ''}`}>
      <div className="ix-card-top">
        <span className="ix-label">{label}</span>
        <InfoTip text={info} />
      </div>
      {sample && <span className="ix-vh">Sample value, not real.</span>}
      <div className="ix-num">{m ? (missing ? '—' : show(m.value)) : <span className="ix-skel">—</span>}</div>
      {m && (missing
        ? <span className="ix-trend flat">{m.note ?? 'Not enough data'}</span>
        : <Trend change={m.change} kind={m.changeKind} vs={m.change.pct !== null ? vs : undefined} />)}
    </div>
  );
}

/** A section of the page. */
export function Section({ id, title, sub, children, actions, sample }: {
  id: string; title: string; sub?: ReactNode; children: ReactNode; actions?: ReactNode; sample?: boolean;
}) {
  return (
    <section className="ix-sec" id={id} aria-labelledby={`${id}-h`}>
      <header className="ix-sec-head">
        <div>
          <h2 className="ix-h2" id={`${id}-h`}>{title} <NotRealBadge on={sample} /></h2>
          {sub && <p className="ix-sub">{sub}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Empty({ title = 'Not enough data yet', children }: { title?: string; children: ReactNode }) {
  return (
    <div className="ix-empty">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="ix-empty" role="alert">
      <strong>This section could not be read</strong>
      <p>The numbers are safe; the request failed. <button type="button" className="ix-link" onClick={onRetry}>Try again</button></p>
    </div>
  );
}

/** Loads a section only when it is near the screen. */
export function useNearScreen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setNear(true); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

/** The pixel width a chart is drawn at — so text and rounded ends are never stretched. */
export function useWidth<T extends Element>(fallback = 640): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const n = Math.round(el.getBoundingClientRect().width); if (n > 0) setW(n); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** A rounded track with a rounded fill, drawn at its real width. */
export function Meter({ share, height = 8, className = 'ix-bar-svg' }: { share: number | null; height?: number; className?: string }) {
  const [ref, w] = useWidth<HTMLSpanElement>(200);
  const r = height / 2;
  const fill = share === null || share <= 0 ? 0 : Math.max(height, Math.min(1, share) * w);
  return (
    <span ref={ref} className={className} aria-hidden>
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        <rect className="ix-track" x={0} y={0} width={w} height={height} rx={r} />
        {fill > 0 && <rect className="ix-fill" x={0} y={0} width={fill} height={height} rx={r} />}
      </svg>
    </span>
  );
}

/** Every value behind a fold, for readers who do not hover. */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="ix-table-fold">
      <summary>See the numbers<span className="fold-state" aria-hidden /></summary>
      <div className="ix-scroll">
        <table className="ix-table">
          <caption>{caption}</caption>
          <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

const H = 220;
const PAD = { l: 44, r: 16, t: 16, b: 28 };

function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.01; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/** One series over days, with a crosshair and the milestones that really happened. */
export function LineChart({ points, label, marks = [] }: {
  points: Array<{ day: string; value: number }>; label: string; marks?: Array<{ day: string; label: string }>;
}) {
  const [at, setAt] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLElement>();
  if (points.length < 2) return <Empty>A chart needs at least two days of history.</Empty>;
  const yt = ticks(Math.max(...points.map((p) => p.value)));
  const top = yt[yt.length - 1] || 1;
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${d}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((W - PAD.l - PAD.r) / 72))));
  const hovered = at === null ? null : points[at];
  const tipX = at === null ? 0 : Math.min(Math.max(x(at) - 60, PAD.l), W - PAD.r - 120);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1));
    setAt(Math.max(0, Math.min(points.length - 1, i)));
  };
  const markAt = marks.map((m) => ({ ...m, i: points.findIndex((p) => p.day === m.day) })).filter((m) => m.i >= 0);
  return (
    <figure className="ix-chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, ${dayLabel(points[0].day)} to ${dayLabel(points[points.length - 1].day)}: ${count(points[0].value)} to ${count(points[points.length - 1].value)}`}
        onPointerMove={onMove} onPointerLeave={() => setAt(null)} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setAt((v) => Math.min(points.length - 1, (v ?? -1) + 1));
          if (e.key === 'ArrowLeft') setAt((v) => Math.max(0, (v ?? points.length) - 1));
        }}
        onBlur={() => setAt(null)}>
        {yt.map((t) => (
          <g key={t}>
            <line className="ix-grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="ix-axis" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{count(t)}</text>
          </g>
        ))}
        {points.map((p, i) => ((i % every === 0 && x(points.length - 1) - x(i) >= 64) || i === points.length - 1) && (
          <text key={p.day} className="ix-axis" x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{dayLabel(p.day)}</text>
        ))}
        {markAt.map((m) => (
          <g key={m.day + m.label}>
            <line className="ix-mark-line" x1={x(m.i)} x2={x(m.i)} y1={PAD.t} y2={H - PAD.b} />
            <text className="ix-mark-text" x={x(m.i) + 4} y={PAD.t + 10}>{m.label}</text>
          </g>
        ))}
        <path className="ix-area" d={area} />
        <path className="ix-line" d={d} />
        <circle className="ix-dot" cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={4} />
        <text className="ix-end" x={x(points.length - 1) - 6} y={y(points[points.length - 1].value) - 10} textAnchor="end">
          {count(points[points.length - 1].value)}
        </text>
        {hovered && at !== null && (
          <g>
            <line className="ix-cross" x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} />
            <circle className="ix-dot" cx={x(at)} cy={y(hovered.value)} r={4} />
            <rect className="ix-tipbox" x={tipX} y={PAD.t} width={120} height={40} rx={6} />
            <text className="ix-tipval" x={tipX + 10} y={PAD.t + 18}>{count(hovered.value)}</text>
            <text className="ix-tiplab" x={tipX + 10} y={PAD.t + 32}>{dayLabel(hovered.day)}</text>
          </g>
        )}
      </svg>
      <DataTable caption={label} head={['Day', label]} rows={points.map((p) => [p.day, count(p.value)])} />
    </figure>
  );
}

/** Horizontal bars, one series, value at the tip. */
export function Bars({ rows, show, label, max }: {
  rows: Array<{ key: string; label: string; value: number | null; note?: string }>;
  show: (n: number | null) => string; label: string; max?: number;
}) {
  const [at, setAt] = useState<string | null>(null);
  const top = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="ix-bars" role="list" aria-label={label}>
      {rows.map((r) => (
        <div key={r.key} role="listitem" className={`ix-bar${at === r.key ? ' on' : ''}`}
          onPointerEnter={() => setAt(r.key)} onPointerLeave={() => setAt(null)}>
          <span className="ix-bar-l">{r.label}</span>
          <Meter share={r.value === null ? null : r.value / top} />
          <span className="ix-bar-v">{show(r.value)}{r.note && <span className="ix-bar-n"> {r.note}</span>}</span>
        </div>
      ))}
    </div>
  );
}

/** Columns over a small integer axis (the systems-per-member distribution). */
export function Columns({ rows, label, xLabel }: { rows: Array<{ x: string; value: number }>; label: string; xLabel: string }) {
  const [at, setAt] = useState<number | null>(null);
  const top = Math.max(1, ...rows.map((r) => r.value));
  const [box, w] = useWidth<HTMLElement>(360);
  const h = 160;
  const band = (w - 20) / Math.max(1, rows.length);
  const bw = Math.min(24, band * 0.6);
  return (
    <figure className="ix-chart" ref={box}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${rows.map((r) => `${r.x} ${xLabel}: ${r.value}`).join(', ')}`}>
        <line className="ix-grid" x1={10} x2={w - 10} y1={h - 24} y2={h - 24} />
        {rows.map((r, i) => {
          const bh = (r.value / top) * (h - 50);
          const cx = 10 + band * i + band / 2;
          return (
            <g key={r.x} onPointerEnter={() => setAt(i)} onPointerLeave={() => setAt(null)}>
              <rect className="ix-hit" x={cx - band / 2} y={0} width={band} height={h} />
              {r.value > 0 && <rect className={`ix-col${at === i ? ' on' : ''}`} x={cx - bw / 2} y={h - 24 - bh} width={bw} height={bh} rx={Math.min(4, bw / 2)} />}
              <text className="ix-axis" x={cx} y={h - 8} textAnchor="middle">{r.x}</text>
              {(at === i || r.value === top) && r.value > 0 && (
                <text className="ix-end" x={cx} y={h - 30 - bh} textAnchor="middle">{count(r.value)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <DataTable caption={label} head={[xLabel, 'Members']} rows={rows.map((r) => [r.x, r.value])} />
    </figure>
  );
}

/** Requests and failures, the last day, in five-minute columns. */
export function Timeline({ rows }: { rows: Array<{ at: string; requests: number; errors: number }> }) {
  const [box, w] = useWidth<HTMLDivElement>();
  if (!rows.length) return <Empty title="No traffic yet">This server has not answered a request since it started.</Empty>;
  const h = 64;
  const top = Math.max(1, ...rows.map((r) => r.requests));
  const bw = w / rows.length;
  return (
    <div className="ix-timeline" ref={box}>
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={`Requests over the last day: ${rows.reduce((n, r) => n + r.requests, 0)}, of which failed ${rows.reduce((n, r) => n + r.errors, 0)}`}>
      {rows.map((r, i) => (
        <g key={r.at}>
          <rect className="ix-col" x={i * bw} y={h - (r.requests / top) * h} width={Math.max(1, bw - 2)} height={(r.requests / top) * h} />
          {r.errors > 0 && <rect className="ix-err" x={i * bw} y={0} width={Math.max(1, bw - 2)} height={6} />}
        </g>
      ))}
    </svg>
    </div>
  );
}

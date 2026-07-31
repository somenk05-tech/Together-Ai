import type { TrendPoint } from '../api';

/**
 * One marker's values over time (FE-5.2).
 *
 * What was here before was a text row — "03-14 12.1 → 09-02 11.4 → 01-30 10.8".
 * Readable, and it hides the two things a chart is for: how far the values sit
 * from the healthy range, and how far apart in time they are.
 *
 * TIME IS THE X AXIS, not position in the list. Evenly spacing the points is
 * the easy version and it misstates the person's history: three panels at
 * 2023, 2024 and last week drawn evenly show a steady decline, when what
 * actually happened is a long flat stretch and then a sharp drop. The slope of
 * a line about somebody's blood should be the real slope.
 *
 * THE REFERENCE BAND IS DRAWN. Without it a rising line reads as bad news
 * regardless of what it means — but rising ferritin from 12 to 28 is recovery
 * and rising HbA1c from 5.4 to 6.4 is not. The band is what tells them apart,
 * so it is drawn first and the line sits on top of it.
 *
 * No axis labels, no gridlines, no tooltip. It sits beside the numbers, which
 * are already on the row; the drawing carries shape and position, and the row
 * carries the values.
 */

const W = 320;
const H = 56;
const PAD_X = 4;
const PAD_Y = 6;

const STATUS_COLOR: Record<string, string> = {
  low: '#e65100', high: '#c62828', normal: '#2e7d32',
};

export interface SparklineGeometry {
  width: number; height: number;
  /** SVG path for the value line. */
  line: string;
  dots: { x: number; y: number; status: string }[];
  /** y of the top and bottom of the healthy band, in view units. */
  bandTop: number; bandBottom: number;
}

/**
 * The arithmetic, pulled out so it can be tested without rendering anything.
 *
 * Returns null for fewer than two points, which is the caller's cue to draw
 * nothing rather than a flat line.
 */
export function sparklineGeometry(points: TrendPoint[], min: number, max: number): SparklineGeometry | null {
  // Two points make a line. One makes a dot, and a "trend" drawn through a
  // single measurement is a claim about a direction nobody measured.
  if (points.length < 2) return null;

  const times = points.map((p) => Date.parse(p.date));
  const values = points.map((p) => p.value);
  const t0 = times[0];
  const tSpan = times[times.length - 1] - t0;

  // The vertical window holds the reference band AND every value, so a result
  // far outside the range is still on the chart rather than clipped against the
  // edge — being off the scale is exactly the case worth seeing.
  const lo = Math.min(min, ...values);
  const hi = Math.max(max, ...values);
  const pad = (hi - lo) * 0.12 || 1;
  const yLo = lo - pad;
  const yHi = hi + pad;

  const x = (t: number) => PAD_X + (tSpan > 0 ? (t - t0) / tSpan : 0.5) * (W - PAD_X * 2);
  const y = (v: number) => PAD_Y + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD_Y * 2);

  return {
    width: W, height: H,
    line: points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
    dots: points.map((p, i) => ({ x: x(times[i]), y: y(p.value), status: p.status })),
    bandTop: y(max),
    bandBottom: y(min),
  };
}

export function TrendSparkline({ points, min, max, label, unit }: {
  points: TrendPoint[]; min: number; max: number; label: string; unit: string;
}) {
  const g = sparklineGeometry(points, min, max);
  if (!g) return null;
  const { line, dots, bandTop, bandBottom } = g;

  const first = points[0];
  const last = points[points.length - 1];
  const span = `${first.date} to ${last.date}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      // The chart is decoration to a screen reader unless it says what it shows.
      // "Healthy range" named it as this person's. It is one band for every
      // adult, and the only reader who cannot see the footnote is this one.
      aria-label={`${label} from ${first.value} to ${last.value} ${unit} between ${span}. General adult range ${min} to ${max}.`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <rect
        x={0} y={bandTop} width={W} height={Math.max(1, bandBottom - bandTop)}
        fill="#2e7d32" opacity={0.09} rx={3}
      />
      <line x1={0} y1={bandTop} x2={W} y2={bandTop} stroke="#2e7d32" strokeOpacity={0.25} strokeWidth={1} />
      <line x1={0} y1={bandBottom} x2={W} y2={bandBottom} stroke="#2e7d32" strokeOpacity={0.25} strokeWidth={1} />

      <path d={line} fill="none" stroke="var(--ink-soft, #5a5a55)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />

      {dots.map((d, i) => {
        const latest = i === dots.length - 1;
        return (
          <circle
            key={`${points[i].date}-${i}`}
            cx={d.x} cy={d.y} r={latest ? 4 : 2.6}
            fill={STATUS_COLOR[d.status] ?? '#5a5a55'}
            stroke="var(--paper, #fff)" strokeWidth={latest ? 1.6 : 1}
          />
        );
      })}
    </svg>
  );
}

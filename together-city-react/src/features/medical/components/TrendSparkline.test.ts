import { describe, expect, it } from 'vitest';
import { sparklineGeometry } from './TrendSparkline';
import type { TrendPoint } from '../api';

const pt = (date: string, value: number, status: TrendPoint['status'] = 'normal'): TrendPoint =>
  ({ date, value, status });

describe('a marker chart is drawn against time, not against the list', () => {
  it('spaces points by when they were taken', () => {
    // Two years, then six weeks. Drawn evenly, this reads as a steady decline;
    // what happened is a long flat stretch and then a drop.
    const g = sparklineGeometry(
      [pt('2024-01-01', 14), pt('2026-01-01', 13.8), pt('2026-02-12', 10.2)],
      12, 17.5,
    );
    expect(g).not.toBeNull();
    if (!g) return;
    const [a, b, c] = g.dots.map((d) => d.x);
    const firstGap = b - a;
    const secondGap = c - b;
    expect(firstGap).toBeGreaterThan(secondGap * 10);
  });

  it('puts the first point at the left edge and the last at the right', () => {
    const g = sparklineGeometry([pt('2026-01-01', 5), pt('2026-06-01', 6)], 4, 7);
    if (!g) return;
    expect(g.dots[0].x).toBeLessThan(g.width * 0.05);
    expect(g.dots[1].x).toBeGreaterThan(g.width * 0.95);
  });

  it('does not divide by zero when every panel is the same day', () => {
    // Two labs, one morning. The dates tie, so the time span is zero.
    const g = sparklineGeometry([pt('2026-03-04', 5), pt('2026-03-04', 6)], 4, 7);
    if (!g) return;
    for (const d of g.dots) {
      expect(Number.isFinite(d.x)).toBe(true);
      expect(Number.isFinite(d.y)).toBe(true);
    }
  });
});

describe('the healthy band', () => {
  it('sits where the reference range is, with the top above the bottom', () => {
    // SVG y grows downward, so the higher value has the smaller y.
    const g = sparklineGeometry([pt('2026-01-01', 30), pt('2026-06-01', 45)], 20, 100);
    if (!g) return;
    expect(g.bandTop).toBeLessThan(g.bandBottom);
  });

  it('keeps a value far outside the range on the chart', () => {
    // Ferritin of 4 against a 30–300 range. Clipping it to the edge would hide
    // the one result most worth seeing.
    const g = sparklineGeometry([pt('2026-01-01', 4), pt('2026-06-01', 26)], 30, 300);
    if (!g) return;
    for (const d of g.dots) {
      expect(d.y).toBeGreaterThan(0);
      expect(d.y).toBeLessThan(g.height);
    }
    // And it is below the band, which is what "low" should look like.
    expect(g.dots[0].y).toBeGreaterThan(g.bandBottom);
  });

  it('handles a marker whose whole range is a single value', () => {
    const g = sparklineGeometry([pt('2026-01-01', 2), pt('2026-06-01', 2)], 2, 2);
    if (!g) return;
    for (const d of g.dots) expect(Number.isFinite(d.y)).toBe(true);
  });
});

describe('refusing to draw a trend that does not exist', () => {
  it('returns nothing for a single panel', () => {
    expect(sparklineGeometry([pt('2026-01-01', 5)], 4, 7)).toBeNull();
  });

  it('returns nothing for no panels', () => {
    expect(sparklineGeometry([], 4, 7)).toBeNull();
  });
});

describe('the line', () => {
  it('starts with a move and continues with lines', () => {
    const g = sparklineGeometry([pt('2026-01-01', 5), pt('2026-03-01', 6), pt('2026-06-01', 4)], 4, 7);
    if (!g) return;
    expect(g.line.startsWith('M')).toBe(true);
    expect(g.line.match(/L/g)).toHaveLength(2);
  });

  it('carries each point status through to its dot', () => {
    const g = sparklineGeometry([pt('2026-01-01', 3, 'low'), pt('2026-06-01', 9, 'high')], 4, 7);
    if (!g) return;
    expect(g.dots.map((d) => d.status)).toEqual(['low', 'high']);
  });
});

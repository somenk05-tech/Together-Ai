import { classifyTrend } from './medical.service';

// Pull the same reference ranges the app uses so the test mirrors production.
const RANGES = {
  hba1c: { min: 4, max: 5.6 },
  ldl: { min: 0, max: 130 },
  trig: { min: 0, max: 150 },
  vitd: { min: 20, max: 100 },
};
const st = (rule: { min: number; max: number }, v: number) => (v < rule.min ? 'low' : v > rule.max ? 'high' : 'normal');
const pts = (rule: { min: number; max: number }, vals: number[]) => vals.map((v) => ({ value: v, status: st(rule, v) }));

describe('longitudinal biomarker trend classification', () => {
  it('reads a falling "high is bad" marker as improving (HbA1c 7.3 → 6.4)', () => {
    expect(classifyTrend(RANGES.hba1c, pts(RANGES.hba1c, [7.3, 6.9, 6.4])).trend).toBe('improving');
  });

  it('reads LDL 168 → 132 as improving (still high, but closer to range)', () => {
    expect(classifyTrend(RANGES.ldl, pts(RANGES.ldl, [168, 150, 132])).trend).toBe('improving');
  });

  it('reads rising triglycerides 260 → 427 as worsening', () => {
    expect(classifyTrend(RANGES.trig, pts(RANGES.trig, [260, 315, 427])).trend).toBe('worsening');
  });

  it('flags a marker that crossed back into range as returned-normal', () => {
    // Vitamin D 15 (low) → 31 (normal).
    expect(classifyTrend(RANGES.vitd, pts(RANGES.vitd, [15, 26, 31])).trend).toBe('returned-normal');
  });

  it('flags a marker that newly left the range as newly-abnormal', () => {
    // LDL 110 (normal) → 145 (high).
    expect(classifyTrend(RANGES.ldl, pts(RANGES.ldl, [110, 145])).trend).toBe('newly-abnormal');
  });

  it('reads an in-range, barely-moving marker as stable', () => {
    expect(classifyTrend(RANGES.hba1c, pts(RANGES.hba1c, [5.2, 5.3, 5.2])).trend).toBe('stable');
  });

  it('reports a negative severityChange when a marker improves', () => {
    expect(classifyTrend(RANGES.ldl, pts(RANGES.ldl, [168, 132])).severityChange).toBeLessThan(0);
  });
});

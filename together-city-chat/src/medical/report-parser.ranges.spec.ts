
import { parseReportText, printedRange, standaloneNumbers } from './report-parser';

describe('printedRange — the mirror of what standaloneNumbers refuses', () => {
  it('reads the three shapes a lab prints', () => {
    expect(printedRange('Haemoglobin 14.2 g/dL 13.0 - 17.0')).toEqual({ low: 13, high: 17 });
    expect(printedRange('Hb 14.2 13–17')).toEqual({ low: 13, high: 17 });
    expect(printedRange('Hb 14.2 13 to 17')).toEqual({ low: 13, high: 17 });
  });

  it('reads a one-sided bound as one-sided, not as a guess at the other end', () => {
    expect(printedRange('CRP 2.1 mg/L < 5.0')).toEqual({ low: null, high: 5 });
    expect(printedRange('HDL 52 > 40')).toEqual({ low: 40, high: null });
  });

  it('refuses a backwards or malformed interval', () => {
    expect(printedRange('Ferritin 80 300 - 30')).toBeNull();
    expect(printedRange('Vitamin D 28')).toBeNull();
    expect(printedRange('')).toBeNull();
  });

  it('is the same text standaloneNumbers deliberately skips', () => {
    // The two functions have to agree about what a range is, or one of them
    // will read a bound as a result.
    expect(standaloneNumbers('13.0 - 17.0')).toEqual([]);
    expect(printedRange('13.0 - 17.0')).toEqual({ low: 13, high: 17 });
  });
});

describe('parseReportText keeps the lab’s own interval', () => {
  it('takes the value and the range from the same row', () => {
    const r = parseReportText('Haemoglobin      14.2 g/dL      13.0 - 17.0');
    expect(r.values.hb).toBe(14.2);
    expect(r.ranges?.hb).toEqual({ low: 13, high: 17 });
  });

  it('converts the range with the same factor as the value', () => {
    // CRP printed in mg/dL converts ×10 to mg/L. A range left in mg/dL beside a
    // value in mg/L would call a normal result ten times high.
    const r = parseReportText('C-Reactive Protein   0.21 mg/dL   0.0 - 0.5');
    expect(r.values.crp).toBe(2.1);
    expect(r.ranges?.crp).toEqual({ low: 0, high: 5 });
  });

  it('keeps no range at all when the conversion was a per-number guess', () => {
    // LDL under 15 is assumed mmol/L and multiplied by 38.67. That decision is
    // made per number, so the bounds would convert differently from the value.
    const r = parseReportText('LDL Cholesterol   3.1   1.0 - 3.4');
    expect(r.values.ldl).toBeGreaterThan(100);
    expect(r.ranges?.ldl).toBeUndefined();
  });

  it('drops a range the value is nowhere near — that is the wrong column', () => {
    // "25-OH" is what the vitd matcher needs; plain "Vitamin D" has never
    // parsed and this change does not alter that.
    const r = parseReportText('25-OH Vitamin D   28 ng/mL   2000 - 3000');
    expect(r.values.vitd).toBe(28);
    expect(r.ranges?.vitd).toBeUndefined();
  });

  it('reports no ranges rather than an empty object when none were found', () => {
    const r = parseReportText('Haemoglobin 14.2 g/dL');
    expect(r.values.hb).toBe(14.2);
    expect(r.ranges).toBeUndefined();
  });

  it('still reads a report that has no ranges at all, unchanged', () => {
    const r = parseReportText(['Haemoglobin 14.2 g/dL', 'Ferritin 80 ng/mL', 'HbA1c 5.4 %'].join('\n'));
    expect(r.values.hb).toBe(14.2);
    expect(r.values.ferritin).toBe(80);
    expect(r.values.hba1c).toBe(5.4);
  });
});

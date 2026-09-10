import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONFIRM, KIND_LABEL, RECORD_KINDS, SURE_ENOUGH, UNSORTED, cleanHistory, cleanReading, compareNames, heldFor, historyPrompt,
  isHeld, kindLabel, nameOnReport, readingDetail, wasRead, withoutName,
} from './record-reader';

/**
 * THE VAULT FILES ITSELF (owner, 10 Sep): "don't ask the user what report
 * they are uploading unless you are confused — if confused, ask the user to
 * tag it." These hold the line between the two: when a reading may file on its
 * own, and when it must wait for the citizen.
 */
const TODAY = '2026-09-10';
const sure = { isMedical: true, kind: 'prescription', confidence: 0.9, title: 'Prescription — Dr. Rao', date: '2026-08-02', source: 'Apollo', summary: 'Two medicines for blood pressure.', findings: [{ name: 'Telmisartan', value: '40 mg once daily', flag: null }] };

describe('when a reading files itself', () => {
  it('files a sure reading in the folder the model named', () => {
    const r = cleanReading(sure, TODAY);
    expect(r.sure).toBe(true);
    expect(r.kind).toBe('prescription');
    expect(r.date).toBe('2026-08-02');
  });

  it('asks when the model says it is unsure', () => {
    expect(cleanReading({ ...sure, kind: 'unsure' }, TODAY).kind).toBe(UNSORTED);
  });

  it('asks when the model is below the line, however plausible the folder', () => {
    expect(cleanReading({ ...sure, confidence: SURE_ENOUGH - 0.01 }, TODAY).kind).toBe(UNSORTED);
    expect(cleanReading({ ...sure, confidence: SURE_ENOUGH }, TODAY).kind).toBe('prescription');
  });

  it('asks when the folder is one the city does not have', () => {
    expect(cleanReading({ ...sure, kind: 'x-ray' }, TODAY).kind).toBe(UNSORTED);
  });

  it('asks when the file is not a medical document at all', () => {
    const r = cleanReading({ ...sure, isMedical: false }, TODAY);
    expect(r.kind).toBe(UNSORTED);
    expect(r.isMedical).toBe(false);
  });

  it('asks when there was no answer — no model, a failed call', () => {
    expect(cleanReading(null, TODAY)).toMatchObject({ kind: UNSORTED, sure: false, findings: [] });
  });

  it('never keeps a date that has not happened yet, or is not a date', () => {
    expect(cleanReading({ ...sure, date: '2062-01-01' }, TODAY).date).toBeNull();
    expect(cleanReading({ ...sure, date: '12/07/2026' }, TODAY).date).toBeNull();
  });
});

describe('what the citizen reads under the file', () => {
  it('is the summary, then one line per finding, flags only when not normal', () => {
    const d = readingDetail(cleanReading({
      ...sure, kind: 'blood-test', source: null, summary: 'Lipid profile.', patientName: 'Somen Kumar',
      findings: [{ name: 'Triglycerides', value: '395.6 mg/dL', flag: 'high' }, { name: 'HDL', value: '44 mg/dL', flag: 'normal' }],
    }, TODAY));
    expect(d).toBe('Name on the report: Somen Kumar\nLipid profile.\n• Triglycerides — 395.6 mg/dL (high)\n• HDL — 44 mg/dL');
  });
});

describe('the whole history', () => {
  it('keeps nothing that is not an answer', () => {
    expect(cleanHistory(null)).toBeNull();
    expect(cleanHistory({ areas: [] })).toBeNull();
    expect(cleanHistory('text')).toBeNull();
  });

  it('keeps an answer, and clamps a status it does not know to unclear', () => {
    const h = cleanHistory({ overview: 'Two panels a year apart.', areas: [{ area: 'Blood sugar', status: 'terrible', summary: 'HbA1c 8.7%.', evidence: ['Blood panel · 2026-07-19'] }] });
    expect(h?.areas[0].status).toBe('unclear');
  });

  it('writes a different prompt — so a new fingerprint — when a document changes', () => {
    const a = historyPrompt([{ kind: 'prescription', title: 'Rx', date: '2026-08-02', detail: null }], [], kindLabel);
    const b = historyPrompt([{ kind: 'note', title: 'Rx', date: '2026-08-02', detail: null }], [], kindLabel);
    expect(a).not.toBe(b);
  });
});

describe('one list of folders', () => {
  it('names every folder, and the one that waits for a tag', () => {
    for (const k of [...RECORD_KINDS, UNSORTED]) expect((KIND_LABEL as Record<string, string>)[k]).toBeTruthy();
  });

  it('is the list the web page offers, key for key', () => {
    const page = readFileSync(join(__dirname, '../../../together-city-react/src/features/medical/pages/Records.tsx'), 'utf8');
    const keys = [...page.matchAll(/\{ key: '([a-z-]+)', label:/g)].map((m) => m[1]);
    expect(keys).toEqual([...RECORD_KINDS]);
  });

  it('asks the model for nothing but those folders, or unsure', () => {
    const src = readFileSync(join(__dirname, 'record-reader.ts'), 'utf8');
    expect(src).toMatch(/kind is exactly one of: \$\{RECORD_KINDS\.join\(', '\)\} — or "unsure"/);
  });
});

/**
 * WHOSE REPORT IT IS (owner, 10 Sep): "If there is a mismatch in the name
 * spelling in the test, double confirm with the user if it's their own blood
 * test; if there is a complete change in name, reject the blood test
 * mentioning name mismatch."
 */
describe('the name on the report', () => {
  const me = 'Somen Kumar';
  it('matches the same name, in any order, with a title or a middle name', () => {
    expect(compareNames('Mr. SOMEN KUMAR', me)).toBe('match');
    expect(compareNames('Kumar Somen', me)).toBe('match');
    expect(compareNames('Somen Kumar Singh', me)).toBe('match');
    expect(compareNames('Somen', me)).toBe('match');
  });

  it('asks when the spelling differs, or the first name is only an initial', () => {
    expect(compareNames('Soman Kumar', me)).toBe('close');
    expect(compareNames('S. Kumar', me)).toBe('close');
    expect(compareNames('Kumar', me)).toBe('close');
  });

  it('rejects a completely different name — even one sharing a surname', () => {
    expect(compareNames('Priya Sharma', me)).toBe('different');
    expect(compareNames('Rajesh Kumar', me)).toBe('different');
  });

  it('reads past a guardian printed after S/O', () => {
    expect(compareNames('Somen Kumar S/O Ramesh Kumar', me)).toBe('match');
  });

  it('checks nothing when no name is printed or the account has none', () => {
    expect(compareNames(null, me)).toBe('unknown');
    expect(compareNames('Somen Kumar', '')).toBe('unknown');
  });

  it('keeps the printed name as the first line — shown on the row, never sent to the history read', () => {
    const d = readingDetail(cleanReading({ ...sure, patientName: 'Somen Kumar' }, TODAY));
    expect(wasRead(d)).toBe(true);
    expect(nameOnReport(d)).toBe('Somen Kumar');
    expect(withoutName(d)).not.toMatch(/Somen/);
    const none = readingDetail(cleanReading({ ...sure, patientName: null }, TODAY));
    expect(wasRead(none)).toBe(true);
    expect(nameOnReport(none)).toBeNull();
    expect(wasRead('Uploaded blood report')).toBe(false);
  });

  it('holds a document for the folder it will go to', () => {
    expect(isHeld(`${CONFIRM}blood-test`)).toBe(true);
    expect(heldFor(`${CONFIRM}blood-test`)).toBe('blood-test');
    expect(isHeld('blood-test')).toBe(false);
  });
});

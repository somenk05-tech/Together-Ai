import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE VAULT FILES ITSELF ─────────────────────────────────────────────────
 *
 * Owner, 10 Sep: "Health records 03 should be 01 and record analysis should be
 * 02, give Claude the ability to analyse all the medical tests uploaded here,
 * make the medical upload folder as simple as the drive and in the backend sort
 * the medical data automatically … remove the health timeline … don't ask the
 * user what report they are uploading unless you are confused — if confused,
 * ask the user to tag which report that is."
 */
describe('the Medical rail', () => {
  const rail = HUBS.medical.items;

  it('opens on the vault, then its analysis', () => {
    expect(rail.slice(0, 2).map((i) => [i.index, i.path, i.label])).toEqual([
      ['01', '/medical/records', 'Health Records'],
      ['02', '/medical/blood', 'Record Analysis'],
    ]);
  });

  it('has no timeline, and counts without a gap', () => {
    expect(rail.some((i) => i.path === '/medical/timeline')).toBe(false);
    expect(rail.map((i) => i.index)).toEqual(rail.map((_, n) => String(n + 1).padStart(2, '0')));
  });

  it('keeps an old timeline link working — it lands on the vault', () => {
    expect(code('app/router.tsx')).toMatch(/path: '\/medical\/timeline', element: <Navigate to="\/medical\/records" replace \/>/);
    expect(existsSync(join(SRC, 'features/medical/pages/Timeline.tsx'))).toBe(false);
  });
});

describe('Health Records is as simple as the Drive', () => {
  const page = code('features/medical/pages/Records.tsx');

  it('has one upload button, for many files', () => {
    expect(page).toMatch(/↑ Upload files/);
    expect(page).toMatch(/type="file" multiple/);
  });

  it('never asks what a file is before it is read', () => {
    // The category chips and the title/details form are gone; the server
    // names the folder (POST /medical/uploads).
    expect(page).not.toMatch(/Add to your record/);
    expect(page).not.toMatch(/placeholder="Title/);
    expect(read('features/medical/api.ts')).toMatch(/'\/medical\/uploads'/);
  });

  it('asks only for the files the reader could not place', () => {
    expect(page).toMatch(/const UNSORTED = 'unsorted'/);
    expect(page).toMatch(/Tell us what these are/);
  });

  it('opens folders the way the Drive does — a row each, a breadcrumb back', () => {
    expect(page).toMatch(/openFolder\(f\.key\)/);
    expect(page).toMatch(/useSearchParams/);
    expect(page).toMatch(/Health Records\s*<\/button>/);
  });

  it('gives every file one tag and no "Move to…" (owner, 10 Sep: "just keep the tag")', () => {
    expect(page).not.toMatch(/Move to/);
    expect(page).toMatch(/\{tagFor\(r\.kind\)\}/);
    expect(page).toMatch(/tag: 'Scan \/ X-ray'/);
  });

  it('shows no timeline', () => {
    expect(page).not.toMatch(/timeline/i);
  });
});

describe('Record Analysis reads the whole history', () => {
  it('opens with the whole-history read, fetched from the server', () => {
    expect(code('features/medical/pages/BloodAnalysis.tsx')).toMatch(/<WholeHistory \/>/);
    expect(read('features/medical/api.ts')).toMatch(/'\/medical\/history'/);
  });
});

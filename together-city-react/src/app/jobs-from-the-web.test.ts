import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * JOBS FROM THE WEB, SAID HONESTLY.
 *
 * "Jobs for you" now ranks postings read from companies' own public ATS
 * boards alongside Together City's. Three things must stay true on the card:
 * the citizen applies on the company's site, never through an in-city form
 * that no recruiter reads; the card says which board the role came from; and
 * a salary the board never stated is not printed as "₹0 LPA".
 */
describe('external roles apply on the company’s own site', () => {
  const page = stripTs(read('src/features/jobs/pages/Matches.tsx'));

  it('an external role gets one door, and it opens on the company site', () => {
    // The external branch is decided BEFORE applied/open — an external role
    // must never reach the in-city apply form.
    const branch = page.indexOf('job.externalUrl ? (');
    const applied = page.indexOf(') : applied ?');
    expect(branch).toBeGreaterThan(-1);
    expect(applied).toBeGreaterThan(branch);
    // A real link, in a new tab, with the opener severed.
    expect(page).toMatch(/href=\{job\.externalUrl\} target="_blank" rel="noopener noreferrer"/);
  });

  it('the card names the board the role was read from', () => {
    expect(page).toMatch(/SOURCE_LABEL: Record<string, string> = \{ greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby' \}/);
    expect(page).toMatch(/via \{SOURCE_LABEL\[job\.source \?\? ''\] \?\? 'company site'\}/);
  });

  it('a salary the board never stated is not printed as ₹0', () => {
    expect(page).toMatch(/\{job\.salaryLpa \? ` · ₹\$\{job\.salaryLpa\} LPA` : ''\}/);
    // and the share card drops the empty rather than sending "₹0 LPA" into a chat
    expect(page).toMatch(/\.filter\(Boolean\),\s*\n\s*deepLink: '\/jobs\/matches'/);
  });

  it('the api type carries the two external fields the card reads', () => {
    const api = stripTs(read('src/features/jobs/api.ts'));
    expect(api).toMatch(/externalUrl\?: string \| null; source\?: string \| null;/);
  });
});

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * THE DAILY LETTER IS RETIRED — owner decision, 5 Sep 2026.
 *
 * One model call per citizen per day, cached and free, was the largest single
 * line in what a free member cost to serve — more than half of it. The owner
 * dropped it. This spec is the shape of "dropped":
 *
 *   1. No route writes a letter. `GET /astrology/daily` still exists as the
 *      anchor for Mira's "how is my day" capability, and it answers
 *      `{ retired: true }` without calling the service.
 *   2. Mira's day brief never asks astrology for a reading.
 *   3. The web has no page, rail entry, action or API call for it, and the old
 *      address redirects to the month.
 *
 * `AstrologyService.daily()` is left standing beside the specs that prove it
 * writes a letter correctly — that is not a door, it is a function nobody
 * calls. The day somebody wires it back up, this fails, and the number on the
 * cost page moves with it.
 */
const api = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const WEB = join(__dirname, '..', '..', '..', 'together-city-react', 'src');
const web = (rel: string) => readFileSync(join(WEB, rel), 'utf8');

describe('the daily letter is retired', () => {
  it('the controller never asks the service for a daily letter', () => {
    const src = api('astrology/astrology.controller.ts');
    expect(src).not.toMatch(/this\.astrology\.daily\(/);
    expect(src).not.toMatch(/dailyHistory\(/);
    expect(src).toMatch(/@Get\('daily'\)[\s\S]{0,400}retired: true/);
  });

  it('the day brief reads doses, kitchen, inbox and bell — not a reading', () => {
    const src = api('mira/mira.service.ts');
    expect(src).not.toMatch(/this\.astrology\.daily\(/);
    expect(src).not.toMatch(/still being written/);
  });

  it('the web has no page for it and the old address goes to the month', () => {
    expect(existsSync(join(WEB, 'features', 'astrology', 'pages', 'AstroToday.tsx'))).toBe(false);
    expect(web('features/astrology/api.ts')).not.toMatch(/\/astrology\/daily/);
    expect(web('config/hubs.ts')).not.toMatch(/\/astrology\/today/);
    expect(web('nav/registry.ts')).not.toMatch(/\/astrology\/today/);
    expect(web('config/labels.ts')).toMatch(/'\/astrology\/today': '\/astrology\/monthly'/);
  });
});

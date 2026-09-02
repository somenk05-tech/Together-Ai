import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ONE LINE FIRST, THE WHOLE LIST SECOND.
 *
 * Local Services opened on its own directory — chips, city, area, map — which
 * is the right screen for browsing and the wrong one for arriving. 01 is now
 * `/services/find`: the city's room, its name, one field. The directory did
 * not move; it was renamed to what it is, "All listed services", and took 02.
 *
 * THE THREE THINGS THAT WOULD QUIETLY UNDO THIS, which is what this file is
 * for. The numbers drifting out of sequence or out of order after somebody
 * inserts a room. `/services/find` losing its route and becoming a menu entry
 * onto a 404. And the words typed into 01 being dropped on the way to 02 —
 * the failure nobody sees in review, because both screens work alone.
 */
describe('one line, then the list', () => {
  const hubs = strip(read('src/config/hubs.ts'));
  const services = hubs.slice(hubs.indexOf('services: {'), hubs.indexOf('travel: {'));
  const rows = [...services.matchAll(/\{ path: '(\/services\/[a-z]+)', index: '(\d\d)', label: '([^']+)'/g)]
    .map((m) => ({ path: m[1], index: m[2], label: m[3] }));

  it('opens on one field, and the directory is the second door', () => {
    expect(rows[0]).toMatchObject({ path: '/services/find', index: '01', label: 'Find a service' });
    expect(rows[1]).toMatchObject({ path: '/services/browse', index: '02', label: 'All listed services' });
  });

  it('numbers the rooms 01..n with no gap and no repeat', () => {
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.map((r) => r.index)).toEqual(rows.map((_, i) => String(i + 1).padStart(2, '0')));
  });

  it('every numbered room is a route that answers', () => {
    /* Read raw. `strip()` is written for prose and swallows whole route
       blocks here — a guard that lies about what is declared is worse than
       no guard, and a route path quoted in a comment is not a failure mode
       this file is protecting against. */
    const router = read('src/app/router.tsx');
    for (const r of rows) expect(router).toContain(`path: '${r.path}'`);
  });

  it('carries the sentence from 01 into 02 rather than asking twice', () => {
    const find = strip(read('src/features/services/pages/FindService.tsx'));
    expect(find).toMatch(/\/services\/browse\?q=\$\{encodeURIComponent/);
    const browse = strip(read('src/features/services/pages/Browse.tsx'));
    expect(browse).toContain('useSearchParams');
    expect(browse).toMatch(/useState\(\(\) => params\.get\('q'\)/);
  });

  it('is a search bar and nothing else', () => {
    /* The screen shipped with a photographed room, the wordmark and a rail of
       suggested trades; all three went (owner, 2 Sep) because they competed
       with the one thing 01 is for. This is the guard against them creeping
       back one well-meaning commit at a time. */
    const find = strip(read('src/features/services/pages/FindService.tsx'));
    expect(find).not.toMatch(/backgroundImage|\.webp|tc-word\.svg/);
    expect(find).toMatch(/role="search"/);
    expect(find).toContain('placeholder="What are you looking for… today"');
  });
});

import { areaOf, areasOf, commitDetails, deployLabel, isLiveEnvironment, pickedFrom } from './release-areas';
import { stageOf, type ReleaseStatus } from './release.service';

/**
 * "Give options of what things will go live … and if the changes have been
 * deployed" (owner, 16 Sep). The words the Go live list shows, and the one
 * word for where the last release is.
 */
describe('what a change touches, in words', () => {
  it('names hubs by the names the city uses', () => {
    expect(areaOf('together-city-react/src/features/social/Feed.tsx')).toBe('Together TV');
    expect(areaOf('together-city-react/src/features/services/api.ts')).toBe('Local Market');
    expect(areaOf('together-city-react/src/pages/Personalize.tsx')).toBe('Personalize');
    expect(areaOf('together-city-react/src/pages/Investor.tsx')).toBe('Page: Investor');
    expect(areaOf('together-city-chat/src/beauty/beauty.service.ts')).toBe('Beauty (server)');
  });

  it('says plainly when a change reaches everything, or the database', () => {
    expect(areaOf('together-city-react/src/layouts/RootChrome.tsx')).toBe('Whole site: look and shared parts');
    expect(areaOf('together-city-chat/prisma/schema.prisma')).toBe('Database change');
    expect(areaOf('land-two-cities.sh')).toBe('Tools and notes (not on the site)');
  });

  it('lists each area once, the database first, and counts the rest', () => {
    const got = areasOf([
      'together-city-react/src/features/beauty/a.tsx',
      'together-city-react/src/features/beauty/b.tsx',
      'together-city-chat/prisma/migrations/x/migration.sql',
    ]);
    expect(got).toEqual(['Database change', 'Beauty']);
    const many = ['a', 'b', 'c', 'd'].map((x) => `together-city-chat/src/m${x}/f.ts`);
    expect(areasOf(many, 2)).toEqual(['Server: ma', 'Server: mb', 'and 2 more']);
  });

  it('keeps the explanation, drops the trailers', () => {
    const msg = 'title\n\nWhy it matters.\n\nCo-Authored-By: X <x@y>\nClaude-Session: https://z';
    expect(commitDetails(msg)).toBe('Why it matters.');
    expect(commitDetails(`t\n\n${'a'.repeat(50)}`, 10)).toHaveLength(10);
  });

  it('knows a change that was already sent on its own', () => {
    const sha = 'a'.repeat(40);
    expect(pickedFrom(`x\n\n(cherry picked from commit ${sha})`)).toEqual([sha]);
    expect(pickedFrom('nothing here')).toEqual([]);
  });

  it('reads Vercel and Railway environments, and ignores previews', () => {
    expect(deployLabel('Production')).toBe('Website (Vercel)');
    expect(deployLabel('abundant-creation / production')).toBe('Server (Railway: abundant-creation)');
    expect(isLiveEnvironment('Preview')).toBe(false);
    expect(isLiveEnvironment('abundant-creation / development')).toBe(false);
    expect(isLiveEnvironment('Production')).toBe(true);
  });
});

describe('where the last release is', () => {
  const now = Date.parse('2026-09-16T12:00:00Z');
  const run = (status: string, conclusion: string | null, createdAt: string) =>
    ({ id: 1, title: 'Go live', status, conclusion, createdAt, url: 'u' });
  const main = (at: string) => ({ sha: 's', title: 't', at, url: 'u' });
  const dep = (state: string) => ({ name: 'n', state, at: null, url: null });
  const s = (x: Partial<ReleaseStatus>) => stageOf({ run: null, main: null, deploys: [], ...x }, now);

  it('is building while the run runs', () => {
    expect(s({ run: run('in_progress', null, '2026-09-16T11:59:00Z'), main: main('2026-09-16T10:00:00Z') })).toBe('building');
  });

  it('is failed only when the failed run is newer than main — nothing changed', () => {
    expect(s({ run: run('completed', 'failure', '2026-09-16T11:50:00Z'), main: main('2026-09-16T10:00:00Z') })).toBe('failed');
    expect(s({ run: run('completed', 'failure', '2026-09-16T09:00:00Z'), main: main('2026-09-16T10:00:00Z'), deploys: [dep('success')] })).toBe('deployed');
  });

  it('is deployed only when every live deployment of main succeeded', () => {
    const r = run('completed', 'success', '2026-09-16T11:50:00Z');
    const m = main('2026-09-16T11:55:00Z');
    expect(s({ run: r, main: m, deploys: [dep('success'), dep('in_progress')] })).toBe('deploying');
    expect(s({ run: r, main: m, deploys: [] })).toBe('deploying');
    expect(s({ run: r, main: m, deploys: [dep('success'), dep('success')] })).toBe('deployed');
    expect(s({ run: r, main: m, deploys: [dep('success'), dep('failure')] })).toBe('deploy-failed');
  });

  it('says nothing about an old main nobody reported on', () => {
    expect(s({ main: main('2026-09-15T10:00:00Z') })).toBe('none');
  });
});

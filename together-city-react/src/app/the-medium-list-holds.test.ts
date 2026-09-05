import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onStaleMedia, resetRemint, REMINT_WINDOW_MS } from '@/lib/remint';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (p: string) => readFileSync(join(web, p), 'utf8');

/**
 * THE MEDIUM LIST HOLDS (launch gate, third reading — web MEDIUMs, 5 Sep).
 * Six small defects, each pinned so it cannot come back quietly.
 */
describe('sign-in brings the whole address back', () => {
  it('AuthGate keeps the query string and the hash', () => {
    expect(code('features/auth/AuthGate.tsx')).toMatch(/from: `\$\{location\.pathname\}\$\{location\.search\}\$\{location\.hash\}`/);
  });
});

describe('/dashboard is behind the door', () => {
  it('is wrapped like its siblings', () => {
    expect(code('app/router.tsx')).toMatch(/path: '\/dashboard', element: <RequireAuth>\{wrap\(<Dashboard \/>\)\}<\/RequireAuth>/);
  });
});

describe('a route change starts at the top and says so', () => {
  const chrome = code('layouts/RootChrome.tsx');
  it('scrolls to the top on a new pathname, moves focus to main, and leaves anchors alone', () => {
    expect(chrome).toMatch(/window\.scrollTo\(\{ top: 0, left: 0 \}\)/);
    expect(chrome).toMatch(/main\.focus\(\{ preventScroll: true \}\)/);
    expect(chrome).toMatch(/if \(window\.location\.hash\) return;/);
    expect(chrome).toMatch(/if \(lastPath\.current === pathname\) return;/);
  });
});

describe('a tablist with nothing selected is still reachable', () => {
  const tabs = code('features/social/Tablist.tsx');
  it('the first tab is the roving-tabindex home when no key matches', () => {
    expect(tabs).toMatch(/const home = selected < 0 \? 0 : selected;/);
    expect(tabs).toMatch(/tabIndex=\{i === home \? 0 : -1\}/);
    expect(tabs).not.toMatch(/if \(i < 0\) return;/);
  });
});

describe('an edited photo gets an edited thumbnail', () => {
  const create = code('features/social/pages/CreatePost.tsx');
  it('the apply handler drops the original poster and re-cuts one from the edited file', () => {
    expect(create).toMatch(/return \{ \.\.\.m, src, file, key: undefined, poster: undefined, posterKey: undefined \};/);
    expect(create).toMatch(/void compressImage\(file\)\.then\(\(\{ thumb \}\)/);
  });
});

describe('an expired signed link is re-minted, once per window', () => {
  beforeEach(() => resetRemint());
  const qc = () => { const calls: unknown[] = []; return { calls, invalidateQueries: (a: unknown) => { calls.push(a); return Promise.resolve(); } }; };
  it('the first error refetches; the next forty inside the window do not', () => {
    const q = qc();
    expect(onStaleMedia(q as never, ['social'])).toBe(true);
    for (let i = 0; i < 40; i += 1) expect(onStaleMedia(q as never, ['social'])).toBe(false);
    expect(q.calls).toEqual([{ queryKey: ['social'] }]);
    expect(REMINT_WINDOW_MS).toBeGreaterThanOrEqual(10_000);
  });
  it('every social image that shows a signed link listens for the error', () => {
    for (const f of ['features/social/PostCard.tsx', 'features/social/pages/Saved.tsx', 'features/social/pages/Profile.tsx']) {
      expect(code(f)).toMatch(/onError=\{\(\) => onStaleMedia\(qc, \['(social|profile)'\]\)\}/);
    }
  });
});

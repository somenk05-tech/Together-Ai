import { readFileSync } from 'fs';
import { join } from 'path';
import { isVisibilityKey } from '../dev/feature-flags';
import { LIVE_HUBS } from './live-hubs';
import {
  RELEASE_HUBS, RELEASE_KEYS, heldHubs, heldPaths, normaliseLiveHubs, releaseChannel, underPath,
} from './release';

/**
 * TWO CITIES FROM ONE CODEBASE (owner, 16 Sep). The developer site shows
 * everything; the live site shows the hubs the Go live button chose.
 */
describe('the release channel', () => {
  it('is live in production unless told otherwise — forgetting the variable must never leak', () => {
    expect(releaseChannel({ NODE_ENV: 'production' })).toBe('live');
    expect(releaseChannel({ NODE_ENV: 'production', RELEASE_CHANNEL: 'dev' })).toBe('dev');
    expect(releaseChannel({ NODE_ENV: 'production', RELEASE_CHANNEL: ' LIVE ' })).toBe('live');
    expect(releaseChannel({ NODE_ENV: 'production', RELEASE_CHANNEL: 'staging' })).toBe('live');
  });

  it('is the developer city on a laptop and in the test suites', () => {
    expect(releaseChannel({})).toBe('dev');
    expect(releaseChannel({ NODE_ENV: 'test' })).toBe('dev');
    expect(releaseChannel({ NODE_ENV: 'development', RELEASE_CHANNEL: 'live' })).toBe('live');
  });
});

describe('the hubs the button can hold back', () => {
  it('are all real door switches, each once', () => {
    expect(RELEASE_KEYS.filter((k) => !isVisibilityKey(k))).toEqual([]);
    expect(new Set(RELEASE_KEYS).size).toBe(RELEASE_KEYS.length);
  });

  it('never include the citizen\'s own doors', () => {
    for (const k of ['mail', 'chat', 'personal', 'mira']) expect(RELEASE_KEYS).not.toContain(k);
  });

  it('launch as the four doors (owner, 16 Sep), and the list holds nothing unknown', () => {
    expect(LIVE_HUBS.filter((k) => !RELEASE_KEYS.includes(k))).toEqual([]);
    expect(normaliseLiveHubs(LIVE_HUBS)).toEqual([...LIVE_HUBS]);
  });

  it('are held only on the live city', () => {
    expect(heldHubs('dev', ['social'])).toEqual([]);
    const held = heldHubs('live', ['social', 'services']);
    expect(held).not.toContain('social');
    expect(held).toContain('beauty');
    expect(held).toHaveLength(RELEASE_HUBS.length - 2);
  });

  it('hold every address their hub owns, matched by segment', () => {
    expect(heldPaths(['dating'])).toEqual(['/matchmaking', '/dating']);
    expect(underPath('/beauty/market', '/beauty')).toBe(true);
    expect(underPath('/beauty', '/beauty')).toBe(true);
    expect(underPath('/beautyful', '/beauty')).toBe(false);
  });

  it('are cleaned into list order, each once', () => {
    expect(normaliseLiveHubs(['social', 'personalize', 'social'])).toEqual(['personalize', 'social']);
  });
});

describe('the live-hubs file the workflow rewrites', () => {
  const src = readFileSync(join(__dirname, 'live-hubs.ts'), 'utf8');
  const root = join(__dirname, '..', '..', '..');
  const wf = readFileSync(join(root, '.github', 'workflows', 'go-live.yml'), 'utf8');
  // The steps themselves live in release/go-live.sh, which the workflow reads from main.
  const sh = readFileSync(join(root, 'release', 'go-live.sh'), 'utf8');

  it('keeps the one export the workflow writes', () => {
    expect(src).toMatch(/export const LIVE_HUBS: readonly string\[\] = \[/);
    expect(sh).toContain('together-city-chat/src/release/live-hubs.ts');
    expect(sh).toContain('export const LIVE_HUBS: readonly string[] = [');
  });

  it('is released only by building the release before main moves', () => {
    expect(wf).toMatch(/workflow_dispatch:/);
    expect(wf).toContain('git show origin/main:release/go-live.sh');
    expect(wf).toMatch(/npx tsc --noEmit/);
    expect(wf).toMatch(/prisma migrate deploy/);
    // Prepare (hubs + merge or picks) runs BEFORE the gates, push only after them.
    expect(wf.indexOf('go-live.sh" prepare')).toBeLessThan(wf.indexOf('npx prisma migrate deploy'));
    expect(wf.indexOf('npm run build -- --base=/')).toBeLessThan(wf.indexOf('go-live.sh" push'));
    expect(sh).toMatch(/git push --atomic origin "\$DEV_SHA:refs\/heads\/develop" HEAD:main/);
    expect(sh.indexOf('git push --atomic')).toBeGreaterThan(sh.indexOf('git cherry-pick -x'));
  });

  it('sends only the chosen changes when told which, and says when one needs another', () => {
    expect(wf).toMatch(/commits:\n\s+description:[^\n]*\n\s+required: false/);
    expect(wf).toContain('COMMITS: ${{ inputs.commits }}');
    // A picked change keeps "cherry picked from" so the button knows it is live.
    expect(sh).toContain('git cherry-pick -x "$c"');
    expect(sh).toContain('builds on a change you did not choose');
    // Only commits that are waiting on develop can be named.
    expect(sh).toContain('rev-list --reverse --no-merges "origin/main..$DEV_SHA"');
  });

  it('refuses a hub key the API does not know, in the release script as well', () => {
    for (const k of RELEASE_KEYS) expect(sh).toContain(k);
  });
});

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TWO CITIES FROM ONE CODEBASE (owner, 16 Sep).
 *
 * The developer copy (dev.togethercity.app) shows every hub and carries the Go
 * live button; the live site shows only the hubs that button chose, and a held
 * hub's address says "opening soon". These read source as text, so tsc runs
 * first in every landing script.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(resolve(HERE, '..', p), 'utf8');

describe('two cities', () => {
  it('answers a held district before anything else on every route', () => {
    const gate = src('components/RoomGate.tsx');
    expect(gate.indexOf('switches.live(pathname)')).toBeGreaterThan(-1);
    expect(gate.indexOf('switches.live(pathname)')).toBeLessThan(gate.indexOf('switches.pageOpen(pathname)'));
    expect(gate).toMatch(/Opening soon/);
  });

  it('reads the held addresses from the same public switch list, failing open', () => {
    const hook = src('hooks/useCityDesign.ts');
    expect(hook).toMatch(/const notLive = release\?\.notLive \?\? \[\];/);
    expect(hook).toMatch(/path\.startsWith\(`\$\{p\}\/`\)/);
  });

  it('puts the Go live button on /dev, above the tabs', () => {
    const dev = src('features/dev/pages/Dev.tsx');
    expect(dev).toMatch(/<GoLive password=\{password\} \/>/);
    expect(dev.indexOf('<GoLive')).toBeLessThan(dev.indexOf("borderBottom: '1px solid var(--line)', margin: '16px 0 18px'"));
    const panel = src('features/dev/GoLive.tsx');
    expect(panel).toMatch(/s\.canGoLive/);
    expect(src('features/dev/release.api.ts')).toMatch(/'\/dev\/release\/go-live'/);
  });

  it('keeps the developer copy out of search engines', () => {
    const vercel = JSON.parse(readFileSync(resolve(HERE, '..', '..', 'vercel.json'), 'utf8')) as {
      headers: Array<{ has?: Array<{ type: string; value: string }>; headers: Array<{ key: string; value: string }> }>;
    };
    const dev = vercel.headers.find((h) => h.has?.some((c) => c.type === 'host' && c.value === 'dev.togethercity.app'));
    expect(dev?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
  });
});

describe('a go live button wherever there is a change (owner, 16 Sep)', () => {
  it('is mounted once, at the root every page goes through', () => {
    expect(src('layouts/RootChrome.tsx')).toMatch(/<GoLiveDock \/>/);
  });

  it('shows only on the developer copy, for a signed-in owner, when something is waiting', () => {
    const dock = src('features/dev/GoLiveDock.tsx');
    expect(dock).toMatch(/channel === 'dev' && authed/);
    expect(dock).toMatch(/waiting < 1\)\) return null/);
    expect(src('features/dev/release.api.ts')).toMatch(/'\/release\/pending'/);
  });

  it('asks for the developer password to press, and never keeps it', () => {
    const dock = src('features/dev/GoLiveDock.tsx');
    expect(dock).toMatch(/releaseApi\.goLive\(password/);
    expect(dock).not.toMatch(/localStorage|sessionStorage/);
  });

  it('lets the owner choose which changes go live now (owner, 16 Sep)', () => {
    const picker = src('features/dev/ChangePicker.tsx');
    expect(picker).toMatch(/type="checkbox"/);
    expect(picker).toMatch(/c\.areas/);
    expect(picker).toMatch(/needsUnticked/);
    const dock = src('features/dev/GoLiveDock.tsx');
    // Everything ticked sends everything; otherwise only the ticked ids.
    expect(dock).toMatch(/sendAll \? undefined : picked/);
    expect(src('features/dev/GoLive.tsx')).toMatch(/commits: sendAll \? undefined : picked/);
    expect(src('features/dev/release.api.ts')).toMatch(/commits\?\.length \? \{ commits \} : \{\}/);
  });

  it('says whether the last release has been deployed', () => {
    expect(src('features/dev/release.api.ts')).toMatch(/'\/release\/status'/);
    const picker = src('features/dev/ChangePicker.tsx');
    expect(picker).toMatch(/deployed: 'Live — deployed on togethercity\.app\.'/);
    expect(src('features/dev/GoLiveDock.tsx')).toMatch(/<ReleaseProgress/);
    expect(src('features/dev/GoLive.tsx')).toMatch(/<ReleaseProgress/);
  });
});

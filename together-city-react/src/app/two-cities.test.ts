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

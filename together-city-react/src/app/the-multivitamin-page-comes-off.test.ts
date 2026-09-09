import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * ── THE MULTIVITAMIN PAGE COMES OFF (owner, 9 Sep) ──────────────────────────
 *
 * It stood on the Fitness rail from 5 Sep as an advising screen whose most
 * useful sentence was a refusal — thirty-two labels read against their own
 * claims, and none of them recommended. The owner removed it.
 *
 * This file exists because a removal is the easiest thing in a monorepo to
 * undo by accident: a route left behind, a rail entry restored by a session
 * that had the old file open, a hook nothing calls sitting in the bundle. The
 * SERVER side is deliberately untouched — the engine and its specs still hold
 * the research — so there is nothing here about /fitness/multivitamins on the
 * API, only about the doors into it.
 */
describe('the page is gone from the web', () => {
  it('has no page file', () => {
    expect(existsSync(join(SRC, 'features/fitness/pages/Multivitamins.tsx'))).toBe(false);
  });

  it('has no route and no lazy import', () => {
    expect(read('app/router.tsx')).not.toMatch(/multivitamin/i);
  });

  it('has no hook left in the bundle graph', () => {
    /* A hook nothing calls is a schema, a query key and a wire still shipped
       to every citizen who opens Fitness. */
    expect(read('api/supplements.api.ts')).not.toMatch(/useMultivitaminAssessment|MultivitaminSchema/);
  });
});

describe('the rail closes up behind it', () => {
  const hubs = read('config/hubs.ts');
  const fitness = hubs.slice(hubs.indexOf("'/fitness/profile'"), hubs.indexOf("'/fitness/orders'"));

  it('has no Multivitamins door', () => {
    expect(fitness).not.toMatch(/label: 'Multivitamins'/);
  });

  it('counts without a gap', () => {
    /* A menu that counts 04-06 advertises the thing it is trying not to
       advertise — the same reason the numbering closed at 03 and at 02. */
    const nums = [...hubs.matchAll(/\{ path: '\/fitness\/[a-z]+', index: '(\d\d)'/g)].map((m) => m[1]);
    expect(nums).toEqual(nums.map((_, i) => String(i + 1).padStart(2, '0')));
  });

  it('lands a saved link somewhere real', () => {
    expect(read('config/labels.ts')).toMatch(/'\/fitness\/multivitamins': '\/fitness\/supplements'/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const router = readFileSync(join(web, 'app', 'router.tsx'), 'utf8');
const boundary = readFileSync(join(web, 'app', 'ChunkBoundary.tsx'), 'utf8');

/**
 * THE ROOT HAS A CARD (launch gate, third reading, 4 Sep, blocker 3).
 *
 * `ChunkBoundary` wraps every lazy page, and for a page that is the whole of
 * the answer. It is not the whole of the tree: RootChrome, the header, Mira's
 * dock and the sixteen eager hub landings render above and beside it, and a
 * throw in any of those fell through to react-router's built-in
 * "Unexpected Application Error!" — the raw message on a white page, no
 * header, no way home. Open on the 2 Sep reading, still open on the 4 Sep
 * one. Now the root route and every block under it carry `RouteError`, which
 * draws the same card the boundary draws.
 *
 * A source-text guard, like the rest of this folder: it reads the router as
 * text rather than mounting it, so it says exactly one thing and cannot be
 * satisfied by a boundary that exists but is not wired.
 */
describe('the root has a card', () => {
  it('the root route names an errorElement', () => {
    expect(router).toMatch(/element: <RootChrome \/>,[\s\S]{0,400}errorElement: <RouteError \/>/);
  });

  it('every route block names one too, so the chrome stays over a page that threw', () => {
    expect(router).toMatch(/ROUTE_BLOCKS\.map\(\(block\) => \(\{ \.\.\.block, errorElement: <RouteError \/> \}\)\)/);
  });

  it('the card is the boundary’s card, not a second one', () => {
    expect(boundary).toMatch(/export function RouteError\(\)/);
    // Both draw FailureCard; there is no second markup for "this page failed".
    expect(boundary.match(/<FailureCard /g)?.length).toBe(2);
    expect(boundary).toMatch(/useRouteError\(\)/);
  });

  it('a stale chunk reaching the root reloads on the boundary’s own flag, once', () => {
    // The same RELOAD_FLAG, so the boundary and the route card cannot ping-pong
    // a reload between them.
    expect(boundary.match(/RELOAD_FLAG/g)?.length).toBeGreaterThanOrEqual(5);
  });
});

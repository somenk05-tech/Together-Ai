import { readFileSync } from 'fs';
import { join } from 'path';
import { allRoutes, controllerFiles, Route } from './route-inventory';

/**
 * Structural security guards over the whole API surface.
 *
 * These do not boot Nest and do not need a database. They assert properties of
 * the source that no amount of feature work should quietly change: which routes
 * are reachable without a token, and which handlers accept a caller-supplied
 * resource id without knowing who is asking.
 *
 * The point of freezing the two lists below is that ADDING to them requires a
 * deliberate edit to this file. A new public route, or a new id-taking handler
 * that never learns the current user, fails the suite until someone writes down
 * why it is safe.
 */

/**
 * Every route reachable without authentication.
 *
 * The global JwtAuthGuard (app.module.ts) protects by default, so this list is
 * exactly the set carrying @Public(): sign-up, sign-in, token refresh, account
 * recovery, email verification, and two unauthenticated status endpoints.
 * Nothing here may read or mutate a specific citizen's data.
 */
const PUBLIC_ALLOWLIST = [
  'auth POST register',
  'auth POST login',
  'auth GET handle-available',
  // check-handle / check-email deleted 1 Aug (e75f1c1) — unused duplicates
  // of the GET *-available pair. The public surface SHRANK by two.
  'auth GET email-available',
  'auth POST refresh',
  'auth POST forgot',
  'auth POST reset',
  'city GET header',
  'health GET',
].sort();

/**
 * Authenticated routes that take a caller-supplied id but deliberately do NOT
 * receive the current user, because the row they read is shared catalogue data
 * owned by nobody: film and event metadata, static lookup lists, a recipe, a
 * travel package. Every one of these is a read.
 *
 * A handler reading a CITIZEN-owned row must never appear here — without the
 * current user it cannot check ownership, which is an IDOR by construction.
 */
const UNSCOPED_CATALOGUE_READS = [
  'entertainment GET movies/:id',
  'entertainment GET tv/:id',
  'entertainment GET sources/:type/:id',
  'entertainment GET person/:id',
  'entertainment GET events/:id',
  'lookups GET :category',
  'nutrition GET recipes/:id/variants',
  'travel GET packages/:id',
].sort();

describe('API surface — structural security guards', () => {
  const routes: Route[] = allRoutes();

  it('parses a plausible surface (guards the parser itself)', () => {
    // If a refactor breaks the parser, every assertion below would pass
    // vacuously. Pin the shape so silence always means "checked", not "found
    // nothing to check".
    expect(controllerFiles().length).toBeGreaterThanOrEqual(30);
    expect(routes.length).toBeGreaterThan(300);
    expect(routes.every((r) => r.method && r.id)).toBe(true);
  });

  it('exposes no route without a token beyond the frozen allowlist', () => {
    const actual = routes.filter((r) => r.isPublic).map((r) => r.id).sort();
    expect(actual).toEqual(PUBLIC_ALLOWLIST);
  });

  it('gives every id-taking handler the current user, except shared catalogue reads', () => {
    const offenders = routes
      .filter((r) => !r.isPublic && r.takesRouteParam && !r.takesCurrentUser)
      .map((r) => r.id)
      .sort();
    expect(offenders).toEqual(UNSCOPED_CATALOGUE_READS);
  });

  it('never lets a public route also take a resource id', () => {
    // A route that is both unauthenticated and id-addressable is an
    // enumeration surface. There should be none, ever.
    const both = routes.filter((r) => r.isPublic && r.takesRouteParam).map((r) => r.id);
    expect(both).toEqual([]);
  });

  it('keeps every mutation authenticated', () => {
    const publicMutations = routes
      .filter((r) => r.isPublic && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(r.method))
      .map((r) => r.id);
    // The only unauthenticated POSTs are the credential flows themselves.
    expect(publicMutations.every((id) => id.startsWith('auth '))).toBe(true);
  });
});

describe('production source carries no invented data', () => {
  /**
   * Flags IDENTIFIERS named for fake data — `const mockUser`, `function
   * dummyPlan()`, `let placeholderRows`. Deliberately not a bare text search:
   * the word "fake" legitimately appears in a moderation prompt and in comments
   * explaining why demo rows are gated, and failing on those would train people
   * to disable the guard.
   */
  const FAKE_IDENTIFIER =
    /\b(?:const|let|var|function|class)\s+\w*(?:mock|dummy|fake|placeholder)\w*/i;

  function sourceFiles(): string[] {
    // Reuse the controller walker's directory traversal by walking from src/.
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const root = join(__dirname, '..');
    const out: string[] = [];
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full);
      }
    })(root);
    return out;
  }

  it('declares no mock/dummy/fake/placeholder value in non-test code', () => {
    const hits: string[] = [];
    for (const file of sourceFiles()) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.split('//')[0]; // ignore trailing comments
        if (FAKE_IDENTIFIER.test(code)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

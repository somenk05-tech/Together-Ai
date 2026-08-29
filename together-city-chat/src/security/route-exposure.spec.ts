import { readFileSync, readdirSync, statSync } from 'fs';
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
  // The inbound mail webhook. Resend has no user session and cannot mint a
  // token, so this route cannot be JWT-authenticated — but it is NOT
  // unauthenticated: InboundSecretGuard checks a shared secret in constant time
  // before the handler runs. It is on this list because it is JWT-public; the
  // mutation guard below is what holds it to naming its own protection.
  'mail POST inbound',
  // One-click unsubscribe. List-Unsubscribe-Post is pressed by a mail client
  // with nobody signed in — that is the entire point of the header — so there
  // is no session to require. Like the webhook above it is JWT-public and NOT
  // unauthenticated: UnsubscribeTokenGuard reads an HMAC over the address and
  // an expiry off the query string, and the mutation rule below is what holds
  // it to naming that.
  'mail POST unsubscribe',
  // The signed-out header's list of doors this site is not currently drawing.
  // Public deliberately: the header renders before anybody signs in, and an
  // authed-only read would show a hidden door to strangers and hide it from
  // citizens, which is the wrong way round. See visibility.controller.ts.
  'visibility GET',
  // One dating photograph, to the viewer its link names. Public because an
  // <img> tag cannot send an Authorization header — the signed token in the
  // path stands in for the session. It is the ONLY id-taking public route in
  // the API, and the exception is written down below rather than waved through.
  'dating GET photo/:token',
].sort();

/**
 * Public routes that mutate, and the guard that authenticates each instead.
 *
 * The rule this API has kept is "no unauthenticated mutation", and for a long
 * time that was the same sentence as "no public POST outside auth". A webhook
 * breaks the second without breaking the first. So the rule is now written as
 * what it always meant: a public mutation must NAME the mechanism that guards
 * it, and that mechanism must be a real guard on the route — where the
 * inventory, and a reviewer skimming the controller, can see it.
 */
const GUARDED_PUBLIC_MUTATIONS: Record<string, string> = {
  'mail POST inbound': 'InboundSecretGuard',
  'mail POST unsubscribe': 'UnsubscribeTokenGuard',
};

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

  /**
   * A route that is both unauthenticated and id-addressable is an enumeration
   * surface. The rule stands; this is the one thing it is allowed to be.
   *
   * `dating GET photo/:token` takes a CAPABILITY, not a resource id. The
   * parameter is a base64url payload signed with an HMAC over a secret derived
   * from the access secret, so it cannot be guessed, incremented or walked —
   * and the handler does not trust it either: it re-reads the live rows and
   * refuses if the viewer has since been blocked, or the photo taken out of
   * review, or either profile hidden. Guessing a valid token is forging a
   * signature; holding a real one gets you what its named viewer may still see.
   *
   * Anything else appearing here is the enumeration surface the rule is about.
   */
  const ID_TAKING_PUBLIC_ROUTES = ['dating GET photo/:token'];

  it('never lets a public route also take a resource id', () => {
    const both = routes.filter((r) => r.isPublic && r.takesRouteParam).map((r) => r.id).sort();
    expect(both).toEqual(ID_TAKING_PUBLIC_ROUTES);
  });

  it('keeps every mutation authenticated', () => {
    const publicMutations = routes
      .filter((r) => r.isPublic && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(r.method));
    // Unauthenticated POSTs are the credential flows themselves. Anything else
    // that mutates without a JWT must carry the guard that authenticates it
    // instead — declared above, and actually present on the route.
    const unprotected = publicMutations
      .filter((r) => !r.id.startsWith('auth '))
      .filter((r) => {
        const expected = GUARDED_PUBLIC_MUTATIONS[r.id];
        return !expected || !r.guards.includes(expected);
      })
      .map((r) => `${r.id} (guards: ${r.guards.join(', ') || 'none'})`);
    expect(unprotected).toEqual([]);
  });

  it('does not let the guarded-mutation list name a route that is gone', () => {
    // A named exception that outlives its route is a hole with a comment on it.
    const ids = new Set(routes.map((r) => r.id));
    expect(Object.keys(GUARDED_PUBLIC_MUTATIONS).filter((id) => !ids.has(id))).toEqual([]);
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

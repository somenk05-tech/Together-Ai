import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Nest calls these; no line of ours does. */
const LIFECYCLE = new Set([
  'onModuleInit', 'onModuleDestroy', 'onApplicationBootstrap',
  'onApplicationShutdown', 'beforeApplicationShutdown', 'constructor',
]);

/** A decorator is a caller: the scheduler, the event bus or the socket layer. */
const DRIVEN = /@(Cron|Interval|Timeout|OnEvent|SubscribeMessage|Process|EventPattern|MessagePattern)\b/;

/** Words the signature regex would otherwise pick up as method names. */
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'get', 'set', 'do', 'else']);

/**
 * Public, uncalled, and kept on purpose — by name, with the reason.
 *
 * The rule this file enforces is not "delete everything nothing calls". It is
 * that an uncalled public method is a DECISION somebody made, not an accident
 * nobody noticed. One entry, and it earns it:
 *
 * `assertHubAccess` is the throwing form of `canAccessHub`, which IS called —
 * nutrition's household path asks it before reading a member's nutrition or
 * medical data. The throwing variant has no caller because no other hub
 * currently reads across citizens: every medical route takes `user.sub` and
 * none accepts another citizen's id, so there is no second cross-user read to
 * gate. Its spec, `hub-access.spec.ts`, pins what a grant and a revocation
 * mean and is the record of a gap that was real when it was written.
 *
 * Deleting it would delete a working authorisation gate and the argument for
 * it, in a week when nobody is adding cross-citizen reads. Listing it says the
 * absence of a caller was looked at.
 */
const KEPT_UNCALLED = new Map<string, string>([
  ['connections/connections.service.ts — assertHubAccess()',
   'throwing form of canAccessHub; no second cross-citizen read exists to gate yet'],
]);

/**
 * ── THE LAST LINK NOTHING WAS WATCHING ──────────────────────────────────────
 *
 * A request travels: screen → hook → api member → route → service. By the end
 * of 28 Aug three of those four links had a guard, and each was written after a
 * defect slipped through the others:
 *
 *   screen → hook    scripts/dead-export-audit.mjs (web) — reads imports
 *   hook → member    every-api-member-has-a-caller.test.ts (web) — reads calls
 *   member → route   the orphan-route guard (api)
 *   route → service  NOTHING
 *
 * That last gap is where `DatingService.unlockChat` lived: a public method that
 * its own route did not call, because the route called `connect` directly. It
 * was dead one layer deeper than anything could see, and the route above it was
 * a duplicate of `connect` that had lost its rate limit.
 *
 * This closes it. A public method on a service that nothing anywhere invokes —
 * no controller, no gateway, no other service, not even a line in its own file
 * — is the far end of a chain that has died.
 *
 * The first sweep found four, and every one had the same story: the caller was
 * deliberately removed and the method was left behind.
 *
 *   conversations.summaryFor   superseded by summariesFor when the fifteen-
 *                              second polling loop went — and its own comment
 *                              still claimed the Dating Hub chat list used it.
 *   messages.pendingForUser    the 500-message query behind `sync_pending`,
 *                              an event chat.gateway.ts removed on purpose,
 *                              saying so in a comment the method outlived.
 *   beauty.uploadAllowance     a third copy of the rolling-week arithmetic.
 *   blocking.blockedIds        a convenience nothing ever found convenient.
 *
 * A method left behind is not inert. It is a working, tested-looking thing that
 * the next person wires up — which is how `sync_pending`'s 500-row handshake
 * query comes back after somebody argued it out.
 */
describe('a service method somebody reaches', () => {
  const files = walk(SRC).filter((f) => !f.endsWith('.spec.ts'));
  const sources = new Map(files.map((f) => [f, strip(readFileSync(f, 'utf8'))]));

  it('reads the services at all', () => {
    // A walk that finds nothing passes the assertion below without checking it.
    expect(files.filter((f) => f.endsWith('.service.ts')).length).toBeGreaterThan(20);
  });

  it('leaves no public service method that nothing invokes', () => {
    const unreached: string[] = [];

    for (const [file, src] of sources) {
      if (!file.endsWith('.service.ts')) continue;
      const lines = src.split('\n');

      lines.forEach((line, i) => {
        const m = /^ {2}(?!private |protected )(?:public )?(?:async )?(\w+)\s*[(<]/.exec(line);
        if (!m) return;
        const name = m[1];
        if (LIFECYCLE.has(name) || KEYWORDS.has(name) || name.startsWith('_')) return;

        // Decorators sit above the signature. Walk up the contiguous block —
        // the same lesson the throttle guard learned when a forward-only
        // window misread half its routes.
        let top = i;
        while (top > 0 && /^\s*[@)]|^\s*$/.test(lines[top - 1]) && !/^ {2}\w/.test(lines[top - 1])) top -= 1;
        if (DRIVEN.test(lines.slice(top, i + 1).join('\n'))) return;

        const called = new RegExp(`\\.${name}\\s*[(<]`);
        if (![...sources.values()].some((s) => called.test(s))) {
          const key = `${relative(SRC, file)} — ${name}()`;
          if (!KEPT_UNCALLED.has(key)) unreached.push(key);
        }
      });
    }

    // Named, so the failure says which method rather than a bare count.
    expect(unreached).toEqual([]);
  });

  it('keeps no entry on the list that is in fact called', () => {
    // The list rots the other way too. A method that gains a caller should
    // drop off it, or "we looked at this" quietly becomes "we forgot".
    const stale: string[] = [];
    for (const key of KEPT_UNCALLED.keys()) {
      const name = /— (\w+)\(\)$/.exec(key)?.[1];
      const file = key.split(' — ')[0];
      expect({ key, parsed: Boolean(name) }).toEqual({ key, parsed: true });
      const declared = [...sources.keys()].some((f) => relative(SRC, f) === file);
      expect({ key, fileExists: declared }).toEqual({ key, fileExists: true });
      const called = new RegExp(`\\.${name}\\s*[(<]`);
      const callers = [...sources.entries()].filter(([f, s]) => relative(SRC, f) !== file && called.test(s));
      if (callers.length) stale.push(key);
    }
    expect(stale).toEqual([]);
  });
});

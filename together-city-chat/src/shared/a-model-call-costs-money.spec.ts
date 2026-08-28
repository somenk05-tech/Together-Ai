import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/**
 * ── A ROUTE THAT SPENDS MONEY, AT THE RATE OF A ROUTE THAT DOES NOT ─────────
 *
 * `POST /dating/profile` ran a model call on every save and carried no
 * throttle, so it sat at the global default of 120 a minute: one citizen
 * re-saving a bio could bill 120 model calls a minute and the first sign of it
 * would be the invoice. Fixing that one raised the obvious question, and the
 * sweep found ten more.
 *
 * The worst were four GETs — `/ai/recipes`, `/ai/astrology`, `/ai/beauty`,
 * `/ai/fitness` — with no caching of any kind and one model call each. GETs
 * are retried by browsers, prefetched by link handlers and re-fired by a page
 * that remounts, so those four together were 480 model calls a minute from one
 * citizen doing nothing unusual.
 *
 * `MODEL_LIMIT` already existed, correctly reasoned, in `mira.controller.ts`.
 * It had been applied in exactly one hub. It now lives in `shared/throttles.ts`
 * and this file keeps every route that reaches the model attached to it.
 *
 * TWO FALSE POSITIVES ARE WORTH RECORDING, because the naive version of this
 * check reports them and they are both fine:
 *   - `beauty.getProfile` matches `this.ai.` — but only `this.ai.enabled`, a
 *     property read.
 *   - `GET /medical/summary` reaches the model only through
 *     `getOrCreateAnalysis`, which is cached per blood test: "runs the AI only
 *     if it doesn't exist yet — never on a plain page load".
 * A check that flags those trains people to ignore it, so it matches on CALLS
 * rather than on the receiver.
 *
 * AND THE FIRST VERSION OF THAT DISTINCTION WAS WRONG IN THE OTHER DIRECTION.
 * It required a `(` immediately after the method name — `this\.ai\.\w+\s*\(` —
 * which misses every GENERIC call, and generic calls are the common form here:
 * `this.ai.json<Suggestion[]>(...)`, `this.ai.json<{ flagged: boolean }>(...)`.
 * The whole of `ai-suggestions.service.ts` fell through it, so the guard went
 * green while `/ai/astrology` sat with its throttle deliberately removed. It
 * was caught only because the red-on-defect check was actually run rather than
 * assumed. A guard that cannot fail is worse than no guard: it is a green tick
 * next to an unbilled model call.
 *
 * The matcher now accepts `<` as well as `(` after the name. A property read
 * is followed by whitespace, `;`, `,`, `)` or `.` — never by either.
 */
describe('a model call costs money', () => {
  const files = walk(SRC);
  const services = files.filter((f) => f.endsWith('.service.ts'));
  const controllers = files.filter((f) => f.endsWith('.controller.ts'));

  /**
   * Service methods that reach the model — TRANSITIVELY.
   *
   * One hop is not enough, and `medical` is the proof. The controller calls
   * `extractBloodReport`, whose own body contains only `this.ai.enabled`; the
   * vision call over the lab report happens in a helper it delegates to. A
   * one-hop check reported that route as clean while its throttle was removed
   * — on the most expensive call in the codebase, over somebody's blood work.
   *
   * So: read every method, note which sibling methods it calls, and propagate
   * "spends money" backwards until nothing changes.
   */
  const spenders = new Map<string, Set<string>>();
  for (const f of services) {
    const src = strip(readFileSync(f, 'utf8'));
    const heads = [...src.matchAll(/^ {2}(?:private |public )?(?:async )?(\w+)\s*[(<]/gm)];
    if (!heads.length) continue;

    const direct = new Set<string>();
    const calls = new Map<string, string[]>();
    for (let i = 0; i < heads.length; i += 1) {
      const name = heads[i][1];
      const from = heads[i].index ?? 0;
      const to = i + 1 < heads.length ? heads[i + 1].index ?? src.length : src.length;
      const body = src.slice(from, to);
      // A CALL, not a property read: `this.ai.enabled` must not match, and a
      // generic call `this.ai.json<T>(...)` must.
      if (/this\.ai\.\w+\s*[<(]/.test(body)) direct.add(name);
      calls.set(name, [...body.matchAll(/this\.(\w+)\s*[<(]/g)].map((m) => m[1]));
    }

    const reaches = new Set(direct);
    for (let pass = 0; pass < heads.length; pass += 1) {
      let grew = false;
      for (const [name, callees] of calls) {
        if (reaches.has(name)) continue;
        if (callees.some((c) => reaches.has(c))) { reaches.add(name); grew = true; }
      }
      if (!grew) break;
    }

    if (!reaches.size) continue;
    const hub = f.split('/').slice(-2)[0];
    if (!spenders.has(hub)) spenders.set(hub, new Set());
    for (const n of reaches) spenders.get(hub)!.add(n);
  }

  it('finds the services that reach the model at all', () => {
    // If this drops to nothing, every assertion below passes vacuously.
    expect(spenders.size).toBeGreaterThan(5);
  });

  it('throttles every route whose handler reaches the model', () => {
    const unguarded: string[] = [];

    for (const f of controllers) {
      const hub = f.split('/').slice(-2)[0];
      const names = spenders.get(hub);
      if (!names) continue;
      const lines = strip(readFileSync(f, 'utf8')).split('\n');

      lines.forEach((line, i) => {
        const m = /@(Get|Post|Patch|Delete|Put)\('([^']*)'\)/.exec(line);
        if (!m) return;
        // Decorators sit both above and below the route line — walk up across
        // the contiguous block, the same lesson the dating throttle guard had
        // to learn after a forward-only window misread half its routes.
        let top = i;
        while (top > 0 && /^\s*[@)]|^\s*$/.test(lines[top - 1]) && !/@(Get|Post|Patch|Delete|Put)\(/.test(lines[top - 1])) top -= 1;
        let sig = i;
        while (sig < lines.length - 1 && !/\{\s*$/.test(lines[sig])) sig += 1;

        let depth = 0; let started = false; let end = sig;
        for (let j = sig; j < Math.min(sig + 80, lines.length); j += 1) {
          depth += (lines[j].match(/\{/g) ?? []).length - (lines[j].match(/\}/g) ?? []).length;
          if (lines[j].includes('{')) started = true;
          if (started && depth <= 0) { end = j; break; }
        }

        const decorators = lines.slice(top, sig + 1).join('\n');
        const body = lines.slice(sig, end + 1).join('\n');
        const calls = [...names].some((n) => new RegExp(`\\.${n}\\s*[<(]`).test(body));
        if (calls && !/@Throttle\(/.test(decorators)) unguarded.push(`${m[1].toUpperCase()} ${m[2]}  (${hub})`);
      });
    }

    // Named, so the failure says which route reaches the model unguarded.
    expect(unguarded).toEqual([]);
  });

  it('keeps one number for the model, in one place', () => {
    const shared = readFileSync(join(SRC, 'shared/throttles.ts'), 'utf8');
    expect(shared).toMatch(/export const MODEL_LIMIT = \{ default: \{ ttl: 60_000, limit: \d+ \} \}/);
    // A hub redefining it locally is how the one number quietly becomes five.
    const redefined = controllers.filter((f) => /const MODEL_LIMIT\s*=/.test(readFileSync(f, 'utf8')));
    expect(redefined).toEqual([]);
  });
});

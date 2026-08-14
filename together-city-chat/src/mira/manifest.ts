import { readFileSync } from 'fs';
import { join } from 'path';
import { allRoutes, controllerFiles, type Route } from '../security/route-inventory';
import type { MiraCapability, Risk } from './mira.decorator';

export type { Risk };

export interface Capability extends MiraCapability {
  /** Stable id: the route's own id, so it cannot drift from the route. */
  id: string;
  file: string;
  method: string;
  /** Full path as the API serves it, without the /api prefix. */
  path: string;
  /** Whether the handler receives @CurrentUser() — a capability acting for someone must. */
  takesCurrentUser: boolean;
}

const SRC_ROOT = join(__dirname, '..');
const ROUTE_DECORATOR = /^\s*@(Get|Post|Patch|Delete|Put)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/;

/**
 * Pull every @Mira({...}) literal and the route decorator it belongs to.
 *
 * A source parse rather than `Reflect.getMetadata`, deliberately. Booting Nest
 * to answer "which routes are Mira's" would mean the answer is only available
 * at runtime, and the build gates below need it at build time — a dropped
 * decorator should turn a test red, not surface as a capability quietly going
 * missing in production.
 *
 * Scanned FORWARDS with balanced-paren capture, which the first draft did not
 * do: it walked backwards from the route looking for a line starting with `)`,
 * and a multi-line decorator ends with `})`. The manifest came back empty and
 * every gate below failed at once — which is exactly what those gates are for,
 * and the argument for gate 1 asserting a non-empty manifest rather than only
 * validating whatever it happened to find.
 */
function parseCapabilities(file: string): Array<{ cap: MiraCapability; method: string; path: string; line: number }> {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const out: Array<{ cap: MiraCapability; method: string; path: string; line: number }> = [];

  let pending: MiraCapability | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('@Mira(')) {
      // Consume forward until the parens balance — the literal may span lines.
      let depth = 0, buf = '', j = i, seen = false;
      for (; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '(') { depth++; seen = true; }
          else if (ch === ')') depth--;
        }
        buf += lines[j] + '\n';
        if (seen && depth === 0) break;
      }
      const body = buf.slice(buf.indexOf('(') + 1, buf.lastIndexOf(')')).trim();
      try {
        // Our own literal, in our own source, evaluated at build time.
        // eslint-disable-next-line no-new-func
        pending = new Function(`return (${body})`)() as MiraCapability;
      } catch {
        pending = null;
      }
      i = j;
      continue;
    }

    const m = line.match(ROUTE_DECORATOR);
    if (m) {
      if (pending) {
        out.push({ cap: pending, method: m[1].toUpperCase(), path: (m[2] ?? m[3] ?? '').trim(), line: i });
        pending = null;
      }
      continue;
    }

    // Anything that is neither a decorator, a comment nor blank ends the block.
    // Without this a @Mira() written above nothing would attach itself to the
    // next route down the file.
    const t = line.trim();
    if (t && !t.startsWith('@') && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')) {
      pending = null;
    }
  }

  return out;
}

let cached: Capability[] | null = null;

/** Every route Mira is allowed to want. Generated — never hand-written. */
export function manifest(): Capability[] {
  if (cached) return cached;

  const routes = new Map<string, Route>();
  for (const r of allRoutes()) routes.set(`${r.file}::${r.id}`, r);

  const out: Capability[] = [];
  for (const file of controllerFiles()) {
    const rel = file.slice(SRC_ROOT.length + 1);
    const src = readFileSync(file, 'utf8');
    /**
     * THE NEAREST @Controller ABOVE, NOT THE FIRST IN THE FILE.
     *
     * `prescriptions.controller.ts` declares two: `@Controller('prescriptions')`
     * and `@Controller('medicines')`. Matching the first one gave every
     * capability in that file the `prescriptions` prefix — so the build-time id
     * was `prescriptions GET today` while the RUNTIME registry, reading metadata
     * off the actual handler, produced `medicines GET today`.
     *
     * Two ids for one route, and the executor keys off the runtime one, so the
     * source parse's gates were silently guarding a route that does not exist.
     * That is the same class of divergence the registry was written to end, one
     * layer down, and it survived because only one file in the API has two
     * controllers in it.
     */
    const prefixes = [...src.matchAll(/@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g)]
      .map((m) => ({ line: src.slice(0, m.index ?? 0).split('\n').length - 1, prefix: (m[1] ?? m[2] ?? '').trim() }));
    const prefixAt = (line: number): string => {
      let found = '';
      for (const p of prefixes) { if (p.line <= line) found = p.prefix; else break; }
      return found;
    };

    for (const { cap, method, path, line } of parseCapabilities(file)) {
      const prefix = prefixAt(line);
      const id = `${prefix} ${method} ${path}`.trim();
      const route = routes.get(`${rel}::${id}`);
      out.push({
        ...cap,
        id,
        file: rel,
        path: [prefix, path].filter(Boolean).join('/'),
        method,
        takesCurrentUser: route?.takesCurrentUser ?? false,
      });
    }
  }

  cached = out.sort((a, b) => a.id.localeCompare(b.id));
  return cached;
}

/** For tests that mutate source expectations. */
export function clearManifestCache(): void { cached = null; }

export const byId = (id: string): Capability | undefined => manifest().find((c) => c.id === id);

/** Capabilities at or below a risk ceiling. Phase 1 runs at R0. */
export const upTo = (max: Risk): Capability[] => {
  const order: Risk[] = ['R0', 'R1', 'R2', 'R3', 'R4'];
  const ceiling = order.indexOf(max);
  return manifest().filter((c) => order.indexOf(c.risk) <= ceiling);
};

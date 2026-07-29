import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

export type Route = {
  file: string;        // controller file, relative to src/
  prefix: string;      // @Controller('...') value
  method: string;      // GET | POST | PATCH | DELETE | PUT
  path: string;        // route path as written ('' for a bare @Get())
  id: string;          // "prefix METHOD path" — stable identity used by the guards
  isPublic: boolean;   // carries @Public()
  takesRouteParam: boolean; // handler declares an @Param(...) the caller controls
  takesCurrentUser: boolean; // handler receives @CurrentUser()
  signature: string;   // the handler's parameter list, for failure messages
};

const SRC_ROOT = join(__dirname, '..');
const ROUTE_DECORATOR = /^\s*@(Get|Post|Patch|Delete|Put)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/;
const DECORATOR_LINE = /^\s*@[A-Za-z]/;

/** Every *.controller.ts under src/, recursively. */
export function controllerFiles(dir: string = SRC_ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...controllerFiles(full));
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out.sort();
}

/**
 * Parse a controller into its routes.
 *
 * Deliberately a source-level parse rather than booting Nest: the invariants
 * below are about what is WRITTEN in the file (is this route opted out of auth,
 * does this handler know who is asking), and a source parse fails loudly when a
 * new controller is added without the corresponding decision being made.
 */
export function parseController(file: string): Route[] {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const rel = file.slice(SRC_ROOT.length + 1);

  const prefixMatch = text.match(/@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/);
  const prefix = (prefixMatch?.[1] ?? prefixMatch?.[2] ?? '').trim();

  const routes: Route[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ROUTE_DECORATOR);
    if (!m) continue;

    const method = m[1].toUpperCase();
    const path = (m[2] ?? m[3] ?? '').trim();

    // Walk backwards over this handler's contiguous decorator block to find @Public().
    let isPublic = false;
    for (let j = i - 1; j >= 0; j--) {
      const line = lines[j].trim();
      if (line === '' || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
      if (DECORATOR_LINE.test(lines[j])) {
        if (line.startsWith('@Public()')) { isPublic = true; break; }
        continue;
      }
      break; // hit code — the decorator block is done
    }

    // Walk forwards to collect the handler signature: everything from the first
    // line after the decorator block up to the opening brace of the body.
    let sig = '';
    for (let j = i + 1; j < lines.length && j < i + 25; j++) {
      if (ROUTE_DECORATOR.test(lines[j])) break;
      if (DECORATOR_LINE.test(lines[j]) && !sig) continue; // more decorators before the signature
      sig += lines[j];
      if (lines[j].includes('{')) break;
    }

    routes.push({
      file: rel,
      prefix,
      method,
      path,
      id: `${prefix} ${method} ${path}`.trim(),
      isPublic,
      takesRouteParam: /@Param\(/.test(sig),
      takesCurrentUser: /@CurrentUser\(/.test(sig),
      signature: sig.trim().replace(/\s+/g, ' ').slice(0, 200),
    });
  }

  return routes;
}

/** The whole API surface. */
export function allRoutes(): Route[] {
  return controllerFiles().flatMap(parseController);
}

import { router } from '@/app/router';
import { NAV, HUBS } from '@/config/hubs';

/**
 * EVERY PAGE THIS APP DECLARES, AND WHICH ONES YOU CAN GET TO BY CLICKING.
 *
 * The problem this solves: a screen gets built, the route gets added, and the
 * link into it does not — so the page exists, works, and is invisible. There is
 * no list of those anywhere, and the only way to find one has been to read
 * router.tsx.
 *
 * ── IT ASKS THE ROUTER, IT DOES NOT KEEP A COPY ──
 *
 * A hand-written list of unfinished screens is a list that is wrong within a
 * week — it goes stale in the one direction that matters, because the whole
 * point is to catch the page somebody forgot to mention. So the paths come from
 * `router.routes` at runtime, which cannot disagree with the router.
 *
 * ── AND IT ONLY CLAIMS WHAT IT CAN PROVE ──
 *
 * "Not linked from anywhere" is not something this can know: a link may sit in
 * the body of any of three hundred components. What it CAN prove is whether a
 * path is in the app's own navigation — the header tabs (NAV) and the hub
 * sidebars (HUBS[*].items) — because those are declared data. So that is
 * exactly what it says, and the wording on the page says it that way. A page
 * that claimed "unreachable" would be asserting an absence it never
 * established, which is the one thing no screen here is allowed to do.
 */
export interface RouteRow {
  path: string;
  /** True when the header tabs or a hub sidebar point at it. */
  inNavigation: boolean;
  /** True when the path takes a parameter, so it cannot be opened blind. */
  parameterised: boolean;
  /** The first segment, for grouping. */
  group: string;
}

/** Every path the app's own navigation points at. */
function navigablePaths(): Set<string> {
  const out = new Set<string>();
  for (const n of NAV) out.add(n.path);
  for (const hub of Object.values(HUBS)) {
    out.add(hub.backPath);
    for (const item of hub.items) out.add(item.path);
  }
  return out;
}

interface RouteLike { path?: string; children?: RouteLike[] }

/** Walk the router's own tree. Paths are absolute in this router, so nothing
 *  has to be joined — and if that ever changes, the page shows the raw value
 *  rather than a guess at what it concatenates to. */
function collect(routes: RouteLike[], out: string[] = []): string[] {
  for (const r of routes) {
    if (typeof r.path === 'string' && r.path) out.push(r.path);
    if (r.children?.length) collect(r.children, out);
  }
  return out;
}

export function routeIndex(): RouteRow[] {
  const nav = navigablePaths();
  const seen = new Set<string>();
  const rows: RouteRow[] = [];
  for (const path of collect(router.routes as RouteLike[])) {
    if (seen.has(path)) continue;
    seen.add(path);
    rows.push({
      path,
      inNavigation: nav.has(path),
      parameterised: path.includes(':') || path.includes('*'),
      group: path.split('/')[1] || '/',
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

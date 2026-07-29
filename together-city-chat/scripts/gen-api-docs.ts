/**
 * Generate docs/api.md from the source itself.
 *
 * A hand-written endpoint list for 350 routes is stale the week it is written.
 * This reads the same route inventory the security guards use, so the document
 * can only ever describe routes that actually exist.
 *
 *   npx ts-node scripts/gen-api-docs.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { allRoutes, type Route } from '../src/security/route-inventory';

const routes = allRoutes();

const byPrefix = new Map<string, Route[]>();
for (const r of routes) {
  const key = r.prefix || '(root)';
  if (!byPrefix.has(key)) byPrefix.set(key, []);
  byPrefix.get(key)!.push(r);
}

const publicCount = routes.filter((r) => r.isPublic).length;
const lines: string[] = [];

lines.push('# API surface');
lines.push('');
lines.push('**Generated — do not edit by hand.** Run `npx ts-node scripts/gen-api-docs.ts` after adding or');
lines.push('removing a route. It is produced from the same parse the security guards in');
lines.push('`src/security/` use, so it cannot describe a route that does not exist.');
lines.push('');
lines.push(`Every path below is prefixed with \`/api\`. **${routes.length} routes** across`);
lines.push(`**${byPrefix.size} controllers**; **${publicCount}** are reachable without a token.`);
lines.push('');
lines.push('## Conventions');
lines.push('');
lines.push('Authentication is the default. A route is reachable without a bearer token only when it is');
lines.push('explicitly marked `@Public()`, which means a new controller is protected by omission rather');
lines.push('than exposed by omission. Those routes are marked **public** below and are asserted against a');
lines.push('frozen allowlist in `route-exposure.spec.ts` — adding one fails the suite until it is reviewed.');
lines.push('');
lines.push('`🔒` marks a handler that receives the authenticated citizen. A route taking a resource id');
lines.push('without it would be unable to check ownership; the eight exceptions are shared catalogue reads');
lines.push('(film metadata, lookups, a recipe, a travel package) and are frozen by name in the same spec.');
lines.push('');

for (const [prefix, rs] of [...byPrefix.entries()].sort()) {
  lines.push(`## /${prefix === '(root)' ? '' : prefix}`);
  lines.push('');
  lines.push(`_${rs[0].file}_`);
  lines.push('');
  lines.push('| Method | Path | Auth |');
  lines.push('|---|---|---|');
  for (const r of rs.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method))) {
    const path = `/api/${[prefix === '(root)' ? '' : prefix, r.path].filter(Boolean).join('/')}`;
    const auth = r.isPublic ? '**public**' : r.takesCurrentUser ? '🔒' : 'token';
    lines.push(`| ${r.method} | \`${path}\` | ${auth} |`);
  }
  lines.push('');
}

lines.push('## Errors');
lines.push('');
lines.push('| Status | Means |');
lines.push('|---|---|');
lines.push('| 401 | No token, an expired one, or a deleted account. |');
lines.push('| 403 | Authenticated but not permitted — a hub you have no grant for, a chat you are not in. |');
lines.push('| 404 | Missing, **or** belonging to somebody else. Deliberately indistinguishable, so ids cannot be probed. |');
lines.push('| 409 | A conflicting state — a duplicate signup, a second booking of the same seat. |');
lines.push('| 422 | Validation. Zod rejects the body before a handler sees it. |');
lines.push('| 429 | Rate limited (120 requests a minute by default). |');
lines.push('');
lines.push('The 404-for-someone-else\'s-resource rule is the one worth knowing: dating conversations, family');
lines.push('resources, thoughts and prescriptions all answer 404 rather than 403 when they belong to another');
lines.push('citizen, so a stranger cannot learn that an id exists.');
lines.push('');

writeFileSync(join(__dirname, '..', 'docs', 'api.md'), lines.join('\n'));
console.log(`docs/api.md — ${routes.length} routes across ${byPrefix.size} controllers`);

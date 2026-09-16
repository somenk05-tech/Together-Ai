import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { originPolicy } from '../shared/cors-policy';

/**
 * WHAT STANDS IN FOR A TOKEN ON THE VISIT BEACON (owner, 16 Sep).
 *
 * The beacon has to be public — most people who open the city have no
 * account — and this API's rule is that a public mutation names what guards
 * it instead. This is that: the request must come FROM THE CITY'S OWN PAGES,
 * i.e. carry an Origin header the site's CORS policy accepts (the same
 * cors-policy.ts main.ts and the socket read). Unlike CORS itself, an ABSENT
 * Origin is refused here, so a page on another site cannot run up the count
 * and neither can a bare `curl` that did not bother to forge one.
 *
 * WHAT IT IS NOT: a script can forge an Origin header. The per-address
 * throttle on the route is what bounds that, and a visit counter that anyone
 * determined can inflate is the honest description of every public counter.
 * All it can write is one row keyed by a random id — nothing a citizen owns.
 *
 * Refused requests are not errors a visitor sees: the beacon is fire-and-
 * forget and nothing waits on its answer.
 */
const prod = (process.env.NODE_ENV ?? 'development') === 'production';
const policy = originPolicy(process.env.CORS_ORIGIN ?? (prod ? '' : '*'), prod);

@Injectable()
export class VisitOriginGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const origin = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>().headers.origin;
    return typeof origin === 'string' && origin.length > 0 && policy.allows(origin);
  }
}

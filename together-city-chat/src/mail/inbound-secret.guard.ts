import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { timingSafeEqualStr } from './mail-inbound';

/**
 * THE ONE PUBLIC MUTATION IN THIS API, AND WHAT GUARDS IT INSTEAD.
 *
 * Every other route is authenticated by the global JwtAuthGuard. An inbound mail
 * webhook cannot be: Resend has no user session and cannot mint a token. So this
 * route carries @Public() — and @Public() alone would leave an endpoint that
 * writes into a named citizen's mailbox open to anyone who can POST.
 *
 * WHY A GUARD RATHER THAN A CHECK INSIDE THE SERVICE. The check was originally
 * the first few lines of MailService.ingestInbound, which works and is invisible
 * where it matters: route-inventory.ts reads controllers to answer "what is
 * reachable without a token", and a secret buried in a service is not something
 * that inventory — or a reviewer skimming the controller — can see. As a guard
 * it sits on the handler, next to @Public(), and route-exposure.spec.ts can
 * assert that this route is public BUT GUARDED rather than simply exempt.
 *
 * AN UNSET SECRET REFUSES EVERYWHERE. The version this replaces refused only
 * when NODE_ENV was 'production' and accepted anything otherwise — which is an
 * open mail-injection endpoint on every preview and staging deploy, all of them
 * on public URLs. Local testing is now an explicit opt-in that cannot be true in
 * production, rather than the default everywhere production isn't.
 */
@Injectable()
export class InboundSecretGuard implements CanActivate {
  private readonly logger = new Logger('MailInbound');

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      query?: Record<string, unknown>;
      headers?: Record<string, unknown>;
    }>();

    const expected = (process.env.RESEND_INBOUND_SECRET ?? '').trim();
    if (!expected) {
      if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNSIGNED_INBOUND === 'true') {
        this.logger.warn('inbound mail accepted UNSIGNED — ALLOW_UNSIGNED_INBOUND is set. Never do this in production.');
        return true;
      }
      this.logger.error('inbound mail refused: RESEND_INBOUND_SECRET is not set');
      throw new ForbiddenException('inbound mail is not configured');
    }

    // Resend can send the secret either way: on the webhook URL as `?secret=…`
    // (simplest to configure) or as `Authorization: Bearer …` (keeps it out of
    // access logs, and is the one to prefer).
    const fromQuery = typeof req.query?.secret === 'string' ? req.query.secret : undefined;
    const auth = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
    const fromBearer = /^bearer /i.test(auth) ? auth.slice(7).trim() : undefined;
    const presented = fromQuery ?? fromBearer;

    if (!presented || !timingSafeEqualStr(presented, expected)) {
      throw new ForbiddenException('invalid inbound secret');
    }
    return true;
  }
}

import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protects REST routes. Requires a valid access token in the Authorization
 * header. On rejection it logs the EXACT reason (missing header, malformed
 * bearer, expired token, invalid signature, no user) so 401 storms are
 * diagnosable from the server logs instead of guesswork.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger('JwtAuthGuard');

  handleRequest<TUser = unknown>(err: unknown, user: TUser, info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      const req = context.switchToHttp().getRequest<{ method?: string; url?: string; headers?: Record<string, string> }>();
      const authHeader = req.headers?.authorization ?? '';
      const hasBearer = /^Bearer\s+\S+/i.test(authHeader);
      const info2 = info as { name?: string; message?: string } | undefined;
      const errObj = err as { message?: string } | undefined;
      const reason = !authHeader
        ? 'missing Authorization header'
        : !hasBearer
          ? 'malformed bearer token'
          : info2?.name === 'TokenExpiredError'
            ? 'expired token'
            : info2?.name === 'JsonWebTokenError'
              ? `invalid token (${info2?.message ?? 'bad signature'})`
              : info2?.message || errObj?.message || 'no user';
      this.logger.warn(`AUTH 401 ${req.method ?? '?'} ${req.url ?? '?'} — ${reason}`);
      throw (err as Error) || new UnauthorizedException(reason);
    }
    return user;
  }
}

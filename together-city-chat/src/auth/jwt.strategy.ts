import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../shared/types';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Was this token minted after sessions were revoked?
 *
 * BOTH SIDES ARE TRUNCATED TO THE SECOND, which is the whole of the care here.
 * `iat` is seconds; the cutoff is a millisecond timestamp. Comparing them raw
 * means a token issued at 12:00:00.000 looks OLDER than a revocation at
 * 12:00:00.750 and a freshly-signed token is refused on sight. Flooring the
 * cutoff makes the comparison "was this issued in an earlier second", which is
 * the question, and leaves a sub-second grace that no attacker can aim at.
 *
 * A MISSING `iat` FAILS CLOSED, and only for accounts that have actually
 * revoked. We sign every token ourselves and jsonwebtoken always stamps `iat`,
 * so absent means something unaccounted-for is presenting a token to an account
 * that has asked to be signed out of everything. The cost of being wrong is one
 * sign-in; the cost the other way is the hole this exists to close.
 */
function issuedAfter(iat: number | undefined, revokedAt: Date): boolean {
  if (iat === undefined) return false;
  return iat >= Math.floor(revokedAt.getTime() / 1000);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    const secret = config.get<string>('jwt.accessSecret') ?? 'dev-access';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      // Tolerate small clock drift so a freshly-issued token is never rejected
      // as "expired" because the container clock is a few seconds ahead.
      jsonWebTokenOptions: { clockTolerance: 30 },
    });
    // Boot marker: confirms the verification secret in use (length + whether it's
    // still the insecure default) without ever leaking the secret itself.
    new Logger('JwtStrategy').log(`verify secret len=${secret.length} default=${secret === 'dev-access'}`);
  }

  /**
   * Whatever this returns is attached to req.user.
   *
   * The account is re-read on every request rather than trusted from the token
   * payload. A signed token stays cryptographically valid until it expires, so
   * without this a citizen who deleted their account — or whose sessions were
   * revoked after a password reset — kept full access for up to fifteen more
   * minutes. One primary-key lookup closes that window to zero.
   *
   * Reading the handle from the row rather than the payload also means a handle
   * change takes effect immediately, which matters because admin authorisation
   * is currently a handle test.
   */
  async validate(payload: JwtUser & { iat?: number }): Promise<JwtUser> {
    if (!payload?.sub) throw new UnauthorizedException('malformed token');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, handle: true, deletedAt: true, sessionsRevokedAt: true },
    });
    if (!user) throw new UnauthorizedException('account no longer exists');
    if (user.deletedAt) throw new UnauthorizedException('account deleted');
    if (user.sessionsRevokedAt && !issuedAfter(payload.iat, user.sessionsRevokedAt)) {
      // "Signed out of all sessions" now includes this one. Revoking marked the
      // refresh tokens; without this line the access token in a thief's hand went
      // on working for the rest of its fifteen minutes.
      throw new UnauthorizedException('session revoked — please sign in again');
    }
    return { sub: user.id, handle: user.handle };
  }
}

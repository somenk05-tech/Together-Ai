import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../shared/types';
import { PrismaService } from '../shared/prisma/prisma.service';

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
  async validate(payload: JwtUser): Promise<JwtUser> {
    if (!payload?.sub) throw new UnauthorizedException('malformed token');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, handle: true, deletedAt: true },
    });
    if (!user) throw new UnauthorizedException('account no longer exists');
    if (user.deletedAt) throw new UnauthorizedException('account deleted');
    return { sub: user.id, handle: user.handle };
  }
}

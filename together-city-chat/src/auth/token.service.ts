import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { JwtUser } from '../shared/types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Issues/rotates JWT access + refresh tokens. Refresh tokens are stored hashed. */
@Injectable()
export class TokenService {
  private readonly logger = new Logger('TokenService');
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Boot marker: the effective token lifetimes + signing-secret state. Reveals
    // a misconfigured TTL (e.g. JWT_ACCESS_TTL="15m" → 15 seconds) at a glance.
    const sec = this.config.get<string>('jwt.accessSecret') ?? 'dev-access';
    this.logger.log(`accessTtl=${this.accessTtl()}s refreshTtl=${this.config.get<number>('jwt.refreshTtl') ?? 1209600}s signSecret len=${sec.length} default=${sec === 'dev-access'}`);
  }

  /** Access-token lifetime in seconds, floored so a misparsed env value (e.g.
   *  "15m" → 15) can never issue near-instantly-expiring tokens. */
  private accessTtl(): number {
    const raw = this.config.get<number>('jwt.accessTtl') ?? 900;
    return Number.isFinite(raw) && raw >= 300 ? raw : 900;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issuePair(user: JwtUser): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(user, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.accessTtl(),
    });
    const refreshToken = await this.jwt.signAsync(user, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<number>('jwt.refreshTtl'),
    });
    const ttl = this.config.get<number>('jwt.refreshTtl') ?? 1209600;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.sub,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  /** Verifies + rotates a refresh token (single-use). */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const payload = await this.jwt.verifyAsync<JwtUser>(refreshToken, {
      secret: this.config.get<string>('jwt.refreshSecret'),
    });
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
    });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new Error('Invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });
    return this.issuePair({ sub: payload.sub, handle: payload.handle });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
  }

  verifyAccess(token: string): Promise<JwtUser> {
    return this.jwt.verifyAsync<JwtUser>(token, {
      secret: this.config.get<string>('jwt.accessSecret'),
    });
  }
}

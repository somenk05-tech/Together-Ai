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

/** Metadata captured per session, for the "active devices" list. */
export interface SessionMeta {
  device?: string; // user-agent
  ip?: string;
}

export interface SessionInfo {
  id: string;
  device: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  current: boolean;
}

/**
 * Issues/rotates JWT access + refresh tokens. Refresh tokens are stored hashed,
 * one row per device session. A silent refresh rotates the token in place (same
 * session id + createdAt), so the "active sessions" list stays stable and each
 * device can be revoked individually.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger('TokenService');
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const sec = this.config.get<string>('jwt.accessSecret') ?? 'dev-access';
    this.logger.log(`accessTtl=${this.accessTtl()}s refreshTtl=${this.refreshTtl()}s signSecret len=${sec.length} default=${sec === 'dev-access'}`);
  }

  private accessTtl(): number {
    const raw = this.config.get<number>('jwt.accessTtl') ?? 900;
    return Number.isFinite(raw) && raw >= 300 ? raw : 900;
  }

  private refreshTtl(): number {
    const raw = this.config.get<number>('jwt.refreshTtl') ?? 5184000;
    return Number.isFinite(raw) && raw >= 3600 ? raw : 5184000;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Tokens rotated away in the last minute, keyed by their old hash. Rotation
   * is single-use, but two HONEST holders of one token exist all the time — a
   * second browser tab, a retry after a lost response, the client's hydrate
   * racing its 401 interceptor. Rejecting the second caller signed citizens
   * out of live sessions mid-use ("the app forgot who I am"). Inside this
   * window a replay is answered with the SAME pair the winner got; outside it
   * — or after any revocation — the old token is dead, exactly as before.
   * In-memory by design: a restart merely closes the window early.
   */
  private readonly recentlyRotated = new Map<string, { pair: TokenPair; until: number }>();
  private static readonly ROTATION_GRACE_MS = 60_000;

  private pruneGrace(now: number): void {
    for (const [k, v] of this.recentlyRotated) if (v.until <= now) this.recentlyRotated.delete(k);
  }

  private async signPair(user: JwtUser): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(user, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.accessTtl(),
    });
    const refreshToken = await this.jwt.signAsync(user, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.refreshTtl(),
    });
    return { accessToken, refreshToken };
  }

  /** New login/registration → a fresh session row. */
  async issuePair(user: JwtUser, meta: SessionMeta = {}): Promise<TokenPair> {
    const pair = await this.signPair(user);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.sub,
        tokenHash: this.hash(pair.refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
        device: meta.device ?? null,
        ip: meta.ip ?? null,
      },
    });
    return pair;
  }

  /**
   * Verify + rotate a refresh token, single-use, IN PLACE — the session row keeps
   * its id/createdAt/device and gets a new hash + extended expiry + lastUsedAt.
   */
  async rotate(refreshToken: string, meta: SessionMeta = {}): Promise<TokenPair> {
    const payload = await this.jwt.verifyAsync<JwtUser>(refreshToken, {
      secret: this.config.get<string>('jwt.refreshSecret'),
    });
    const oldHash = this.hash(refreshToken);
    const now = Date.now();
    this.pruneGrace(now);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: oldHash } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      const grace = this.recentlyRotated.get(oldHash);
      if (grace && grace.until > now) return grace.pair; // honest replay — same answer as the winner
      throw new Error('Invalid refresh token');
    }
    const pair = await this.signPair({ sub: payload.sub, handle: payload.handle });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        tokenHash: this.hash(pair.refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
        lastUsedAt: new Date(),
        ...(meta.ip ? { ip: meta.ip } : {}),
        ...(meta.device ? { device: meta.device } : {}),
      },
    });
    this.recentlyRotated.set(oldHash, { pair, until: now + TokenService.ROTATION_GRACE_MS });
    return pair;
  }

  /** Revoke a single session by its refresh token (log out this device). */
  async revokeOne(refreshToken: string): Promise<void> {
    this.recentlyRotated.clear();
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: this.hash(refreshToken) }, data: { revoked: true } });
  }

  /** Revoke a session by id, scoped to its owner (log out a chosen device). */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    this.recentlyRotated.clear();
    await this.prisma.refreshToken.updateMany({ where: { id: sessionId, userId }, data: { revoked: true } });
  }

  /** Revoke every session for a user (log out of all devices / password change). */
  async revokeAll(userId: string): Promise<void> {
    this.recentlyRotated.clear();
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
  }

  /** Revoke every OTHER session, keeping the caller's current one. */
  async revokeOthers(userId: string, currentRefreshToken?: string): Promise<void> {
    this.recentlyRotated.clear();
    const currentHash = currentRefreshToken ? this.hash(currentRefreshToken) : '__none__';
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false, NOT: { tokenHash: currentHash } },
      data: { revoked: true },
    });
  }

  /** Active sessions for the "signed-in devices" screen. */
  async listSessions(userId: string, currentRefreshToken?: string): Promise<SessionInfo[]> {
    // unbounded: the signed-in devices screen must show EVERY live session — hiding one hides an intruder
    const rows = (await this.prisma.refreshToken.findMany({
      where: { userId, revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, device: true, ip: true, createdAt: true, lastUsedAt: true, tokenHash: true },
    })) as unknown as Array<{ id: string; device: string | null; ip: string | null; createdAt: Date; lastUsedAt: Date; tokenHash: string }>;
    const currentHash = currentRefreshToken ? this.hash(currentRefreshToken) : null;
    return rows.map((r) => ({
      id: r.id, device: r.device, ip: r.ip, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt,
      current: currentHash != null && r.tokenHash === currentHash,
    }));
  }

  verifyAccess(token: string): Promise<JwtUser> {
    return this.jwt.verifyAsync<JwtUser>(token, {
      secret: this.config.get<string>('jwt.accessSecret'),
    });
  }
}

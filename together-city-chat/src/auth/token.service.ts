import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
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

  /**
   * A SESSION DOES NOT SLIDE FOREVER (launch gate, third reading, 5 Sep). Every
   * silent refresh extended the row by a full refreshTtl, so a session that was
   * used once a month lived until the device was lost — and a stolen refresh
   * token that was used once a month lived exactly as long. The row's createdAt
   * is the anchor: past REFRESH_ABSOLUTE_TTL (default 90 days) the rotation is
   * refused and the citizen signs in again. Not configurable below one day.
   */
  private absoluteTtl(): number {
    const raw = this.config.get<number>('jwt.refreshAbsoluteTtl') ?? TokenService.ABSOLUTE_TTL_DEFAULT;
    return Number.isFinite(raw) && raw >= 86_400 ? raw : TokenService.ABSOLUTE_TTL_DEFAULT;
  }
  private static readonly ABSOLUTE_TTL_DEFAULT = 90 * 86_400;

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

  /**
   * The refresh token carries `sid`, the session row it belongs to. The access
   * token does not: nothing downstream should key on a session, and a shorter
   * claim set is a shorter token on every request.
   */
  private async signPair(user: JwtUser, sid: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(user, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.accessTtl(),
    });
    const refreshToken = await this.jwt.signAsync({ ...user, sid }, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.refreshTtl(),
    });
    return { accessToken, refreshToken };
  }

  /** New login/registration → a fresh session row. */
  async issuePair(user: JwtUser, meta: SessionMeta = {}): Promise<TokenPair> {
    const id = randomUUID();
    const pair = await this.signPair(user, id);
    await this.prisma.refreshToken.create({
      data: {
        id,
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
   *
   * A STALE TOKEN IS A SIGNAL, NOT JUST A REFUSAL (5 Sep). A refresh token
   * that verifies, names a session, and matches no row was rotated away — and
   * is now being presented again outside the honest-replay window. One of the
   * two holders is not the citizen. The only safe answer is to close that
   * session for both of them: the honest device signs in again, the other
   * one has nothing. Before this, the reply was 'Invalid refresh token' and
   * the session the thief had already advanced stayed live.
   */
  async rotate(refreshToken: string, meta: SessionMeta = {}): Promise<TokenPair> {
    const payload = await this.jwt.verifyAsync<JwtUser & { sid?: string }>(refreshToken, {
      secret: this.config.get<string>('jwt.refreshSecret'),
    });
    const oldHash = this.hash(refreshToken);
    const now = Date.now();
    this.pruneGrace(now);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: oldHash } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      const grace = this.recentlyRotated.get(oldHash);
      if (grace && grace.until > now) return grace.pair; // honest replay — same answer as the winner
      if (!stored && payload.sid) {
        // rotated away and replayed late: reuse. The whole session goes.
        this.logger.warn(`refresh reuse detected user=${payload.sub} session=${payload.sid} — session revoked`);
        await this.prisma.refreshToken.updateMany({ where: { id: payload.sid, userId: payload.sub }, data: { revoked: true } });
        this.recentlyRotated.clear();
      }
      throw new Error('Invalid refresh token');
    }
    const born = (stored as { createdAt?: Date }).createdAt;
    if (born && born.getTime() + this.absoluteTtl() * 1000 < now) {
      await this.prisma.refreshToken.updateMany({ where: { id: stored.id, userId: stored.userId }, data: { revoked: true } });
      throw new Error('Invalid refresh token');
    }
    const pair = await this.signPair({ sub: payload.sub, handle: payload.handle }, stored.id);
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

  /**
   * Revoke every session for a user (log out of all devices / password change).
   *
   * THE REFRESH TOKENS WERE ONLY HALF OF IT. Marking them revoked stops the next
   * silent refresh, and does nothing at all to an ACCESS token already issued:
   * those are signed, stateless, and valid for their full fifteen minutes with
   * no database anywhere in the path. So after a password reset the email said
   * "you've been signed out of all sessions" and whoever held a stolen access
   * token kept full read/write on the account — Medical vault included — for up
   * to another quarter of an hour.
   *
   * `sessionsRevokedAt` is the cutoff JwtStrategy checks on every request. It is
   * stamped in the same transaction as the revocation because a half-applied
   * sign-out is the failure this is fixing: two facts about one account that
   * disagree.
   *
   * updateMany rather than update — account deletion calls this, and a row that
   * has gone must not turn a sign-out into a thrown exception.
   *
   * AND THE PUSH SUBSCRIPTIONS GO WITH THEM (3 Sep). Push is keyed on the
   * browser's push endpoint, not on any session, and nothing on the send path
   * re-checks: so a stolen laptop whose owner had changed their password and
   * pressed "sign out everywhere" was refused every request AND went on
   * receiving message previews with sender names, dating pushes, invoice
   * amounts and moderation verdicts, indefinitely — while the confirmation
   * email said they had been signed out of all sessions. The only revoke that
   * existed ran client-side, in the browser that pressed the button.
   *
   * Account deletion has the same path: it calls this on an already-scrubbed
   * row, so `DeviceToken`'s `onDelete: Cascade` never fires.
   *
   * In the same transaction as the rest, for the reason the paragraph above
   * gives: two facts about one account that disagree is the failure being
   * fixed, and "signed out but still buzzing" is that failure with a phone.
   */
  async revokeAll(userId: string): Promise<void> {
    this.recentlyRotated.clear();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } }),
      this.prisma.user.updateMany({ where: { id: userId }, data: { sessionsRevokedAt: new Date() } }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
    ]);
  }

  /**
   * Revoke every OTHER session, keeping the caller's current one.
   *
   * EVERY device token goes, the caller's included, because there is nothing to
   * tell them apart: a `DeviceToken` row records a push endpoint and a
   * platform, and no column ties it to the session that registered it. Keeping
   * the ones that MIGHT be the caller's means keeping the intruder's, which is
   * the whole reason the button was pressed. The caller's own browser makes a
   * new subscription on its next load (see `useWebPush`), so the cost is one
   * reload; the alternative is a signed-out device that still reads previews.
   */
  async revokeOthers(userId: string, currentRefreshToken?: string): Promise<void> {
    this.recentlyRotated.clear();
    const currentHash = currentRefreshToken ? this.hash(currentRefreshToken) : '__none__';
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false, NOT: { tokenHash: currentHash } },
        data: { revoked: true },
      }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
    ]);
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

  /**
   * A signature check AND the account check, together — for the paths that
   * are not HTTP requests and so never pass through JwtStrategy.validate.
   *
   * THE HOLE THIS CLOSES. The chat gateway authenticated a socket with
   * `verifyAccess` alone. A signed token stays valid until it expires, so a
   * suspended citizen, a deleted one, or a thief holding a token after "sign
   * out everywhere" kept a LIVE SOCKET — reading and sending messages — for the
   * rest of the access token's life, and a connection made inside that window
   * was never re-checked afterwards. This is the exact hole JwtStrategy closed
   * for HTTP on every request; the socket had been left on the old rule.
   *
   * Same three refusals as the strategy, same order, same wording.
   */
  async verifyAccessAndAccount(token: string): Promise<JwtUser & { iat?: number }> {
    const payload = await this.verifyAccess(token) as JwtUser & { iat?: number };
    await this.assertAccountLive(payload);
    return payload;
  }

  /** The account half on its own, for re-checking a connection already open. */
  async assertAccountLive(payload: { sub: string; iat?: number }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, deletedAt: true, suspendedAt: true, sessionsRevokedAt: true },
    });
    if (!user) throw new Error('account no longer exists');
    if (user.deletedAt) throw new Error('account deleted');
    if (user.suspendedAt) throw new Error('account suspended');
    // Same rule as JwtStrategy.issuedAfter: a token with no iat cannot prove it
    // post-dates the revocation, so it is treated as revoked.
    if (user.sessionsRevokedAt) {
      const ok = payload.iat !== undefined && payload.iat >= Math.floor(user.sessionsRevokedAt.getTime() / 1000);
      if (!ok) throw new Error('session revoked — please sign in again');
    }
  }
}

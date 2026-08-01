import { swallow } from '../shared/swallow';
import { isDisposableEmail } from './disposable-domains';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ForgotDto, LoginDto, RegisterDto, ResetDto } from './dto/auth.dto';
import { TokenService, TokenPair, SessionMeta } from './token.service';
import { assertStrongPassword } from './password-policy';
import { isCityAddress } from '../mail/mail.constants';
import { isReservedAdminHandle } from './admin';

/** Wrong guesses allowed against one recovery code before it is burned. */
const MAX_RESET_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

  /** Every new account is fully initialised on sign-up — no lazy gaps. Seeds the
   *  default hub profiles (nutrition, beauty, fitness) so the account is complete
   *  the moment it's created; other hubs read from these + self-seed on demand. */
  private async initializeAccount(userId: string): Promise<void> {
    const p = this.prisma as unknown as Record<string, { create(a: unknown): Promise<unknown> }>;
    await Promise.all([
      swallow(p.foodPref?.create({ data: { userId } }), 'seed FoodPref at sign-up', { userId }), // Nutrition Hub
      swallow(p.beautyProfile?.create({ data: { userId } }), 'seed BeautyProfile at sign-up', { userId }), // Beauty Hub
      swallow(p.fitnessProfile?.create({ data: { userId } }), 'seed FitnessProfile at sign-up', { userId }), // Fitness Hub
    ]);
  }

  async register(dto: RegisterDto, meta: SessionMeta = {}): Promise<TokenPair & { userId: string }> {
    // Open registration — Together City is no longer invite-only.
    assertStrongPassword(dto.password);
    // Same generic message for a taken handle and a reserved moderator handle,
    // so registration doesn't reveal which names are privileged.
    if (isReservedAdminHandle(dto.handle)) throw new ConflictException('That handle is already taken.');
    const existing = await this.prisma.user.findUnique({ where: { handle: dto.handle.toLowerCase() } });
    if (existing) throw new ConflictException('That handle is already taken.');
    if (dto.email) {
      // M1: the availability check already refuses these; enforce at the write
      // too, because a form is not the only client an endpoint ever has.
      if (isDisposableEmail(dto.email)) {
        throw new ConflictException('Please use a real email address — temporary inboxes cannot recover an account.');
      }
      const emailTaken = await this.prisma.user.findFirst({ where: { email: dto.email.toLowerCase() } });
      if (emailTaken) throw new ConflictException('That email is already registered.');
    }
    const user = await this.prisma.user.create({
      data: {
        handle: dto.handle.toLowerCase(),
        name: dto.name.trim(),
        email: dto.email?.toLowerCase(),
        phone: dto.phone,
        profileImage: dto.profileImage,
        passwordHash: await argon2.hash(dto.password),
      },
    });
    await this.initializeAccount(user.id);            // fully-initialised account
    // No verification email is sent here any more. Sign-up now finishes on a
    // six-digit code screen (VerifyChannel), which asks for the code the person
    // is about to receive rather than mailing a link they have to go and find.
    // Firing both meant two emails for one action, and the link half was the
    // unsound one: it was filed in the citizen's in-app inbox, so a link
    // proving control of an external mailbox could be clicked by anyone
    // holding a session. Removed in 20260730160000_retire_verification_links.
    const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle }, meta);
    return { ...pair, userId: user.id };
  }

  /** Live handle availability + alternative suggestions (for the sign-up form). */
  async handleAvailable(raw: string): Promise<{ handle: string; valid: boolean; available: boolean; suggestions: string[] }> {
    const handle = (raw ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(handle)) return { handle, valid: false, available: false, suggestions: [] };
    // NOTE: on a failed read this still reports "available" — an absence the
    // form never established. Logged now; the honest API shape (available:
    // unknown) is a separate, client-visible change.
    const taken = await swallow(this.prisma.user.findUnique({ where: { handle } }), 'handle availability read', { handle });
    if (!taken) return { handle, valid: true, available: true, suggestions: [] };
    const base = handle.replace(/[._]+$/, '') || handle;
    const candidates = [`${base}_${randomInt(10, 99)}`, `${base}.city`, `${base}_official`, `the.${base}`, `${base}${randomInt(1, 9)}`, `${base}_${randomInt(100, 999)}`];
    const suggestions: string[] = [];
    for (const c of candidates) {
      if (suggestions.length >= 4) break;
      if (!/^[a-z0-9_.]{3,30}$/.test(c) || suggestions.includes(c)) continue;
      if (!(await swallow(this.prisma.user.findUnique({ where: { handle: c } }), 'handle suggestion read', { candidate: c }))) suggestions.push(c);
    }
    return { handle, valid: true, available: false, suggestions };
  }

  /** Live email availability + format check (for the sign-up form). */
  async emailAvailable(raw: string): Promise<{ email: string; valid: boolean; available: boolean }> {
    const email = (raw ?? '').trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
    if (!valid) return { email, valid: false, available: false };
    // M1: throwaway domains make accounts nobody answers for. Reported as
    // invalid HERE, at the availability check, so the form says so before
    // the citizen fills anything else in.
    if (isDisposableEmail(email)) return { email, valid: false, available: false };
    // Same caveat as handleAvailable. No meta: an email address is PII and
    // does not belong in the logs.
    const taken = await swallow(this.prisma.user.findFirst({ where: { email } }), 'email availability read');
    return { email, valid: true, available: !taken };
  }

  /**
   * Resolve a recovery identifier (primary email, phone, or handle / city
   * address) to a user. Forgot and reset MUST use the exact same resolution, or
   * a code requested one way can't be redeemed the other way (e.g. an SMS
   * recovery by phone number would strand the user at the reset step).
   */
  private async findByIdentifier(identifier: string) {
    const raw = identifier.trim();
    const id = raw.toLowerCase();
    if (id.includes('@') && !isCityAddress(id)) {
      return this.prisma.user.findFirst({ where: { email: id } });
    }
    if (/^[+0-9][0-9\s-]{5,}$/.test(id)) {
      return this.prisma.user.findFirst({ where: { phone: raw } });
    }
    return this.prisma.user.findUnique({ where: { handle: id.replace(/@togethercity\.tech$/, '') } });
  }

  /** Forgot password — send a recovery OTP to the citizen's primary email or phone (and their city inbox). */
  async forgot(dto: ForgotDto): Promise<{ sent: true; delivery: 'live' | 'unconfigured'; channel: 'email' | 'sms' }> {
    const channel = dto.channel === 'sms' ? 'sms' : 'email';
    // System-wide fact (same for every request) — so the client can warn when
    // external delivery isn't wired instead of the code silently going nowhere.
    const delivery = this.mail.deliveryConfigured(channel) ? 'live' : 'unconfigured';
    // `channel` is the channel that was REQUESTED, echoed back — never the one
    // actually used. Those differ when SMS is asked for and the account has no
    // phone, and reporting the real one would answer "does this account have a
    // phone number?" for any address a stranger cares to type. The whole
    // response is identical for a hit and a miss; this field must not be the
    // thing that breaks that.
    const user = await this.findByIdentifier(dto.identifier);
    // Always respond the same way — never leak whether an account exists.
    if (user) {
      // Fall back to email if SMS was asked for but there's no phone on file.
      const sendChannel = dto.channel === 'sms' && user.phone ? 'sms' : 'email';
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      // Requesting a new code invalidates every outstanding one, so a code read
      // over someone's shoulder or left in an old inbox stops working the moment
      // the citizen asks for another.
      await this.prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      // Stored hashed. This row used to hold the live code in plaintext, so
      // anyone who could read the table — a backup, a log, a stray query —
      // could take over any account that had ever asked for a reset.
      await this.prisma.passwordReset.create({
        data: { userId: user.id, code: await argon2.hash(code), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      });
      const body = sendChannel === 'sms'
        ? `Together City recovery code: ${code}. Expires in 30 minutes. Didn't request it? Ignore this message.`
        : [
            `We received a request to reset your Together City password.`,
            ``, `Your recovery code is: ${code}`, `It expires in 30 minutes.`, ``,
            `Enter it on the reset screen along with a new password. If you didn't request this, you can ignore this message — your password stays unchanged.`,
          ].join('\n');
      // deliverTo, NOT deliverSystem. deliverSystem files a copy of every
      // message in the citizen's own in-app Together City inbox — which put the
      // password-reset code somewhere any holder of a session could read it,
      // and a reset code readable from inside a session is an escalation from
      // "borrowed a logged-in laptop" to "owns the account and can lock you
      // out". Same defect as the verification link removed alongside this.
      //
      // The "password was changed" notice below stays on deliverSystem: that is
      // correspondence, not a secret, and belongs in the inbox.
      const target = sendChannel === 'sms' ? user.phone : user.email;
      if (target) {
        // If this fails, the citizen was told "sent" and no code is coming.
        // That was invisible; now it is a [swallowed] line with their id.
        await swallow(this.mail.deliverTo(user.id, sendChannel, target,
          { subject: '🔐 Your Together City recovery code', body }, 'recovery'),
          'recovery-code delivery', { userId: user.id, channel: sendChannel });
      }
    }
    return { sent: true, delivery, channel };
  }

  /** Reset password with the recovery code; emails a security confirmation. */
  async reset(dto: ResetDto): Promise<{ ok: true }> {
    // Enforce the SAME strength policy as registration — otherwise the reset
    // path is a backdoor to weak passwords the sign-up form would reject.
    assertStrongPassword(dto.newPassword);
    const user = await this.findByIdentifier(dto.identifier);
    if (!user) throw new UnauthorizedException('That code is invalid or has expired.');
    // The code is hashed, so it can't be looked up directly: take the newest
    // live code for this citizen and verify against it. Only one is ever live —
    // requesting a new one retires the rest.
    const reset = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    // One message for every failure mode — no code, wrong code, expired code,
    // burned code — so this never becomes an oracle for which accounts exist or
    // which of them have a reset in flight.
    const invalid = new UnauthorizedException('That code is invalid or has expired.');
    if (!reset) throw invalid;
    if (reset.attempts >= MAX_RESET_ATTEMPTS) {
      // Burn it rather than leave a half-guessed code alive for the full 30 min.
      await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      throw invalid;
    }
    if (!(await argon2.verify(reset.code, dto.code).catch(() => false))) {
      await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(dto.newPassword) } });
    await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    await this.tokens.revokeAll(user.id); // sign out everywhere after a reset
    await swallow(this.mail.deliverSystem(user.id, {
      subject: '✅ Your Together City password was changed',
      body: `Your password was just reset and you've been signed out of all sessions. If this wasn't you, reset your password again immediately.`,
    }, 'security'), 'password-changed notice', { userId: user.id });
    return { ok: true };
  }

  async login(dto: LoginDto, meta: SessionMeta = {}): Promise<TokenPair & { userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { handle: dto.handle } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // A deleted account can never be signed into again (same generic message,
    // so the endpoint doesn't reveal which handles once existed).
    if ((user as unknown as { deletedAt?: Date | null }).deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle }, meta);
    return { ...pair, userId: user.id };
  }

  /**
   * Delete the signed-in citizen's account.
   *
   * SOFT delete + anonymisation, deliberately:
   *  - Other citizens' conversations reference this user (Message.sender has no
   *    cascade), so a hard delete would corrupt their chat history.
   *  - Everything that is purely this user's own public presence is removed
   *    outright (posts + media cascade, follows, social graph), so nothing of
   *    theirs keeps appearing around the city.
   *  - Remaining references are anonymised: the row survives only as
   *    "Deleted citizen" with no personal data attached.
   *
   * Requires the account password (re-authentication for a destructive action).
   * All sessions/refresh tokens are revoked, so every device is signed out.
   */
  async deleteAccount(userId: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account not found.');
    if ((user as unknown as { deletedAt?: Date | null }).deletedAt) return { ok: true }; // already gone — idempotent
    if (!password || !(await argon2.verify(user.passwordHash, password).catch(() => false))) {
      throw new UnauthorizedException('That password is incorrect.');
    }

    // 1) Remove this citizen's own public presence. Post media/likes/comments
    //    cascade from Post; reposts of their posts cascade too.
    // A step that fails here leaves public presence live behind an account
    // that reports itself deleted — the log line is the only witness.
    await swallow(this.prisma.post.deleteMany({ where: { authorId: userId } }), 'deletion: posts', { userId });
    await swallow(this.prisma.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }] } }), 'deletion: follows', { userId });
    await swallow(this.prisma.connection.deleteMany({ where: { OR: [{ userOneId: userId }, { userTwoId: userId }] } }), 'deletion: connections', { userId });

    // 2) Anonymise the surviving row. The handle is released in a form that can
    //    never collide with a real one, and the password is replaced with an
    //    unusable value so the account cannot be signed into again.
    const tombstone = `deleted_${userId.replace(/-/g, '').slice(0, 12)}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        handle: tombstone,
        name: 'Deleted citizen',
        email: null,
        phone: null,
        profileImage: null,
        bio: null,
        city: null,
        website: null,
        emailVerified: false,
        emailVerifiedAt: null,
        onlineStatus: false,
        passwordHash: await argon2.hash(randomInt(1_000_000, 9_999_999).toString() + userId + Date.now()),
      },
    });

    // 3) Sign out everywhere — every refresh token/session is revoked.
    await swallow(this.tokens.revokeAll(userId), 'deletion: revoke all sessions', { userId });
    return { ok: true };
  }

  async refresh(refreshToken: string, meta: SessionMeta = {}): Promise<TokenPair> {
    try {
      return await this.tokens.rotate(refreshToken, meta);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /** Log out THIS device only (revoke the presented refresh token). */
  async logout(refreshToken?: string): Promise<{ ok: true }> {
    if (refreshToken) await this.tokens.revokeOne(refreshToken);
    return { ok: true };
  }

  /** Log out of every device (also used after a password change). */
  async logoutAll(userId: string): Promise<{ ok: true }> {
    await this.tokens.revokeAll(userId);
    return { ok: true };
  }

  /** Log out of all OTHER devices, keeping the current session. */
  async logoutOthers(userId: string, currentRefreshToken?: string): Promise<{ ok: true }> {
    await this.tokens.revokeOthers(userId, currentRefreshToken);
    return { ok: true };
  }

  listSessions(userId: string, currentRefreshToken?: string) {
    return this.tokens.listSessions(userId, currentRefreshToken);
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ ok: true }> {
    await this.tokens.revokeSession(userId, sessionId);
    return { ok: true };
  }
}

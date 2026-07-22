import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomInt, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { TokenService } from './token.service';

const GENERIC = "If an account matching your information exists, we've sent a verification code.";
const OTP_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;      // 15-minute lockout
const MAX_RESENDS = 3;

interface RecoveryRow {
  id: string; userId: string; otpHash: string; token: string; resetToken: string | null;
  channel: string; expiresAt: Date; attempts: number; resends: number;
  lockedUntil: Date | null; verifiedAt: Date | null; usedAt: Date | null;
}
interface RecoveryDelegate {
  create(a: unknown): Promise<RecoveryRow>;
  findFirst(a: unknown): Promise<RecoveryRow | null>;
  update(a: unknown): Promise<RecoveryRow>;
  updateMany(a: unknown): Promise<{ count: number }>;
}

/** Enforce the password policy server-side (never trust the client). */
/**
 * Common-password cores: composition rules already reject bare dictionary
 * words, but "Password@123"-style dress-ups pass them. Strip digits/symbols,
 * lowercase what's left, and reject the classic cores outright.
 */
const COMMON_CORES = new Set([
  'password', 'passwort', 'qwerty', 'qwertyuiop', 'welcome', 'admin', 'administrator',
  'letmein', 'iloveyou', 'monkey', 'dragon', 'sunshine', 'princess', 'football',
  'baseball', 'master', 'shadow', 'superman', 'batman', 'michael', 'computer',
  'internet', 'whatever', 'trustno', 'abcdef', 'abcdefgh', 'india', 'mumbai',
  'together', 'togethercity', 'togetherai',
]);

export function assertStrongPassword(pw: string): void {
  const need: string[] = [];
  if ((pw ?? '').length < 12) need.push('at least 12 characters');
  if (!/[A-Z]/.test(pw)) need.push('an uppercase letter');
  if (!/[a-z]/.test(pw)) need.push('a lowercase letter');
  if (!/[0-9]/.test(pw)) need.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) need.push('a special character');
  if (need.length) throw new BadRequestException(`Password needs ${need.join(', ')}.`);
  const core = (pw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (COMMON_CORES.has(core)) {
    throw new BadRequestException('That password is too common — pick something less guessable.');
  }
}

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger('Recovery');
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly tokens: TokenService,
  ) {}

  private get codes(): RecoveryDelegate {
    return (this.prisma as unknown as { recoveryCode: RecoveryDelegate }).recoveryCode;
  }

  private async findUser(identifierRaw: string) {
    const id = identifierRaw.trim().toLowerCase();
    if (id.includes('@') && !id.endsWith('@togethercity.tech')) return this.prisma.user.findFirst({ where: { email: id } });
    if (/^[+0-9][0-9\s-]{5,}$/.test(id)) return this.prisma.user.findFirst({ where: { phone: identifierRaw.trim() } });
    return this.prisma.user.findUnique({ where: { handle: id.replace(/@togethercity\.tech$/, '') } });
  }

  /** STEP 1–3: identify the user, generate + hash a 6-digit OTP, send it, and
   *  return an opaque recoveryToken. Response is IDENTICAL whether or not an
   *  account exists (anti-enumeration): a decoy token is returned for misses. */
  async request(identifierRaw: string, channelReq: 'email' | 'sms', ip?: string, device?: string) {
    const token = randomBytes(24).toString('hex');
    const user = await this.findUser(identifierRaw).catch(() => null);
    if (user) {
      const channel: 'email' | 'sms' = channelReq === 'sms' && user.phone ? 'sms' : 'email';
      const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const otpHash = await argon2.hash(otp);
      // Only one active code per user — retire any earlier unused ones.
      await this.codes.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }).catch(() => undefined);
      await this.codes.create({
        data: { userId: user.id, otpHash, token, channel, expiresAt: new Date(Date.now() + OTP_TTL_MS), ipAddress: ip ?? null, device: device?.slice(0, 300) ?? null } as never,
      });
      await this.deliver(user.id, otp, channel).catch(() => undefined);
      this.logger.log(`recovery requested user=${user.id} channel=${channel} ip=${ip ?? '?'}`);
    } else {
      this.logger.log(`recovery requested (no match) ip=${ip ?? '?'}`);
    }
    return { message: GENERIC, recoveryToken: token, channel: channelReq };
  }

  private async deliver(userId: string, otp: string, channel: 'email' | 'sms') {
    if (channel === 'sms') {
      return this.mail.deliverSystem(userId, { subject: 'Together City verification code', body: `Your Together City verification code is ${otp}. Expires in 10 minutes.` }, 'recovery', 'sms');
    }
    const body = [
      'Your verification code is', '', otp, '', 'This code expires in 10 minutes.', '',
      'If you did not request this, ignore this email — your password stays unchanged.',
    ].join('\n');
    return this.mail.deliverSystem(userId, { subject: 'Your Together City Recovery Code', body }, 'recovery', 'email');
  }

  private async load(where: Record<string, unknown>): Promise<RecoveryRow | null> {
    return this.codes.findFirst({ where }).catch(() => null);
  }

  /** STEP 4: verify the OTP. Enforces expiry, 5-attempt limit + 15-min lockout.
   *  On success issues a one-time resetToken. Errors are deliberately uniform. */
  async verify(recoveryToken: string, otp: string) {
    const row = await this.load({ token: recoveryToken });
    if (!row || row.usedAt) throw new BadRequestException('That code is invalid or has expired.');
    if (row.lockedUntil && row.lockedUntil > new Date()) throw new BadRequestException('Too many attempts — this code is locked. Try again in 15 minutes.');
    if (row.verifiedAt && row.resetToken) return { resetToken: row.resetToken }; // idempotent
    if (row.expiresAt < new Date()) throw new BadRequestException('This code has expired — request a new one.');

    const ok = await argon2.verify(row.otpHash, String(otp)).catch(() => false);
    if (!ok) {
      const attempts = row.attempts + 1;
      const locked = attempts >= MAX_ATTEMPTS;
      await this.codes.update({ where: { id: row.id }, data: { attempts, lockedUntil: locked ? new Date(Date.now() + LOCK_MS) : null } as never });
      throw new BadRequestException(locked ? 'Too many incorrect attempts — locked for 15 minutes.' : `Incorrect code. ${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? '' : 's'} left.`);
    }
    const resetToken = randomBytes(24).toString('hex');
    await this.codes.update({ where: { id: row.id }, data: { verifiedAt: new Date(), resetToken } as never });
    return { resetToken };
  }

  /** Resend the OTP (max 3). Same generic response regardless. */
  async resend(recoveryToken: string) {
    const row = await this.load({ token: recoveryToken, usedAt: null });
    if (!row) return { message: GENERIC };
    if (row.resends >= MAX_RESENDS) throw new BadRequestException('Too many resends — start recovery again.');
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpHash = await argon2.hash(otp);
    await this.codes.update({ where: { id: row.id }, data: { otpHash, resends: row.resends + 1, expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, lockedUntil: null } as never });
    await this.deliver(row.userId, otp, row.channel as 'email' | 'sms').catch(() => undefined);
    return { message: GENERIC };
  }

  /** STEP 5–6: set the new password. Validates policy + not-a-repeat, then
   *  invalidates every session/refresh token and retires all recovery codes. */
  async reset(resetToken: string, newPassword: string) {
    const row = await this.load({ resetToken, usedAt: null });
    if (!row || !row.verifiedAt) throw new BadRequestException('Your recovery session is invalid — start again.');
    if (row.verifiedAt.getTime() + OTP_TTL_MS < Date.now()) throw new BadRequestException('Your recovery session has expired — start again.');
    assertStrongPassword(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new BadRequestException('Account not found.');
    if (await argon2.verify(user.passwordHash, newPassword).catch(() => false)) {
      throw new BadRequestException("Choose a password you haven't used before.");
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(newPassword) } });
    await this.codes.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }).catch(() => undefined);
    await this.tokens.revokeAll(user.id);  // sign out everywhere + kill refresh tokens
    await this.mail.deliverSystem(user.id, {
      subject: 'Your Together City password was changed',
      body: 'Your password was just reset and you have been signed out of every device. If this wasn’t you, reset your password again immediately and contact support.',
    }, 'security').catch(() => undefined);
    this.logger.log(`recovery completed user=${user.id}`);
    return { ok: true };
  }
}

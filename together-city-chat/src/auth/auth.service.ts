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
import { TokenService, TokenPair } from './token.service';
import { assertStrongPassword } from './recovery.service';
import { VerificationService } from './verification.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly verification: VerificationService,
  ) {}

  /** Every new account is fully initialised on sign-up (no lazy gaps). Hub
   *  profiles seed their defaults here; the rest self-seed on first visit. */
  private async initializeAccount(userId: string): Promise<void> {
    await (this.prisma as unknown as { foodPref: { create(a: unknown): Promise<unknown> } })
      .foodPref.create({ data: { userId } }).catch(() => undefined);
  }

  async register(dto: RegisterDto): Promise<TokenPair & { userId: string }> {
    // Open registration — Together City is no longer invite-only.
    assertStrongPassword(dto.password);
    const existing = await this.prisma.user.findUnique({ where: { handle: dto.handle.toLowerCase() } });
    if (existing) throw new ConflictException('That handle is already taken.');
    if (dto.email) {
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
    await this.verification.send(user.id).catch(() => undefined); // send verification link
    const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle });
    return { ...pair, userId: user.id };
  }

  /** Live handle availability + alternative suggestions (for the sign-up form). */
  async handleAvailable(raw: string): Promise<{ handle: string; valid: boolean; available: boolean; suggestions: string[] }> {
    const handle = (raw ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(handle)) return { handle, valid: false, available: false, suggestions: [] };
    const taken = await this.prisma.user.findUnique({ where: { handle } }).catch(() => null);
    if (!taken) return { handle, valid: true, available: true, suggestions: [] };
    const base = handle.replace(/[._]+$/, '') || handle;
    const candidates = [`${base}_${randomInt(10, 99)}`, `${base}.city`, `${base}_official`, `the.${base}`, `${base}${randomInt(1, 9)}`, `${base}_${randomInt(100, 999)}`];
    const suggestions: string[] = [];
    for (const c of candidates) {
      if (suggestions.length >= 4) break;
      if (!/^[a-z0-9_.]{3,30}$/.test(c) || suggestions.includes(c)) continue;
      if (!(await this.prisma.user.findUnique({ where: { handle: c } }).catch(() => null))) suggestions.push(c);
    }
    return { handle, valid: true, available: false, suggestions };
  }

  /** Live email availability + format check (for the sign-up form). */
  async emailAvailable(raw: string): Promise<{ email: string; valid: boolean; available: boolean }> {
    const email = (raw ?? '').trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
    if (!valid) return { email, valid: false, available: false };
    const taken = await this.prisma.user.findFirst({ where: { email } }).catch(() => null);
    return { email, valid: true, available: !taken };
  }

  /** Forgot password — send a recovery OTP to the citizen's primary email or phone (and their city inbox). */
  async forgot(dto: ForgotDto): Promise<{ sent: true }> {
    const id = dto.identifier.trim().toLowerCase();
    const user = id.includes('@') && !id.endsWith('@togethercity.tech')
      ? await this.prisma.user.findFirst({ where: { email: id } })
      : /^[+0-9][0-9\s-]{5,}$/.test(id)
        ? await this.prisma.user.findFirst({ where: { phone: dto.identifier.trim() } })
        : await this.prisma.user.findUnique({ where: { handle: id.replace(/@togethercity\.tech$/, '') } });
    // Always respond the same way — never leak whether an account exists.
    if (user) {
      const channel = dto.channel === 'sms' && user.phone ? 'sms' : 'email';
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.prisma.passwordReset.create({ data: { userId: user.id, code, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
      const body = channel === 'sms'
        ? `Together City recovery code: ${code}. Expires in 30 minutes. Didn't request it? Ignore this message.`
        : [
            `We received a request to reset your Together City password.`,
            ``, `Your recovery code is: ${code}`, `It expires in 30 minutes.`, ``,
            `Enter it on the reset screen along with a new password. If you didn't request this, you can ignore this message — your password stays unchanged.`,
          ].join('\n');
      await this.mail.deliverSystem(user.id, { subject: '🔐 Your Together City recovery code', body }, 'recovery', channel).catch(() => undefined);
    }
    return { sent: true };
  }

  /** Reset password with the recovery code; emails a security confirmation. */
  async reset(dto: ResetDto): Promise<{ ok: true }> {
    const id = dto.identifier.trim().toLowerCase();
    const user = id.includes('@') && !id.endsWith('@togethercity.tech')
      ? await this.prisma.user.findFirst({ where: { email: id } })
      : await this.prisma.user.findUnique({ where: { handle: id.replace(/@togethercity\.tech$/, '') } });
    if (!user) throw new UnauthorizedException('Invalid code or account');
    const reset = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, code: dto.code, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!reset) throw new UnauthorizedException('That code is invalid or has expired.');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(dto.newPassword) } });
    await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    await this.tokens.revokeAll(user.id); // sign out everywhere after a reset
    await this.mail.deliverSystem(user.id, {
      subject: '✅ Your Together City password was changed',
      body: `Your password was just reset and you've been signed out of all sessions. If this wasn't you, reset your password again immediately.`,
    }, 'security').catch(() => undefined);
    return { ok: true };
  }

  async login(dto: LoginDto): Promise<TokenPair & { userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { handle: dto.handle } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle });
    return { ...pair, userId: user.id };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      return await this.tokens.rotate(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    await this.tokens.revokeAll(userId);
  }
}

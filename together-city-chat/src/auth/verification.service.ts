import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { TokenService, TokenPair } from './token.service';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const APP_URL = (process.env.WEB_APP_URL || 'https://together-ai-five.vercel.app').replace(/\/$/, '');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface VTokenRow { id: string; userId: string; tokenHash: string; purpose: string; expiresAt: Date; usedAt: Date | null }
interface VTokenDelegate {
  create(a: unknown): Promise<VTokenRow>;
  findUnique(a: unknown): Promise<VTokenRow | null>;
  update(a: unknown): Promise<VTokenRow>;
  updateMany(a: unknown): Promise<{ count: number }>;
}

/** Email verification — a secure 24h link; the raw token is emailed, only its
 *  sha256 is stored. Verifying flips emailVerified and signs the user in. */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger('Verification');
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly tokens: TokenService,
  ) {}

  private get vtokens(): VTokenDelegate {
    return (this.prisma as unknown as { verificationToken: VTokenDelegate }).verificationToken;
  }

  /** Issue + email a verification link. No-op if already verified or no email. */
  async send(userId: string): Promise<{ ok: true; alreadyVerified?: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailVerified: true } as never }).catch(() => null) as { email: string | null; name: string; emailVerified: boolean } | null;
    if (!user?.email) return { ok: true };
    if (user.emailVerified) return { ok: true, alreadyVerified: true };
    await this.vtokens.updateMany({ where: { userId, purpose: 'email_verification', usedAt: null }, data: { usedAt: new Date() } }).catch(() => undefined);
    const raw = randomBytes(32).toString('hex');
    await this.vtokens.create({ data: { userId, tokenHash: sha256(raw), purpose: 'email_verification', expiresAt: new Date(Date.now() + TTL_MS) } as never });
    const link = `${APP_URL}/verify?token=${raw}`;
    const body = [
      `Welcome to Together City${user.name ? `, ${user.name.split(' ')[0]}` : ''}!`, '',
      'Confirm your email address to secure your account:', '', link, '',
      'This link expires in 24 hours. If you did not create an account, you can safely ignore this email.',
    ].join('\n');
    await this.mail.deliverSystem(userId, { subject: 'Verify your Together City email', body }, 'welcome').catch(() => undefined);
    this.logger.log(`verification sent user=${userId}`);
    return { ok: true };
  }

  /** Verify the link's token → mark verified + sign the user in. */
  async verify(rawToken: string): Promise<{ ok: true } & TokenPair & { userId: string }> {
    const row = await this.vtokens.findUnique({ where: { tokenHash: sha256(rawToken ?? '') } }).catch(() => null);
    if (!row || row.usedAt) throw new BadRequestException('This verification link is invalid or has already been used.');
    if (row.expiresAt < new Date()) throw new BadRequestException('This verification link has expired — request a new one.');
    await this.vtokens.update({ where: { id: row.id }, data: { usedAt: new Date() } as never });
    const user = await this.prisma.user.update({ where: { id: row.userId }, data: { emailVerified: true, emailVerifiedAt: new Date() } as never });
    const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle });
    this.logger.log(`email verified user=${user.id}`);
    return { ok: true, ...pair, userId: user.id };
  }

  /** Resend a verification link — same generic response either way. */
  async resend(emailRaw: string): Promise<{ ok: true; message: string }> {
    const email = (emailRaw ?? '').trim().toLowerCase();
    const user = email ? await this.prisma.user.findFirst({ where: { email } }).catch(() => null) : null;
    if (user && !(user as unknown as { emailVerified?: boolean }).emailVerified) await this.send(user.id).catch(() => undefined);
    return { ok: true, message: "If an unverified account exists, we've sent a new verification link." };
  }
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  CODE_TTL_MS, Channel, HOUR_MS,
  decideAttempt, decideSend, formatCode, isPlausibleEmail, normaliseEmail, parseE164,
} from './verification-policy';

interface CodeRow {
  id: string; userId: string; channel: string; target: string; codeHash: string;
  expiresAt: Date; attempts: number; consumedAt: Date | null; ip: string | null; createdAt: Date;
}
interface CodeDelegate {
  create(a: unknown): Promise<CodeRow>;
  findFirst(a: unknown): Promise<CodeRow | null>;
  findMany(a: unknown): Promise<CodeRow[]>;
  update(a: unknown): Promise<CodeRow>;
  updateMany(a: unknown): Promise<{ count: number }>;
}

/** What the caller is allowed to know about a send. Never the code. */
export interface SendResult {
  sent: boolean;
  channel: Channel;
  /** Masked, so the UI can say where it went without printing the address. */
  target: string;
  /** False when no provider is wired — the UI says so instead of pretending. */
  delivery: 'live' | 'unconfigured';
  retryAfterMs: number;
}

export interface ConfirmResult {
  verified: true;
  channel: Channel;
  target: string;
  verifiedAt: Date;
}

/**
 * Mask an address for display: enough to recognise, not enough to harvest.
 * s****i@gbcapl.com · +91******3210
 */
export function maskTarget(channel: Channel, target: string): string {
  if (channel === 'phone') {
    const tail = target.slice(-4);
    const head = target.slice(0, Math.min(3, target.length - 4));
    return `${head}${'*'.repeat(Math.max(0, target.length - head.length - 4))}${tail}`;
  }
  const [local, domain] = target.split('@');
  if (!domain) return target;
  const shown = local.length <= 2 ? local[0] ?? '' : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${shown}@${domain}`;
}

/**
 * Six-digit verification of an email address and a phone number (review p2, p3,
 * p19).
 *
 * The design rule throughout: this service does I/O and nothing else decides
 * anything. Every judgement — may we send, is this attempt good, how long to
 * wait — comes from verification-policy.ts, which has no database and is
 * covered by its own tests. What is left here is the part that can only be
 * tested against a real Postgres, and it is deliberately dull.
 */
@Injectable()
export class VerificationCodeService {
  private readonly logger = new Logger('Verification');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private get verificationCode(): CodeDelegate {
    return (this.prisma as unknown as { verificationCode: CodeDelegate }).verificationCode;
  }

  // ── sending ─────────────────────────────────────────────────────────────

  /**
   * Issue and dispatch a code.
   *
   * `target` is optional for email (defaults to the account's primary address)
   * and required for a phone that is not yet on the record. Supplying a new
   * target is also how you change one: the column is written now, the verified
   * stamp is not written until a code comes back.
   */
  async send(
    userId: string,
    channel: Channel,
    targetRaw?: string,
    ip?: string,
  ): Promise<SendResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true } as never,
    }) as { id: string; name: string; email: string | null; phone: string | null } | null;
    if (!user) throw new BadRequestException('Account not found.');

    const target = await this.resolveTarget(user, channel, targetRaw);
    const now = new Date();

    // Throttle on the TARGET, not on the account. An attacker who wants to bury
    // someone in texts would otherwise just make a new account per burst.
    const [toTarget, fromIp] = await Promise.all([
      this.verificationCode.findMany({
        where: { target, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
        select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50,
      }).catch(() => [] as CodeRow[]),
      ip
        ? this.verificationCode.findMany({
            where: { ip, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
            select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50,
          }).catch(() => [] as CodeRow[])
        : Promise.resolve([] as CodeRow[]),
    ]);

    const verdict = decideSend(
      { toTarget: toTarget.map((r) => r.createdAt), fromIp: fromIp.map((r) => r.createdAt) },
      now,
    );
    if (!verdict.allow) {
      this.logger.warn(`send refused user=${userId} channel=${channel} reason=${verdict.reason}`);
      throw new BadRequestException(verdict.message);
    }

    // One live code per user per channel. Retiring the old one first means a
    // resend genuinely replaces — otherwise the previous code stays valid and
    // every resend widens the window instead of restarting it.
    await this.verificationCode.updateMany({
      where: { userId, channel, consumedAt: null },
      data: { consumedAt: now },
    }).catch(() => undefined);

    const code = formatCode(randomInt(0, 1_000_000));
    await this.verificationCode.create({
      data: {
        userId, channel, target,
        codeHash: await argon2.hash(code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        ip: ip ?? null,
      } as never,
    });

    // Write the pending target onto the account, without a verified stamp. The
    // profile can then show "shruti@gbcapl.com — unverified" rather than showing
    // nothing until the code comes back.
    await this.writePendingTarget(userId, channel, target).catch(() => undefined);

    const minutes = Math.round(CODE_TTL_MS / 60000);
    const dispatch = await this.mail.deliverTo(
      userId,
      channel === 'phone' ? 'sms' : 'email',
      target,
      channel === 'phone'
        ? { subject: 'Together City code', body: `${code} is your Together City verification code. It expires in ${minutes} minutes.` }
        : {
            subject: 'Your Together City verification code',
            body: [
              `${code} is your Together City verification code.`,
              '',
              `It expires in ${minutes} minutes and can only be used once.`,
              'If you did not ask for this, you can ignore this email — nothing has changed on your account.',
            ].join('\n'),
            html: codeEmailHtml(code, minutes),
          },
      'security',
    );

    this.logger.log(`code sent user=${userId} channel=${channel} provider=${dispatch.provider} status=${dispatch.status}`);

    return {
      sent: true,
      channel,
      target: maskTarget(channel, target),
      // Honest about the stub: if no provider is wired, no code is arriving, and
      // saying "sent" without saying that wastes ten minutes of somebody's day.
      delivery: this.mail.deliveryConfigured(channel === 'phone' ? 'sms' : 'email') ? 'live' : 'unconfigured',
      retryAfterMs: 60_000,
    };
  }

  // ── confirming ──────────────────────────────────────────────────────────

  /** Check a code and, if it is good, stamp the channel verified. */
  async confirm(userId: string, channel: Channel, codeRaw: string): Promise<ConfirmResult> {
    const code = (codeRaw ?? '').replace(/\D/g, '');
    const now = new Date();

    const row = await this.verificationCode.findFirst({
      where: { userId, channel },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    // Hash comparison happens before the verdict so that a missing row and a
    // wrong code take the same amount of work. Without the dummy verify, "no
    // code on file" would answer in a millisecond and "wrong code" in fifty,
    // which is a free oracle for whether an account has a pending code.
    const matches = row
      ? await argon2.verify(row.codeHash, code).catch(() => false)
      : await argon2.verify(await argon2.hash('000000'), '111111').catch(() => false);

    const verdict = decideAttempt(
      row ? { expiresAt: row.expiresAt, attempts: row.attempts, consumedAt: row.consumedAt } : null,
      matches,
      now,
    );

    if (verdict.outcome !== 'accept') {
      // A wrong guess costs an attempt. Everything else already ended the code,
      // so incrementing would only confuse the counter shown to the user.
      // updateMany with the userId beside the id, not update by id alone. The
      // row was already loaded under this user's scope so it cannot be someone
      // else's — but a future edit could move that load, and the query-scoping
      // guard is right to insist the write says whose row it is touching.
      if (row && verdict.outcome === 'wrong') {
        await this.verificationCode.updateMany({
          where: { id: row.id, userId }, data: { attempts: { increment: 1 } } as never,
        }).catch(() => undefined);
      }
      if (row && verdict.outcome === 'exhausted') {
        await this.verificationCode.updateMany({
          where: { id: row.id, userId }, data: { attempts: { increment: 1 }, consumedAt: now } as never,
        }).catch(() => undefined);
      }
      this.logger.warn(`code refused user=${userId} channel=${channel} outcome=${verdict.outcome}`);
      throw new BadRequestException(verdict.message);
    }

    if (!row) throw new BadRequestException('Ask for a new code.');

    // Single use, enforced rather than intended. `consumedAt: null` in the WHERE
    // makes this a compare-and-set: two requests carrying the same correct code
    // race, exactly one updates a row, and the loser is told the code has been
    // used. Reading the row and then writing it would let both through, which is
    // the difference between a code that can be used once and a code that is
    // usually used once.
    const claimed = await this.verificationCode.updateMany({
      where: { id: row.id, userId, consumedAt: null },
      data: { consumedAt: now } as never,
    });
    if (!claimed.count) {
      throw new BadRequestException('That code has already been used. Ask for a new one.');
    }
    await this.stampVerified(userId, channel, row.target, now);

    this.logger.log(`verified user=${userId} channel=${channel}`);
    return { verified: true, channel, target: maskTarget(channel, row.target), verifiedAt: now };
  }

  // ── target handling ─────────────────────────────────────────────────────

  private async resolveTarget(
    user: { email: string | null; phone: string | null },
    channel: Channel,
    raw?: string,
  ): Promise<string> {
    if (channel === 'email') {
      const email = normaliseEmail(raw ?? user.email ?? '');
      if (!email) throw new BadRequestException('Add an email address first.');
      if (!isPlausibleEmail(email)) throw new BadRequestException('That does not look like an email address.');
      // A city address cannot be verified against itself — we issue it, so
      // proving control of it proves nothing about the person.
      if (email.endsWith('@togethercity.app')) {
        throw new BadRequestException('Verify the email address you actually read — a Gmail, Yahoo or work address.');
      }
      return email;
    }

    const parsed = parseE164(raw ?? user.phone ?? '');
    if (!parsed.ok || !parsed.e164) throw new BadRequestException(parsed.reason ?? 'Enter a valid phone number.');
    return parsed.e164;
  }

  /** Record the address being verified, WITHOUT a verified stamp. */
  private async writePendingTarget(userId: string, channel: Channel, target: string): Promise<void> {
    const data = channel === 'email'
      // Changing the address drops the old verification, per BE-2.3. Anything
      // else would leave a verified flag attached to an address the account no
      // longer claims.
      ? { email: target, emailVerified: false, emailVerifiedAt: null }
      : { phone: target, phoneE164: target, phoneVerifiedAt: null };
    await this.prisma.user.update({ where: { id: userId }, data: data as never });
  }

  private async stampVerified(userId: string, channel: Channel, target: string, at: Date): Promise<void> {
    const data = channel === 'email'
      ? { email: target, emailVerified: true, emailVerifiedAt: at }
      : { phone: target, phoneE164: target, phoneVerifiedAt: at };
    try {
      await this.prisma.user.update({ where: { id: userId }, data: data as never });
    } catch (e) {
      // The partial unique index refused it: somebody else already proved they
      // own this address or number. Say that plainly — it is the one case where
      // the code was right and the answer is still no.
      const msg = String((e as { message?: string })?.message ?? '');
      if (/unique|duplicate/i.test(msg)) {
        throw new BadRequestException(
          channel === 'email'
            ? 'That email address is already verified on another account.'
            : 'That phone number is already verified on another account.',
        );
      }
      throw e;
    }
  }

  /** Current verification state, for the profile and the settings banner. */
  async status(userId: string): Promise<{
    email: { target: string | null; verified: boolean; verifiedAt: Date | null };
    phone: { target: string | null; verified: boolean; verifiedAt: Date | null };
    smsConfigured: boolean;
    emailConfigured: boolean;
  }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true, emailVerifiedAt: true, phoneE164: true, phone: true, phoneVerifiedAt: true } as never,
    }) as {
      email: string | null; emailVerified: boolean; emailVerifiedAt: Date | null;
      phoneE164: string | null; phone: string | null; phoneVerifiedAt: Date | null;
    } | null;

    return {
      email: {
        target: u?.email ?? null,
        // The BOOLEAN, matching the partial unique index. emailVerifiedAt is
        // null on rows verified before that column existed, and reading the
        // timestamp here would tell those accounts they are unverified while
        // the database still treats them as owning the address.
        verified: !!u?.emailVerified,
        verifiedAt: u?.emailVerifiedAt ?? null,
      },
      phone: {
        target: u?.phoneE164 ?? u?.phone ?? null,
        verified: !!u?.phoneVerifiedAt,
        verifiedAt: u?.phoneVerifiedAt ?? null,
      },
      emailConfigured: this.mail.deliveryConfigured('email'),
      smsConfigured: this.mail.deliveryConfigured('sms'),
    };
  }
}

function codeEmailHtml(code: string, minutes: number): string {
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f6f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1c1a">
  <div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e6e3db;border-radius:18px;padding:32px;text-align:center">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9a9689">Together City</div>
    <h1 style="font-size:19px;margin:14px 0 6px;font-weight:600">Your verification code</h1>
    <p style="font-size:14px;color:#6b675d;margin:0 0 22px">Enter this to confirm your email address.</p>
    <div style="font-size:34px;letter-spacing:.28em;font-weight:600;padding:16px 0;background:#f6f5f1;border-radius:12px">${code}</div>
    <p style="font-size:13px;color:#6b675d;margin:22px 0 0">Expires in ${minutes} minutes. It can only be used once.</p>
    <p style="font-size:12px;color:#9a9689;margin:16px 0 0">If you did not ask for this, ignore this email — nothing on your account has changed.</p>
  </div></body></html>`;
}

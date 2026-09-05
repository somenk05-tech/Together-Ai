import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FinancialService, type PayMethod } from '../financial/financial.service';
import { swallow } from '../shared/swallow';
import { editQuota, inSitting, monthStart, type EditQuota } from './edit-quota';

/**
 * The meter every profile save runs through — see edit-quota.ts for the rule.
 *
 * THE ORDER IS THE POINT. A save is priced BEFORE it is written (`assertCanSave`),
 * so a citizen past their five is told — or charged — before anything moves;
 * and it is counted AFTER (`record`), and only when the service found that
 * something actually changed, so a re-save of the same answers costs nothing
 * and counts for nothing. The same shape as Ask the Astrologer and the Beauty
 * read: check first, do the work, charge for the thing that happened.
 *
 * When ₹50 is due and the client offered no way to pay, the answer is 402 with
 * the price, the count and the reset date in the body — the choice the owner
 * named: pay, or come back next month. A client that has not been taught the
 * price cannot be charged by accident; it can only be refused.
 */
@Injectable()
export class ProfileEditMeterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialService,
  ) {}

  private get edits() {
    return (this.prisma as unknown as {
      profileEdit: {
        count(a: unknown): Promise<number>;
        create(a: unknown): Promise<unknown>;
        findFirst(a: unknown): Promise<{ createdAt: Date } | null>;
      };
    }).profileEdit;
  }

  async quota(userId: string, now = Date.now()): Promise<EditQuota> {
    const [used, last] = await Promise.all([
      swallow(this.edits.count({ where: { userId, createdAt: { gte: monthStart(now) } } }), 'profile edits counted', { userId }),
      swallow(this.edits.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }), 'last profile edit read', { userId }),
    ]);
    return editQuota(used ?? 0, now, last?.createdAt ? new Date(last.createdAt).getTime() : null);
  }

  /**
   * Before the write. Returns what this change will cost; throws before
   * anything is written when it cannot be paid for.
   */
  async assertCanSave(userId: string, method?: PayMethod): Promise<number> {
    const q = await this.quota(userId);
    if (q.priceInr === 0) return 0;
    if (!method) {
      const resets = new Date(q.resetsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      throw new HttpException({
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message: `You've used your ${q.freePerMonth} free profile changes this month. The next change is ₹${q.priceInr} from your wallet, or your free changes come back on ${resets}.`,
        priceInr: q.priceInr, freeLeft: 0, resetsAt: q.resetsAt,
      }, HttpStatus.PAYMENT_REQUIRED);
    }
    await this.financial.assertCanPay(userId, q.priceInr, method);
    return q.priceInr;
  }

  /**
   * After the write, only when something changed. A save inside the sitting
   * of the last counted change is that change continuing — nothing is
   * written and nothing is charged.
   */
  async record(userId: string, hub: string, priceInr: number, method?: PayMethod): Promise<{ priceInr: number; payment?: { method: PayMethod; balanceInr: number } }> {
    const last = await swallow(this.edits.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }), 'last profile edit read', { userId });
    if (inSitting(last?.createdAt ? new Date(last.createdAt).getTime() : null, Date.now())) return { priceInr: 0 };
    if (priceInr <= 0) {
      await swallow(this.edits.create({ data: { userId, hub, priceInr: 0 } }), 'profile edit recorded', { userId, hub });
      return { priceInr: 0 };
    }
    const payment = await this.financial.paid(
      userId,
      { hub: 'City', category: 'city', label: `Profile change · ${hub} · beyond the free five`, amountInr: priceInr, method },
      async (tx) => {
        await (tx as unknown as { profileEdit: { create(a: unknown): Promise<unknown> } }).profileEdit
          .create({ data: { userId, hub, priceInr } });
        const wallet = await tx.cityWallet.findUnique({ where: { userId }, select: { balanceInr: true } });
        return { method: (method === 'card' ? 'card' : 'wallet') as PayMethod, balanceInr: wallet?.balanceInr ?? 0 };
      },
    );
    return { priceInr, payment };
  }
}

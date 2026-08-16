import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import type { PrismaTx } from '../shared/prisma/prisma-tx';
import { ClockService } from '../shared/clock/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ORDER_HISTORY_CAP } from '../shared/paging';
import { PAYOUT_PROVIDER, type PayoutProvider } from './provider';
import { feeFor, nextBusinessDay, dayKey, FEE } from './money';
import type { PayoutAccountDto } from './dto/commerce.dto';

/**
 * Payout states, in the order money passes through them.
 *
 * `on_hold` is not a failure and does not sit between the others — it is where
 * a batch waits when the business has not finished verifying. Money still
 * accrues; it simply does not leave.
 */
export const PAYOUT_STATUSES = [
  'on_hold', 'pending', 'scheduled', 'processing', 'settled', 'failed', 'returned', 'reversed',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  on_hold: 'On hold',
  pending: 'Pending',
  scheduled: 'Scheduled',
  processing: 'Processing',
  settled: 'Settled',
  failed: 'Failed',
  returned: 'Returned',
  reversed: 'Reversed',
};

/** Merchant onboarding, as the business experiences it. */
export type MerchantStage =
  | 'not_started' | 'verification_required' | 'under_review' | 'verified' | 'payouts_enabled' | 'payouts_on_hold';

/**
 * THE SECOND FINANCIAL EVENT.
 *
 * A customer paying and a business being paid are not the same thing happening
 * to two people. There is a night between them, a fee inside them and a bank
 * outside them, and every screen the brief asks for on the merchant side exists
 * because collapsing the two hides one of those three.
 *
 * ── No scheduler ───────────────────────────────────────────────────────────
 *
 * Nothing in here runs on a cron. A batch advances when somebody reads the
 * dashboard, exactly as the trust gate releases held threads when an owner
 * opens their inbox — same reasoning: a job is a thing that drifts, breaks
 * silently and is discovered by a customer. Reading is frequent enough, and a
 * business that never looks is a business whose money is safely still accruing.
 *
 * The honest cost, named rather than discovered: a payout does not move at 6am
 * because it is 6am. It moves the first time anybody looks after 6am. When a
 * real payout provider is wired, its own scheduled transfer replaces this and
 * the state machine below does not change.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly notifications: NotificationsService,
    @Inject(PAYOUT_PROVIDER) private readonly payouts: PayoutProvider,
  ) {}

  // ── ownership ─────────────────────────────────────────────────────────────

  private async own(ownerId: string, listingId: string) {
    const l = await this.prisma.serviceListing.findUnique({
      where: { id: listingId },
      select: { id: true, ownerId: true, businessName: true },
    });
    if (!l) throw new NotFoundException('listing not found');
    if (l.ownerId !== ownerId) throw new ForbiddenException('not your listing');
    return l;
  }

  // ── the sale ──────────────────────────────────────────────────────────────

  /**
   * A SALE, ENTERED THREE TIMES: what came in, what we kept, and the tax on
   * what we kept.
   *
   * Three ledger rows rather than one net row, because a business asked "why is
   * this ₹4,732 and not ₹4,850" deserves the arithmetic and not an assurance.
   * The settlement statement is these rows, added up.
   *
   * Called INSIDE the payment's transaction, so a sale and its fee cannot exist
   * without each other.
   */
  async recordSale(tx: PrismaTx, input: {
    listingId: string; ownerId: string; invoiceId: string; invoiceNumber: string;
    paymentIntentId: string; grossInr: number; today: Date;
  }): Promise<void> {
    const money = feeFor(input.grossInr);
    const batch = await this.batchFor(tx, input.listingId, input.ownerId, input.today);

    await tx.merchantLedgerEntry.createMany({
      data: [
        {
          listingId: input.listingId, ownerId: input.ownerId, kind: 'sale',
          amountInr: money.grossInr, invoiceId: input.invoiceId,
          paymentIntentId: input.paymentIntentId, settlementId: batch.id,
          note: `Invoice ${input.invoiceNumber}`,
        },
        {
          listingId: input.listingId, ownerId: input.ownerId, kind: 'fee',
          amountInr: -money.feeInr, invoiceId: input.invoiceId,
          paymentIntentId: input.paymentIntentId, settlementId: batch.id,
          note: `Together City fee · ${FEE.rateBp / 100}% + ₹${FEE.flatInr}`,
        },
        {
          listingId: input.listingId, ownerId: input.ownerId, kind: 'tax',
          amountInr: -money.taxInr, invoiceId: input.invoiceId,
          paymentIntentId: input.paymentIntentId, settlementId: batch.id,
          note: `GST on the fee · ${FEE.taxOnFeeBp / 100}%`,
        },
      ],
    });

    await tx.settlementItem.create({
      data: {
        settlementId: batch.id, invoiceId: input.invoiceId,
        paymentIntentId: input.paymentIntentId, invoiceNumber: input.invoiceNumber,
        grossInr: money.grossInr, feeInr: money.feeInr, taxInr: money.taxInr, netInr: money.netInr,
      },
    });

    await tx.settlement.update({
      where: { id: batch.id },
      data: {
        grossInr: { increment: money.grossInr },
        feeInr: { increment: money.feeInr },
        taxInr: { increment: money.taxInr },
        netInr: { increment: money.netInr },
      },
    });
  }

  /**
   * A REFUND AFTER THE MONEY WAS BANKED, carried into the next payout.
   *
   * It joins the OPEN batch rather than the one the sale was in. Re-opening a
   * settled payout to make it smaller is not something a bank transfer permits,
   * and pretending otherwise would produce a statement that no longer matches
   * what arrived. This is what `Settlement.adjustInr` is.
   */
  async recordRefund(tx: PrismaTx, input: {
    listingId: string; ownerId: string; invoiceId: string;
    amountInr: number; note: string; today: Date;
  }): Promise<void> {
    const batch = await this.batchFor(tx, input.listingId, input.ownerId, input.today);
    await tx.merchantLedgerEntry.create({
      data: {
        listingId: input.listingId, ownerId: input.ownerId, kind: 'refund',
        amountInr: -input.amountInr, invoiceId: input.invoiceId,
        settlementId: batch.id, note: input.note,
      },
    });
    await tx.settlement.update({
      where: { id: batch.id },
      data: { adjustInr: { increment: input.amountInr }, netInr: { decrement: input.amountInr } },
    });
  }

  /**
   * The batch today's money belongs to — found, or opened.
   *
   * Keyed on the day it is EXPECTED rather than the day it was earned, so
   * Friday, Saturday and Sunday collapse into Monday's payout by construction.
   * That is the behaviour a business expects and it needs no special case.
   *
   * A batch opens `on_hold` when payouts are not enabled. The money is the
   * business's either way; what verification decides is whether it can leave.
   */
  private async batchFor(tx: PrismaTx, listingId: string, ownerId: string, today: Date) {
    const expectedOn = nextBusinessDay(today);
    const open = await tx.settlement.findFirst({
      where: { listingId, expectedOn, status: { in: ['pending', 'on_hold'] } },
    });
    if (open) return open;

    const account = await tx.merchantAccount.findUnique({ where: { listingId } });
    const enabled = Boolean(account?.payoutsEnabled);
    const n = await tx.settlement.count();
    return tx.settlement.create({
      data: {
        listingId, ownerId,
        reference: `TCS-${String(100_000 + n).slice(-6)}`,
        status: enabled ? 'pending' : 'on_hold',
        expectedOn,
        provider: this.payouts.name,
      },
    });
  }

  // ── advancing ─────────────────────────────────────────────────────────────

  /**
   * MOVE EVERY BATCH AS FAR AS IT IS ENTITLED TO GO, and no further.
   *
   * One pass, called from the dashboard read. Each transition is guarded by the
   * condition that earns it, so calling this twice in a second does nothing the
   * second time.
   *
   *   on_hold  → pending     verification finished; the money may now leave
   *   pending  → scheduled   the expected day has arrived
   *   scheduled→ processing  the transfer has been asked for
   *   processing→ settled    the provider has confirmed it
   *
   * The last of those is where a real provider's webhook lands. The mock
   * answers `processing` and is confirmed on the next pass, which is why the
   * Processing state is reachable in development at all — a payout that goes
   * green instantly is a payout whose in-between state nobody ever sees.
   */
  private async advance(listingId: string, ownerId: string): Promise<void> {
    const account = await this.prisma.merchantAccount.findUnique({ where: { listingId } });
    const today = dayKey(this.clock.now());

    const open = await this.prisma.settlement.findMany({
      where: { listingId, status: { in: ['on_hold', 'pending', 'scheduled', 'processing'] } },
      orderBy: { expectedOn: 'asc' },
      take: ORDER_HISTORY_CAP,
    });

    for (const s of open) {
      if (s.status === 'on_hold') {
        if (!account?.payoutsEnabled) continue;
        await this.prisma.settlement.updateMany({
          where: { id: s.id, listingId, status: 'on_hold' }, data: { status: 'pending' },
        });
        s.status = 'pending';
      }
      if (s.status === 'pending') {
        if (dayKey(s.expectedOn) > today) continue;
        if (s.netInr <= 0) continue;
        await this.prisma.settlement.updateMany({
          where: { id: s.id, listingId, status: 'pending' }, data: { status: 'scheduled' },
        });
        s.status = 'scheduled';
      }
      if (s.status === 'scheduled') {
        if (!account?.payoutsEnabled || !account.providerAccountRef) continue;
        const transfer = await this.payouts.transfer({
          accountRef: account.providerAccountRef,
          amountInr: s.netInr,
          reference: s.reference,
          idempotencyKey: `${s.id}:transfer`,
        });
        await this.prisma.settlement.updateMany({
          where: { id: s.id, listingId, status: 'scheduled' },
          data: transfer.status === 'failed'
            ? { status: 'failed', failureReason: transfer.message ?? 'The transfer was refused.' }
            : {
              status: 'processing',
              providerRef: transfer.providerRef ?? null,
              destinationLast4: account.accountLast4,
            },
        });
        if (transfer.status === 'failed') {
          await this.notifications.create({
            userId: ownerId, kind: 'payout_failed',
            title: 'A payout could not be sent',
            body: `${s.reference} · ${transfer.message ?? 'The transfer was refused.'}`,
            href: `/services/${listingId}/payments`, entityId: s.id,
          });
          continue;
        }
        s.status = 'processing';
      }
      if (s.status === 'processing') {
        // WHERE THE PROVIDER'S WEBHOOK WILL LAND. Until one exists, a transfer
        // asked for on a previous pass is confirmed on the next one.
        const moved = await this.prisma.settlement.updateMany({
          where: { id: s.id, listingId, status: 'processing', updatedAt: { lt: this.clock.now() } },
          data: { status: 'settled', settledAt: this.clock.now() },
        });
        if (moved.count === 1) {
          await this.notifications.create({
            userId: ownerId, kind: 'payout_settled',
            title: `₹${s.netInr.toLocaleString('en-IN')} paid out`,
            body: `${s.reference} · sent to your account${account?.accountLast4 ? ` •••• ${account.accountLast4}` : ''}.`,
            href: `/services/${listingId}/payments`, entityId: s.id,
          });
        }
      }
    }
  }

  // ── the dashboard ─────────────────────────────────────────────────────────

  /**
   * PAYMENTS & PAYOUTS, in one read.
   *
   * Every figure here is computed from the ledger rather than stored, which is
   * the same argument the trust tier makes: a cached balance is a second source
   * of truth, and the first time it disagrees with the rows it summarises,
   * somebody's money is the thing in dispute.
   */
  async dashboard(ownerId: string, listingId: string) {
    const listing = await this.own(ownerId, listingId);
    await this.advance(listingId, ownerId);

    const today = dayKey(this.clock.now());
    const [entries, batches, account] = await Promise.all([
      // unbounded: the business's whole book, summed. A cap here would
      // under-report a balance, which is the one number that must be exact.
      this.prisma.merchantLedgerEntry.findMany({
        where: { listingId }, orderBy: { createdAt: 'desc' },
      }),
      this.prisma.settlement.findMany({
        where: { listingId }, orderBy: { expectedOn: 'desc' }, take: ORDER_HISTORY_CAP,
      }),
      this.prisma.merchantAccount.findUnique({ where: { listingId } }),
    ]);

    const sum = (rows: { amountInr: number }[]) => rows.reduce((s, r) => s + r.amountInr, 0);
    const sales = entries.filter((e) => e.kind === 'sale');
    const settled = new Set(batches.filter((b) => b.status === 'settled').map((b) => b.id));

    const nextOut = batches
      .filter((b) => ['pending', 'scheduled', 'processing', 'on_hold'].includes(b.status))
      .sort((a, b) => (dayKey(a.expectedOn) < dayKey(b.expectedOn) ? -1 : 1))[0];

    return {
      businessName: listing.businessName,
      /** What has already reached the bank. */
      settledInr: sum(entries.filter((e) => e.settlementId && settled.has(e.settlementId))),
      /** Earned, not yet sent. The brief's "Pending Settlement". */
      pendingInr: sum(entries.filter((e) => !e.settlementId || !settled.has(e.settlementId))),
      todayInr: sum(sales.filter((e) => dayKey(e.createdAt) === today)),
      totalSalesInr: sum(sales),
      refundedInr: -sum(entries.filter((e) => e.kind === 'refund')),
      feesInr: -sum(entries.filter((e) => e.kind === 'fee' || e.kind === 'tax')),
      nextPayout: nextOut
        ? {
          amountInr: nextOut.netInr,
          on: dayKey(nextOut.expectedOn),
          status: nextOut.status,
          statusLabel: PAYOUT_LABEL[nextOut.status as PayoutStatus] ?? nextOut.status,
        }
        : null,
      payouts: batches.map((b) => ({
        id: b.id,
        reference: b.reference,
        status: b.status,
        statusLabel: PAYOUT_LABEL[b.status as PayoutStatus] ?? b.status,
        netInr: b.netInr,
        on: dayKey(b.expectedOn),
        settledAt: b.settledAt?.toISOString(),
        failureReason: b.failureReason ?? undefined,
      })),
      account: this.accountCard(account),
      /** Recent movements, for the business's own reading. */
      transactions: entries.slice(0, 40).map((e) => ({
        id: e.id,
        kind: e.kind,
        amountInr: e.amountInr,
        note: e.note,
        at: e.createdAt.toISOString(),
        invoiceId: e.invoiceId ?? undefined,
      })),
    };
  }

  /**
   * ONE PAYOUT, WITH ITS WORKING SHOWN.
   *
   * §17 of the brief in one object: which invoices, gross, what was deducted,
   * what was adjusted, what left, and where it went.
   */
  async payout(ownerId: string, settlementId: string) {
    const s = await this.prisma.settlement.findFirst({ where: { id: settlementId, ownerId } });
    if (!s) throw new NotFoundException('payout not found');
    const items = await this.prisma.settlementItem.findMany({
      where: { settlementId }, take: ORDER_HISTORY_CAP,
    });
    return {
      id: s.id,
      reference: s.reference,
      status: s.status,
      statusLabel: PAYOUT_LABEL[s.status as PayoutStatus] ?? s.status,
      grossInr: s.grossInr,
      feeInr: s.feeInr,
      taxInr: s.taxInr,
      adjustInr: s.adjustInr,
      netInr: s.netInr,
      on: dayKey(s.expectedOn),
      settledAt: s.settledAt?.toISOString(),
      destinationLast4: s.destinationLast4 ?? undefined,
      failureReason: s.failureReason ?? undefined,
      listingId: s.listingId,
      items: items.map((it) => ({
        id: it.id,
        invoiceId: it.invoiceId,
        invoiceNumber: it.invoiceNumber,
        grossInr: it.grossInr,
        feeInr: it.feeInr,
        taxInr: it.taxInr,
        netInr: it.netInr,
      })),
    };
  }

  // ── the payout account ────────────────────────────────────────────────────

  private accountCard(a: {
    legalName: string; accountLast4: string | null; bankName: string | null;
    status: string; payoutsEnabled: boolean; holdReason: string | null; rejectReason: string | null;
    entityKind: string; taxRef: string | null;
  } | null) {
    if (!a) return null;
    return {
      legalName: a.legalName,
      entityKind: a.entityKind,
      last4: a.accountLast4 ?? undefined,
      bankName: a.bankName ?? undefined,
      taxRef: a.taxRef ?? undefined,
      status: a.status,
      payoutsEnabled: a.payoutsEnabled,
      holdReason: a.holdReason ?? undefined,
      rejectReason: a.rejectReason ?? undefined,
    };
  }

  /**
   * WHERE THE BUSINESS IS IN ONBOARDING, as one word plus the next thing to do.
   *
   * The stage is DERIVED, never stored — the same rule as the trust tier. It
   * reads the payout account and the listing's identity/document verification
   * together, because the brief's §19 sequence is genuinely both: a business
   * that has proved who it is but given no bank account is not "verified" in
   * any sense the word is useful for here.
   */
  async onboarding(ownerId: string, listingId: string) {
    await this.own(ownerId, listingId);
    const [account, verification, owner] = await Promise.all([
      this.prisma.merchantAccount.findUnique({ where: { listingId } }),
      this.prisma.serviceVerification.findUnique({ where: { listingId } }),
      this.prisma.user.findUnique({
        where: { id: ownerId }, select: { identityVerifiedAt: true, phoneVerifiedAt: true },
      }),
    ]);

    const identity = Boolean(owner?.identityVerifiedAt && owner?.phoneVerifiedAt);
    const business = verification?.docStatus === 'verified' || verification?.entityKind === 'individual';

    let stage: MerchantStage = 'not_started';
    let next = 'Tell us who the business is — that is the first rung of Together City Trust.';

    if (account?.payoutsEnabled) {
      stage = 'payouts_enabled';
      next = 'Payouts are on. Money from an invoice reaches your account the next working day.';
    } else if (account && account.holdReason) {
      stage = 'payouts_on_hold';
      next = account.holdReason;
    } else if (account?.status === 'verified') {
      stage = 'verified';
      next = 'Your account is verified. Payouts turn on with your first invoice.';
    } else if (account?.status === 'submitted') {
      stage = 'under_review';
      next = 'We are checking your account details. Nothing else is needed from you.';
    } else if (account?.status === 'rejected') {
      stage = 'verification_required';
      next = account.rejectReason ?? 'Those account details were not accepted. Check them and send them again.';
    } else if (!identity) {
      stage = 'verification_required';
      next = 'Verify your phone and your identity first — payouts cannot be turned on for an account nobody has checked.';
    } else if (!business) {
      stage = 'verification_required';
      next = 'Finish business verification on this listing, then add a payout account.';
    } else {
      stage = 'verification_required';
      next = 'Add the account your payouts should be sent to.';
    }

    return {
      stage,
      next,
      identityVerified: identity,
      businessVerified: business,
      account: this.accountCard(account),
      /** The fee the business will actually be charged, so nothing is a surprise. */
      fee: { rateBp: FEE.rateBp, flatInr: FEE.flatInr, taxOnFeeBp: FEE.taxOnFeeBp },
    };
  }

  /**
   * ADDING AN ACCOUNT — the one place a bank account number is named, on its
   * way past.
   *
   * The number and the IFSC go to the payout provider and are not written to a
   * column. There is nowhere in the schema to put them, which is the strongest
   * form this promise can take: it is not a rule somebody has to remember, it
   * is a table that has no such field.
   *
   * PAYOUTS ARE NOT SWITCHED ON HERE. The provider accepting an account is not
   * a decision that a business may be paid — that needs identity and business
   * verification too, which is what §19 asks for and what `onboarding` reports.
   */
  async saveAccount(ownerId: string, listingId: string, dto: PayoutAccountDto) {
    await this.own(ownerId, listingId);
    const state = await this.onboarding(ownerId, listingId);
    if (!state.identityVerified) {
      throw new BadRequestException('Verify your phone and identity before adding a payout account.');
    }

    const registered = await this.payouts.registerAccount({
      legalName: dto.legalName,
      entityKind: dto.entityKind,
      accountNumber: dto.accountNumber,
      ifsc: dto.ifsc,
      taxRef: dto.taxRef ?? null,
    });

    if (registered.status === 'rejected') {
      await this.prisma.merchantAccount.upsert({
        where: { listingId },
        update: { status: 'rejected', rejectReason: registered.message ?? 'Those details were not accepted.', payoutsEnabled: false },
        create: {
          listingId, ownerId, legalName: dto.legalName, entityKind: dto.entityKind,
          provider: this.payouts.name, status: 'rejected',
          rejectReason: registered.message ?? 'Those details were not accepted.',
        },
      });
      throw new BadRequestException(registered.message ?? 'Those account details were not accepted.');
    }

    // Verified the moment the provider accepts it AND the business itself has
    // been checked. The provider answers for the bank account; Together City
    // Trust answers for the business, and a payout needs both.
    const verified = state.businessVerified;
    await this.prisma.merchantAccount.upsert({
      where: { listingId },
      update: {
        legalName: dto.legalName, entityKind: dto.entityKind,
        providerAccountRef: registered.accountRef ?? null,
        provider: this.payouts.name,
        accountLast4: registered.last4 ?? null,
        bankName: registered.bankName ?? null,
        taxRef: dto.taxRef ?? null,
        status: verified ? 'verified' : 'submitted',
        payoutsEnabled: verified,
        rejectReason: null, holdReason: null,
        submittedAt: this.clock.now(),
        ...(verified ? { decidedAt: this.clock.now(), decidedBy: 'provider' } : {}),
      },
      create: {
        listingId, ownerId,
        legalName: dto.legalName, entityKind: dto.entityKind,
        providerAccountRef: registered.accountRef ?? null,
        provider: this.payouts.name,
        accountLast4: registered.last4 ?? null,
        bankName: registered.bankName ?? null,
        taxRef: dto.taxRef ?? null,
        status: verified ? 'verified' : 'submitted',
        payoutsEnabled: verified,
        submittedAt: this.clock.now(),
        ...(verified ? { decidedAt: this.clock.now(), decidedBy: 'provider' } : {}),
      },
    });

    // Anything already earned and held now has somewhere to go.
    await this.advance(listingId, ownerId);
    return this.onboarding(ownerId, listingId);
  }
}

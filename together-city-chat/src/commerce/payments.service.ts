import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FinancialService, isUniqueViolation } from '../financial/financial.service';
import { InvoicesService, maskRef } from './invoices.service';
import { SettlementService } from './settlement.service';
import { PAYMENT_PROVIDER, type PaymentProvider, sandboxAllowed, CARD_PAYMENTS_UNAVAILABLE } from './provider';
import { splitFor, outstandingInr, statusOf, PAYABLE } from './money';
import type { PayInvoiceDto } from './dto/commerce.dto';

/** The Financial hub's category this hub's money is filed under. */
export const SPEND_CATEGORY = 'services';
export const SPEND_HUB = 'Local Services';

interface InvoiceRow {
  id: string; listingId: string; ownerId: string; userId: string; number: string;
  totalInr: number; paidInr: number; refundedInr: number;
  sentAt: Date | null; viewedAt: Date | null; paidAt: Date | null;
  cancelledAt: Date | null; dueOn: Date | null;
}

/**
 * THE ONLY FILE IN THE TILL THAT CAN CHANGE A BALANCE.
 *
 * ── The order of operations, and why it is that order ──────────────────────
 *
 * 1. The wallet leg is taken FIRST, inside a transaction, through the city's
 *    existing conditional decrement. Money already inside Together City is the
 *    part we can put back ourselves.
 * 2. The card leg goes to the provider SECOND, and outside any transaction. A
 *    network call inside `$transaction` holds a connection open across the
 *    internet and trips Prisma's timeout under load — the rule `financial.paid`
 *    states in its own header, obeyed here.
 * 3. If the card is refused, the wallet leg is REVERSED. Doing it the other way
 *    round — card first, wallet second — means a wallet that comes up short
 *    after an external charge has already succeeded, and the money is somewhere
 *    we cannot reach.
 *
 * ── Nothing says Paid until a payment says so ──────────────────────────────
 *
 * `Invoice.status` is not a column. It is `statusOf()` over what has actually
 * happened, so there is no route, no body and no branch anywhere that can write
 * the word. A payment that is still in flight leaves an invoice reading exactly
 * what it read before, which is the brief's last and firmest instruction.
 *
 * ── One tap or ten ─────────────────────────────────────────────────────────
 *
 * `PaymentIntent` carries the caller's `Idempotency-Key` under a unique index
 * on (userId, key). The second arrival loses the insert race and is answered
 * with the FIRST attempt's outcome — the same mechanism and the same reasoning
 * as `topUp`. A client that already believes it paid is not helped by being
 * told "duplicate"; it is helped by being told where the invoice stands.
 */
/**
 * A row lock on one invoice for the rest of the calling transaction. Postgres
 * `SELECT … FOR UPDATE`: a second transaction on the same invoice waits here
 * until the first commits, then re-reads and finds the figures the first one
 * wrote. The fakes in the specs have no `$queryRaw`; for them the lock is a
 * no-op and the re-read is what the assertions see.
 */
async function lockInvoice(tx: unknown, id: string): Promise<void> {
  const client = tx as { $queryRaw?: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown> };
  if (typeof client.$queryRaw !== 'function') return;
  await client.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly financial: FinancialService,
    private readonly invoices: InvoicesService,
    private readonly settlement: SettlementService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * WHAT THE PAY SHEET NEEDS TO DRAW ITSELF, worked out on the server.
   *
   * The split is computed here and echoed by the sheet, rather than computed in
   * the sheet and trusted here. One arithmetic, one place — the reason
   * `splitFor` is a pure function in money.ts and this is its only production
   * caller besides `pay` below.
   */
  async quote(userId: string, invoiceId: string, useWallet: boolean) {
    const inv = await this.load(userId, invoiceId);
    const wallet = await this.financial.wallet(userId);
    const due = outstandingInr(inv);
    const split = splitFor({ amountInr: due, balanceInr: wallet.balanceInr, useWallet });
    return {
      invoiceId: inv.id,
      number: inv.number,
      dueInr: due,
      balanceInr: wallet.balanceInr,
      card: wallet.card,
      ...split,
      /** A card leg with no card linked is the one thing the sheet must block. */
      needsCard: split.cardInr > 0 && !wallet.card,
      /** False in production until a payment partner is signed: the sheet says
       *  so instead of offering a card button that leads to a 403. */
      cardAvailable: this.cardAvailable(),
    };
  }

  /** The sandbox is the only provider there is; in production it is off. A
   *  real adapter has a different name and is never gated by this. */
  private cardAvailable(): boolean {
    return this.provider.name !== 'mock' || sandboxAllowed();
  }

  /**
   * PAY IT.
   *
   * Everything the brief's edge-case list asks for is a branch in here, and
   * each one is named where it happens rather than in a table somewhere else.
   */
  async pay(userId: string, invoiceId: string, dto: PayInvoiceDto, idempotencyKey?: string) {
    const key = (idempotencyKey ?? '').trim().slice(0, 120) || null;

    // ── duplicate payment prevention, before anything is loaded ─────────────
    // A retry that already landed is answered from the row it wrote. Read
    // first AND unique-indexed below: the read catches the common case cheaply,
    // the index catches two requests that arrive together.
    if (key) {
      const already = await this.prisma.paymentIntent.findFirst({
        where: { userId, idempotencyKey: key },
      });
      if (already) return this.result(userId, already.invoiceId, already.id, true);
    }

    const inv = await this.load(userId, invoiceId);
    const status = statusOf(inv, this.clock.now());

    // ── invoice cancelled / already paid / never sent ───────────────────────
    if (!PAYABLE.has(status)) {
      throw new BadRequestException(
        status === 'cancelled' ? 'This invoice was cancelled. Nothing is owed on it.'
          : status === 'paid' ? 'This invoice is already paid.'
          : status === 'refunded' ? 'This invoice was refunded.'
          : 'This invoice is not ready to be paid.',
      );
    }

    const due = outstandingInr(inv);
    if (due <= 0) throw new BadRequestException('There is nothing left to pay on this invoice.');

    // ── the invoice changed under them ──────────────────────────────────────
    // Not a race guard — a correctness one. Somebody looking at ₹4,850 must not
    // be charged ₹5,400 because the business edited it while the sheet was open.
    if (dto.expectInr !== due) {
      throw new BadRequestException(
        `This invoice now comes to ₹${due.toLocaleString('en-IN')}. Open it again before paying.`,
      );
    }

    const wallet = await this.financial.wallet(userId);
    const split = splitFor({ amountInr: due, balanceInr: wallet.balanceInr, useWallet: dto.useWallet });

    // ── a card leg with no processor to run it (launch blocker 2, 2 Sep) ────
    // BEFORE the intent is written and BEFORE the wallet leg is taken, so the
    // refusal costs nothing to unwind. The sandbox class refuses too; this is
    // the check that keeps the wallet whole.
    if (split.cardInr > 0 && !this.cardAvailable()) {
      throw new ForbiddenException(CARD_PAYMENTS_UNAVAILABLE);
    }

    // ── insufficient wallet balance, and no card to make it up ──────────────
    if (split.cardInr > 0 && !wallet.card) {
      throw new BadRequestException(
        split.walletInr > 0
          ? `Your wallet covers ₹${split.walletInr.toLocaleString('en-IN')} of this. Link a card for the remaining ₹${split.cardInr.toLocaleString('en-IN')}, or top up.`
          : 'Link a card, or pay from your wallet.',
      );
    }

    // ── the attempt, and the wallet leg, in one transaction ─────────────────
    let intentId: string;
    try {
      intentId = await this.prisma.$transaction(async (tx) => {
        /* ── ONE PAYMENT AT A TIME ON ONE INVOICE (5 Sep) ───────────────────
           The status check above read a snapshot. Two taps, two tabs, or a
           retry that raced its own first attempt both passed it, both took
           the wallet leg, and settle() then wrote paidInr as an ABSOLUTE
           computed from that snapshot — so the invoice showed one payment
           where two had been taken. The row is locked for the rest of this
           transaction, the figures are re-read under the lock, and a second
           attempt that is still in flight (a card capture between this
           transaction and settle) refuses this one. Distinct idempotency
           keys were never a guard against this; the lock is.
           Serialised by SELECT … FOR UPDATE (lockInvoice). */
        await lockInvoice(tx, inv.id);
        const fresh = await tx.invoice.findFirst({ where: { id: inv.id, userId } }) as InvoiceRow | null;
        if (!fresh || !PAYABLE.has(statusOf(fresh, this.clock.now())) || outstandingInr(fresh) < due) {
          throw new ConflictException('This invoice was just paid or changed. Refresh to see where it stands.');
        }
        // Bounded to a quarter of an hour so an attempt that died mid-capture
        // does not hold the invoice hostage; the capture path itself times out
        // long before that.
        const inFlight = await tx.paymentIntent.count({
          where: { invoiceId: inv.id, userId, status: { in: ['created', 'processing'] }, createdAt: { gte: new Date(this.clock.now().getTime() - 15 * 60_000) } },
        });
        if (inFlight > 0) {
          throw new ConflictException('A payment on this invoice is already in progress. Give it a moment, then refresh.');
        }
        const intent = await tx.paymentIntent.create({
          data: {
            invoiceId: inv.id, userId, listingId: inv.listingId,
            amountInr: due, walletInr: split.walletInr, cardInr: split.cardInr,
            status: split.cardInr > 0 ? 'processing' : 'created',
            provider: this.provider.name,
            idempotencyKey: key,
          },
        });
        if (split.walletInr > 0) {
          // The city's one payment rail, conditional decrement and all. It
          // throws the 400 a short balance deserves, which is correct: the
          // transaction unwinds and no attempt is left half-made.
          await this.financial.charge(userId, {
            hub: SPEND_HUB, category: SPEND_CATEGORY,
            label: `Invoice ${inv.number}`, amountInr: split.walletInr, method: 'wallet',
          }, tx);
        }
        return intent.id;
      });
    } catch (e) {
      // The unique index answering a second simultaneous retry. Nothing was
      // charged twice — which is the entire point — so report where the
      // invoice actually stands.
      if (key && isUniqueViolation(e)) {
        const first = await this.prisma.paymentIntent.findFirst({ where: { userId, idempotencyKey: key } });
        if (first) return this.result(userId, first.invoiceId, first.id, true);
      }
      throw e;
    }

    // ── the card leg, outside the transaction ───────────────────────────────
    if (split.cardInr > 0 && wallet.card) {
      const charge = await this.provider.charge({
        amountInr: split.cardInr,
        instrumentRef: `${wallet.card.brand}:${wallet.card.last4}:${wallet.card.name}`,
        reference: inv.number,
        idempotencyKey: `${intentId}:card`,
      });

      if (charge.status !== 'succeeded') {
        // ── card payment failure / processor timeout / payment reversed ─────
        // The wallet leg goes back before anything else happens. A citizen
        // whose card was declined must not find their balance short as well.
        await this.reverseWalletLeg(userId, inv, split.walletInr, intentId);
        await this.prisma.paymentIntent.updateMany({
          where: { id: intentId, userId },
          data: {
            status: 'failed',
            providerRef: charge.providerRef ?? null,
            failureCode: charge.code ?? 'provider_error',
            failureMessage: charge.message ?? 'The payment could not be completed.',
          },
        });
        throw new BadRequestException(
          charge.code === 'processor_timeout'
            ? 'The payment processor did not answer. Nothing has been taken — your wallet is exactly as it was.'
            : `${charge.message ?? 'That card was refused.'} Nothing has been taken.`,
        );
      }

      // The card leg lands in the citizen's own ledger too, so the Financial
      // hub's statement shows the whole payment rather than the wallet half.
      await this.financial.charge(userId, {
        hub: SPEND_HUB, category: SPEND_CATEGORY,
        label: `Invoice ${inv.number}`, amountInr: split.cardInr, method: 'card',
      });
      await this.prisma.paymentIntent.updateMany({
        where: { id: intentId, userId },
        data: { providerRef: charge.providerRef ?? null },
      });
    }

    // ── it worked ───────────────────────────────────────────────────────────
    await this.settle(userId, inv, intentId, due);
    return this.result(userId, inv.id, intentId, false);
  }

  /**
   * Money is in. Write down every consequence of that in one transaction.
   *
   * The invoice's paid total, the attempt's success, the business's ledger and
   * the payout batch it belongs to either all exist or none of them do. Split
   * across four writes, a failure in the middle produces a citizen who has paid
   * and a business that will never be settled — reconcilable only by hand, and
   * only if anybody notices.
   */
  private async settle(userId: string, inv: InvoiceRow, intentId: string, amountInr: number) {
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentIntent.updateMany({
        where: { id: intentId, userId, status: { not: 'succeeded' } },
        data: { status: 'succeeded', capturedAt: this.clock.now() },
      });
      /* The paid total is written under the row lock from a read taken under
         the same lock, never from an earlier snapshot; paidAt is decided from
         that figure (5 Sep). Serialised by SELECT … FOR UPDATE (lockInvoice). */
      await lockInvoice(tx, inv.id);
      const before = await tx.invoice.findFirst({ where: { id: inv.id, userId }, select: { paidInr: true, totalInr: true } });
      const paidNow = (before?.paidInr ?? inv.paidInr) + amountInr;
      await tx.invoice.updateMany({
        where: { id: inv.id, userId },
        data: {
          paidInr: paidNow,
          ...(paidNow >= (before?.totalInr ?? inv.totalInr) ? { paidAt: this.clock.now() } : {}),
        },
      });
      await this.settlement.recordSale(tx, {
        listingId: inv.listingId, ownerId: inv.ownerId,
        invoiceId: inv.id, invoiceNumber: inv.number,
        paymentIntentId: intentId, grossInr: amountInr,
        today: this.clock.now(),
      });
    });

    const paidNow = inv.paidInr + amountInr;
    const full = paidNow >= inv.totalInr;
    const money = `₹${amountInr.toLocaleString('en-IN')}`;

    // The thread reads as a conversation afterwards: the bill, then the receipt.
    await this.invoices.deliver(inv, {
      side: 'seeker',
      body: full ? `Paid ${money} — invoice ${inv.number}.` : `Part paid ${money} towards invoice ${inv.number}.`,
      kind: 'invoice_paid',
      title: full ? 'Payment successful' : 'Part payment received',
      notice: `${money} paid · invoice ${inv.number}.`,
    });

    // And the business is told, on its own screen, with the settlement date it
    // actually cares about. §21: the citizen never sees this half.
    await this.notifications.create({
      userId: inv.ownerId,
      kind: 'invoice_paid_business',
      title: `${money} received`,
      body: `Invoice ${inv.number} · settlement scheduled for the next working day.`,
      href: `/services/${inv.listingId}/payments`,
      entityId: inv.id,
    });
  }

  /**
   * PUTTING THE WALLET LEG BACK.
   *
   * A credit and a ledger row, not an `update` that undoes the decrement — the
   * money moved, and a ledger that hides one leg of a round trip is a ledger
   * that cannot be reconciled. The citizen sees the debit and the reversal, in
   * that order, which is what a statement is for.
   */
  private async reverseWalletLeg(userId: string, inv: InvoiceRow, walletInr: number, intentId: string) {
    if (walletInr <= 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.cityWallet.update({
        where: { userId }, data: { balanceInr: { increment: walletInr } },
      });
      await tx.walletTxn.create({
        data: {
          userId, kind: 'refund', amountInr: walletInr,
          hub: SPEND_HUB, category: SPEND_CATEGORY,
          label: `Invoice ${inv.number} — card refused, wallet returned`,
        },
      });
      await tx.paymentIntent.updateMany({
        where: { id: intentId, userId }, data: { walletInr: 0 },
      });
    });
  }

  // ── refunds ───────────────────────────────────────────────────────────────

  /**
   * THE BUSINESS GIVES MONEY BACK.
   *
   * Into the wallet, whichever way it came in. A card refund is the provider's
   * to make and takes days; a wallet credit is instant and is money the citizen
   * can immediately spend in the same city. Doing both — card back to card,
   * wallet back to wallet — is the correct long answer and needs the provider's
   * refund webhook to close the loop; until one exists, one destination that
   * definitely works beats two where one silently does not.
   *
   * The merchant ledger takes the hit as a negative entry rather than by
   * editing the sale. A sale that changes size after the fact is a sale nobody
   * can reconcile against the day it happened.
   */
  async refund(ownerId: string, invoiceId: string, amountInr: number, reason: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, ownerId },
    }) as InvoiceRow | null;
    if (!inv) throw new NotFoundException('invoice not found');

    const refundable = inv.paidInr - inv.refundedInr;
    if (refundable <= 0) throw new BadRequestException('There is nothing on this invoice to refund.');
    if (amountInr > refundable) {
      throw new BadRequestException(`Only ₹${refundable.toLocaleString('en-IN')} of this invoice can still be refunded.`);
    }

    await this.prisma.$transaction(async (tx) => {
      /* ── A REFUND IS CHECKED UNDER THE LOCK IT IS WRITTEN UNDER (5 Sep) ──
         `refundable` above came from a snapshot. Two concurrent full refunds
         both passed it, both credited the wallet (that leg is an atomic
         increment, so the citizen was paid twice), and refundedInr ended at
         one refund's value. Locked, re-read, re-checked; the second one
         finds nothing left and stops before the wallet is touched.
         Serialised by SELECT … FOR UPDATE (lockInvoice). */
      await lockInvoice(tx, inv.id);
      const fresh = await tx.invoice.findFirst({ where: { id: inv.id, ownerId }, select: { paidInr: true, refundedInr: true } });
      const left = (fresh?.paidInr ?? inv.paidInr) - (fresh?.refundedInr ?? inv.refundedInr);
      if (amountInr > left) {
        throw new ConflictException(left <= 0
          ? 'This invoice was just refunded. Nothing is left to return.'
          : `Only ₹${left.toLocaleString('en-IN')} of this invoice can still be refunded.`);
      }
      await tx.invoice.updateMany({
        where: { id: inv.id, ownerId }, data: { refundedInr: (fresh?.refundedInr ?? inv.refundedInr) + amountInr },
      });
      await tx.cityWallet.upsert({
        where: { userId: inv.userId },
        update: { balanceInr: { increment: amountInr } },
        create: { userId: inv.userId, balanceInr: amountInr },
      });
      await tx.walletTxn.create({
        data: {
          userId: inv.userId, kind: 'refund', amountInr,
          hub: SPEND_HUB, category: SPEND_CATEGORY,
          label: `Refund · invoice ${inv.number}`,
        },
      });
      await this.settlement.recordRefund(tx, {
        listingId: inv.listingId, ownerId, invoiceId: inv.id,
        amountInr, note: `Refund on ${inv.number} — ${reason}`,
        today: this.clock.now(),
      });
    });

    await this.invoices.deliver(inv, {
      body: `Refunded ₹${amountInr.toLocaleString('en-IN')} on invoice ${inv.number}. ${reason}`,
      kind: 'invoice_refunded',
      title: 'Refunded',
      notice: `₹${amountInr.toLocaleString('en-IN')} is back in your wallet. ${reason}`,
    });
    return this.invoices.detail(ownerId, inv.id);
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  /** The invoice, if it is addressed to this citizen and has been sent. */
  private async load(userId: string, invoiceId: string): Promise<InvoiceRow> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, userId, sentAt: { not: null } },
    }) as InvoiceRow | null;
    if (!inv) throw new NotFoundException('invoice not found');
    return inv;
  }

  /**
   * THE RECEIPT — what the success screen and every replay of it are drawn from.
   *
   * A replayed payment returns the same object as the first one, flagged. The
   * flag exists for the client, not the citizen: a sheet that reopened after a
   * dropped connection should show the receipt rather than a second charge, and
   * should know it did not just take the money.
   */
  private async result(userId: string, invoiceId: string, intentId: string, replayed: boolean) {
    const [intent, invoice, wallet] = await Promise.all([
      this.prisma.paymentIntent.findFirst({ where: { id: intentId, userId } }),
      this.invoices.detail(userId, invoiceId),
      this.financial.wallet(userId),
    ]);
    if (!intent) throw new NotFoundException('payment not found');
    return {
      paid: intent.status === 'succeeded',
      replayed,
      invoice,
      payment: {
        id: intent.id,
        status: intent.status,
        amountInr: intent.amountInr,
        walletInr: intent.walletInr,
        cardInr: intent.cardInr,
        transactionRef: maskRef(intent.id),
        at: intent.createdAt.toISOString(),
        failureMessage: intent.failureMessage ?? undefined,
      },
      balanceInr: wallet.balanceInr,
    };
  }
}

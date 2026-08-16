import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ORDER_HISTORY_CAP } from '../shared/paging';
import { customerLabel } from '../local-services/alias';
import { priceInvoice, statusOf, outstandingInr, PAYABLE, type InvoiceStatus } from './money';
import { isUniqueViolation } from '../financial/financial.service';
import type { CreateInvoiceDto, UpdateInvoiceDto } from './dto/commerce.dto';

/** Every state an invoice can be in, in the order a business thinks about them. */
export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'draft', 'sent', 'viewed', 'part_paid', 'paid', 'overdue', 'cancelled', 'refunded',
] as const;

/**
 * The words on the chips, in one place.
 *
 * The server owns them rather than the client for the same reason
 * `readDetails` owns its field labels: two copies of a vocabulary drift, and
 * the one that drifts is always the one nobody is looking at.
 */
export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Seen',
  part_paid: 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

interface InvoiceRow {
  id: string; listingId: string; ownerId: string; userId: string; number: string;
  subtotalInr: number; discountInr: number; taxInr: number; extraInr: number;
  totalInr: number; paidInr: number; refundedInr: number;
  notes: string | null; dueOn: Date | null;
  sentAt: Date | null; viewedAt: Date | null; paidAt: Date | null;
  cancelledAt: Date | null; cancelReason: string | null;
  createdAt: Date; updatedAt: Date;
}

/**
 * THE INVOICE, FROM BOTH SIDES.
 *
 * A business writes it, a citizen pays it, and the two of them see genuinely
 * different objects — the same rule the anonymity work established next door.
 * The business sees who it billed. The citizen sees the business's name, the
 * lines, and what is owed. Neither is handed the other's private column, and
 * that is done by returning different shapes rather than by blanking fields,
 * because a blanked field is a field somebody will one day un-blank.
 *
 * WHAT DOES NOT LIVE HERE: money moving. Every rupee is `payments.service.ts`,
 * so the file that can change a balance is one file and it is short.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── ownership ─────────────────────────────────────────────────────────────

  /**
   * The listing, if it is theirs. The same shape as the local-services hub's
   * own `own()`, copied rather than imported for the reason VerificationService
   * gives about its narrower copy: this service should not grow opinions about
   * menus or opening hours, and importing the whole listing service to ask one
   * question is how it would.
   */
  private async ownListing(ownerId: string, listingId: string) {
    const l = await this.prisma.serviceListing.findUnique({
      where: { id: listingId },
      select: { id: true, ownerId: true, businessName: true, categoryKey: true, moderation: true, photosJson: true },
    });
    if (!l) throw new NotFoundException('listing not found');
    if (l.ownerId !== ownerId) throw new ForbiddenException('not your listing');
    return l;
  }

  /** An invoice the caller owns as the business. */
  private async ownInvoice(ownerId: string, id: string): Promise<InvoiceRow> {
    const inv = await this.prisma.invoice.findFirst({ where: { id, ownerId } }) as InvoiceRow | null;
    if (!inv) throw new NotFoundException('invoice not found');
    return inv;
  }

  // ── shaping ───────────────────────────────────────────────────────────────

  private statusNow(inv: InvoiceRow): InvoiceStatus {
    return statusOf(inv, this.clock.now());
  }

  /** The half of an invoice both sides agree on. */
  private common(inv: InvoiceRow) {
    const status = this.statusNow(inv);
    return {
      id: inv.id,
      number: inv.number,
      status,
      statusLabel: STATUS_LABEL[status],
      subtotalInr: inv.subtotalInr,
      discountInr: inv.discountInr,
      taxInr: inv.taxInr,
      extraInr: inv.extraInr,
      totalInr: inv.totalInr,
      paidInr: inv.paidInr,
      refundedInr: inv.refundedInr,
      outstandingInr: outstandingInr(inv),
      payable: PAYABLE.has(status) && outstandingInr(inv) > 0,
      notes: inv.notes ?? undefined,
      dueOn: inv.dueOn ? inv.dueOn.toISOString().slice(0, 10) : undefined,
      cancelReason: inv.cancelReason ?? undefined,
      issuedAt: (inv.sentAt ?? inv.createdAt).toISOString(),
      paidAt: inv.paidAt?.toISOString(),
    };
  }

  /** What the citizen sees. No owner id, no listing internals. */
  citizenCard(inv: InvoiceRow, business: { id: string; businessName: string }) {
    return {
      ...this.common(inv),
      businessName: business.businessName,
      listingId: business.id,
    };
  }

  /** What the business sees. Their customer, named, because they billed them. */
  ownerCard(inv: InvoiceRow, customer: { name: string | null } | undefined, alias: string) {
    return {
      ...this.common(inv),
      customerId: inv.userId,
      customerName: customer?.name ?? alias,
      listingId: inv.listingId,
    };
  }

  // ── who a business may bill ───────────────────────────────────────────────

  /**
   * THE PEOPLE THIS BUSINESS IS ALLOWED TO INVOICE, and it is a short list on
   * purpose: the neighbours who have opened a conversation with it AND chosen
   * to show it their name.
   *
   * This is the constraint the rest of the hub already lives under, applied to
   * money. A business in Local Services is talking to `#7` until `#7` decides
   * otherwise — so a business that could type any citizen's id into an invoice
   * would be a business that can send a bill to a stranger, and the hub's whole
   * promise is that it cannot find one.
   *
   * The cost is real and worth naming: a walk-in customer who has never
   * messaged cannot be billed here. That is the right side to fail on. The
   * neighbour who has to reveal a name before receiving a bill is being asked
   * for something they were going to have to give anyway.
   */
  async billableCustomers(ownerId: string, listingId: string) {
    await this.ownListing(ownerId, listingId);
    const threads = await this.prisma.serviceEnquiry.findMany({
      where: { listingId, revealName: true, closed: false },
      orderBy: { lastMessageAt: 'desc' },
      take: ORDER_HISTORY_CAP,
      select: { seekerId: true, alias: true, lastMessageAt: true },
    });
    if (threads.length === 0) return { items: [] };

    const people = await this.prisma.user.findMany({
      where: { id: { in: threads.map((t) => t.seekerId) } },
      take: ORDER_HISTORY_CAP,
      select: { id: true, name: true },
    });
    const byId = new Map(people.map((p) => [p.id, p.name]));

    return {
      items: threads.map((t) => ({
        id: t.seekerId,
        name: byId.get(t.seekerId) ?? customerLabel(t.alias),
        alias: customerLabel(t.alias),
        lastSpokeAt: t.lastMessageAt.toISOString(),
      })),
    };
  }

  /** Is this citizen someone that business may bill? Used before every write. */
  private async assertBillable(listingId: string, customerId: string) {
    const thread = await this.prisma.serviceEnquiry.findUnique({
      where: { listingId_seekerId: { listingId, seekerId: customerId } },
      select: { revealName: true },
    });
    if (!thread?.revealName) {
      throw new BadRequestException(
        'You can only invoice a neighbour who has messaged you and shown you their name.',
      );
    }
  }

  // ── the business's own list ───────────────────────────────────────────────

  /**
   * EVERY INVOICE THIS BUSINESS HAS WRITTEN, newest first, filtered by status.
   *
   * Filtering happens in memory rather than in the WHERE, and that is a
   * deliberate trade rather than laziness: `overdue` and `paid` are COMPUTED
   * from what has happened (see money.ts), not stored, so a SQL filter on a
   * status column would be filtering on a value that does not exist. The cap
   * above it is what keeps that honest.
   */
  async businessInvoices(ownerId: string, listingId: string, status?: string) {
    await this.ownListing(ownerId, listingId);
    const rows = await this.prisma.invoice.findMany({
      where: { listingId, ownerId },
      orderBy: { createdAt: 'desc' },
      take: ORDER_HISTORY_CAP,
    }) as InvoiceRow[];

    const [people, aliases] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
        take: ORDER_HISTORY_CAP,
        select: { id: true, name: true },
      }),
      this.prisma.serviceEnquiry.findMany({
        where: { listingId, seekerId: { in: [...new Set(rows.map((r) => r.userId))] } },
        take: ORDER_HISTORY_CAP,
        select: { seekerId: true, alias: true },
      }),
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    const aliasById = new Map(aliases.map((a) => [a.seekerId, customerLabel(a.alias)]));

    const items = rows
      .map((r) => this.ownerCard(r, byId.get(r.userId), aliasById.get(r.userId) ?? 'A neighbour'))
      .filter((r) => !status || status === 'all' || r.status === status);

    // The counts are of EVERYTHING, not of the filtered view — a tab reading
    // "Overdue" beside a zero it computed from its own filtered rows would
    // always read zero.
    const counts: Record<string, number> = { all: rows.length };
    for (const s of INVOICE_STATUSES) counts[s] = 0;
    for (const r of rows) counts[this.statusNow(r)] += 1;

    return { items, counts };
  }

  // ── the citizen's own list ────────────────────────────────────────────────

  /**
   * THE BILLS ADDRESSED TO ME. Drafts are absent, and their absence is the
   * feature: an invoice a business has not sent is a business's private
   * working-out, and a citizen who could see one would be reading over a
   * shoulder.
   */
  async myInvoices(userId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { userId, sentAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: ORDER_HISTORY_CAP,
    }) as InvoiceRow[];
    if (rows.length === 0) return { items: [], dueInr: 0 };

    const listings = await this.prisma.serviceListing.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.listingId))] } },
      take: ORDER_HISTORY_CAP,
      select: { id: true, businessName: true },
    });
    const byId = new Map(listings.map((l) => [l.id, l]));

    const items = rows.map((r) =>
      this.citizenCard(r, byId.get(r.listingId) ?? { id: r.listingId, businessName: 'A business' }));

    return {
      items,
      // unbounded: a sum over the rows already fetched above, not a second read.
      dueInr: items.filter((i) => i.payable).reduce((s, i) => s + i.outstandingInr, 0),
    };
  }

  // ── one invoice, from whichever side is asking ────────────────────────────

  /**
   * ONE INVOICE, AND READING IT IS AN EVENT.
   *
   * `viewedAt` is stamped the first time the citizen it is addressed to opens
   * it, and only then — the business opening its own invoice is not the
   * business's customer looking at it, and a Seen chip that lights up when you
   * look at your own work is a chip that means nothing.
   *
   * A STRANGER GETS 404, NOT 403. The same choice `sideOf` makes next door: a
   * 403 confirms the id was real, and an invoice id is a number somebody could
   * count through.
   */
  async detail(userId: string, id: string) {
    // Scoped in the query rather than checked after it: the two parties are
    // named in the WHERE, so a later edit that moves the check cannot widen
    // what this reads.
    const inv = await this.prisma.invoice.findFirst({
      where: { id, OR: [{ userId }, { ownerId: userId }] },
    }) as InvoiceRow | null;
    if (!inv) throw new NotFoundException('invoice not found');
    const mine = inv.userId === userId;
    const theirs = inv.ownerId === userId;
    if (!mine && !theirs) throw new NotFoundException('invoice not found');
    // A draft belongs to nobody but its author until it is sent.
    if (!inv.sentAt && !theirs) throw new NotFoundException('invoice not found');

    if (mine && inv.sentAt && !inv.viewedAt) {
      await this.prisma.invoice.updateMany({
        where: { id, userId, viewedAt: null },
        data: { viewedAt: this.clock.now() },
      });
      inv.viewedAt = this.clock.now();
    }

    const [items, listing, payments] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { invoiceId: id }, orderBy: { position: 'asc' }, take: 40,
      }),
      this.prisma.serviceListing.findUnique({
        where: { id: inv.listingId },
        select: { id: true, businessName: true, slug: true, categoryKey: true },
      }),
      // `userId` is the payer, and every attempt against one invoice is by the
      // same person — so naming them costs nothing and keeps the read scoped.
      this.prisma.paymentIntent.findMany({
        where: { invoiceId: id, userId: inv.userId },
        orderBy: { createdAt: 'desc' },
        take: ORDER_HISTORY_CAP,
      }),
    ]);

    const base = mine
      ? this.citizenCard(inv, listing ?? { id: inv.listingId, businessName: 'A business' })
      : this.ownerCard(inv, await this.prisma.user.findUnique({
          where: { id: inv.userId }, select: { name: true },
        }) ?? undefined, 'A neighbour');

    return {
      ...base,
      side: mine ? ('customer' as const) : ('business' as const),
      businessHref: listing ? `/services/${listing.slug ?? listing.id}` : undefined,
      items: items.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description ?? undefined,
        qty: it.qty,
        unitPriceInr: it.unitPriceInr,
        amountInr: it.amountInr,
      })),
      /**
       * EVERY ATTEMPT, NOT EVERY SUCCESS — and the failed ones are the point.
       * A citizen whose card was declined at 11:04 and who paid at 11:06 has
       * two rows here, and a support conversation that can see both takes a
       * minute instead of an afternoon. The citizen's copy carries no
       * provider reference; theirs is the transaction id below it.
       */
      payments: payments.map((p) => ({
        id: p.id,
        status: p.status,
        amountInr: p.amountInr,
        walletInr: p.walletInr,
        cardInr: p.cardInr,
        refundedInr: p.refundedInr,
        at: p.createdAt.toISOString(),
        failureMessage: p.failureMessage ?? undefined,
        /** TCX8••••21 — enough to quote, not enough to be a key. */
        transactionRef: p.status === 'succeeded' ? maskRef(p.id) : undefined,
        ...(theirs && p.providerRef ? { providerRef: p.providerRef } : {}),
      })),
    };
  }

  // ── writing one ───────────────────────────────────────────────────────────

  async create(ownerId: string, listingId: string, dto: CreateInvoiceDto) {
    const listing = await this.ownListing(ownerId, listingId);
    if (listing.moderation === 'removed') {
      throw new BadRequestException('This listing is closed. Reopen it before billing anybody.');
    }
    await this.assertBillable(listingId, dto.customerId);
    const totals = priceInvoice(dto);
    const data = {
      listingId, ownerId, userId: dto.customerId,
      subtotalInr: totals.subtotalInr, discountInr: totals.discountInr,
      taxInr: totals.taxInr, extraInr: totals.extraInr, totalInr: totals.totalInr,
      notes: dto.notes ?? null,
      dueOn: dto.dueOn ? dayFrom(dto.dueOn) : null,
      items: { create: totals.items },
    };

    /**
     * THE UNIQUE INDEX IS THE MECHANISM, not a lookup — the same argument
     * `topUp` makes about idempotency keys. Checking whether `TC-10482` is
     * taken and then inserting it is a read-then-write, and two businesses
     * billing in the same second both find it free and both insert. Postgres
     * refuses the second, and that refusal is what this loop is for.
     */
    const base = 10_000 + await this.prisma.invoice.count();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const created = await this.prisma.invoice.create({
          data: { ...data, number: `TC-${base + attempt}` },
        });
        return await this.detail(ownerId, created.id);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    throw new BadRequestException('Could not start a new invoice just now. Try again in a moment.');
  }

  /**
   * EDITING, AND ONLY WHILE IT IS A DRAFT.
   *
   * An invoice somebody has been sent is a document, not a form. Changing the
   * total under a citizen who is looking at it is the thing `expectInr` exists
   * to catch at payment time, and the better answer is that it cannot happen:
   * a sent invoice is cancelled and rewritten, which leaves both documents in
   * the history where a disagreement can be settled by reading them.
   */
  async update(ownerId: string, id: string, dto: UpdateInvoiceDto) {
    const inv = await this.ownInvoice(ownerId, id);
    if (inv.sentAt) {
      throw new BadRequestException('This invoice has been sent. Cancel it and write a new one — the person you billed is looking at this copy.');
    }
    if (dto.customerId) await this.assertBillable(inv.listingId, dto.customerId);

    const items = dto.items
      ?? (await this.prisma.invoiceItem.findMany({
        where: { invoiceId: id }, orderBy: { position: 'asc' }, take: 40,
      })).map((it) => ({
        name: it.name, description: it.description ?? undefined, qty: it.qty, unitPriceInr: it.unitPriceInr,
      }));

    const totals = priceInvoice({
      items,
      discountInr: dto.discountInr ?? inv.discountInr,
      taxRateBp: dto.taxRateBp ?? rateBpOf(inv),
      extraInr: dto.extraInr ?? inv.extraInr,
    });

    await this.prisma.$transaction(async (tx) => {
      // The scalars are updated through `updateMany` so `sentAt: null` can sit
      // in the WHERE — a compare-and-set, not a read-then-write. If the invoice
      // went out between the check above and this line, it matches no rows and
      // the lines below write nothing into a document somebody already has.
      const touched = await tx.invoice.updateMany({
        where: { id, ownerId, sentAt: null },
        data: {
          ...(dto.customerId ? { userId: dto.customerId } : {}),
          subtotalInr: totals.subtotalInr, discountInr: totals.discountInr,
          taxInr: totals.taxInr, extraInr: totals.extraInr, totalInr: totals.totalInr,
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          ...(dto.dueOn !== undefined ? { dueOn: dto.dueOn ? dayFrom(dto.dueOn) : null } : {}),
        },
      });
      if (touched.count !== 1) return;
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({
        data: totals.items.map((it) => ({
          invoiceId: id,
          name: it.name,
          description: it.description ?? null,
          qty: it.qty,
          unitPriceInr: it.unitPriceInr,
          amountInr: it.amountInr,
          position: it.position,
        })),
      });
    });
    return this.detail(ownerId, id);
  }

  /**
   * SEND IT.
   *
   * Three things happen and they are ordered by what a failure costs. The
   * invoice is stamped first, inside a conditional update that makes a double
   * press a no-op. Then the card goes into the conversation the two of them
   * already have. Then the notification. A failure after the stamp leaves an
   * invoice that is sent and quiet, which the citizen still finds in their
   * list — the reverse order would leave somebody notified about a bill that
   * does not exist.
   */
  async send(ownerId: string, id: string) {
    const inv = await this.ownInvoice(ownerId, id);
    if (inv.cancelledAt) throw new BadRequestException('This invoice was cancelled.');
    if (inv.totalInr <= 0) throw new BadRequestException('An invoice needs a total above zero before it can go anywhere.');
    if (inv.sentAt) return this.detail(ownerId, id);
    await this.assertBillable(inv.listingId, inv.userId);

    const stamped = await this.prisma.invoice.updateMany({
      where: { id, ownerId, sentAt: null },
      data: { sentAt: this.clock.now() },
    });
    if (stamped.count !== 1) return this.detail(ownerId, id);

    const listing = await this.prisma.serviceListing.findUnique({
      where: { id: inv.listingId }, select: { businessName: true },
    });
    const name = listing?.businessName ?? 'A business';
    await this.deliver(inv, {
      body: `${name} has sent you invoice ${inv.number} for ₹${inv.totalInr.toLocaleString('en-IN')}.`,
      kind: 'invoice_sent',
      title: 'New invoice',
      notice: `${name} has sent you an invoice for ₹${inv.totalInr.toLocaleString('en-IN')}.`,
    });
    return this.detail(ownerId, id);
  }

  /**
   * Put the invoice where the conversation is, then tell them it is there.
   *
   * The thread is the delivery channel rather than the chat hub, because the
   * thread is the room these two people already share — Local Services keeps
   * its conversations out of `/chats` deliberately, and routing a bill through
   * the chat hub would carry a citizen's name into the one place this hub
   * promises it does not go.
   */
  async deliver(
    inv: { id: string; listingId: string; userId: string },
    say: { body: string; kind: string; title: string; notice: string; side?: 'seeker' | 'owner' },
  ): Promise<void> {
    const thread = await this.prisma.serviceEnquiry.findUnique({
      where: { listingId_seekerId: { listingId: inv.listingId, seekerId: inv.userId } },
      select: { id: true },
    });
    const side = say.side ?? 'owner';
    if (thread) {
      await this.prisma.$transaction([
        this.prisma.serviceMessage.create({
          data: { enquiryId: thread.id, senderSide: side, body: say.body, invoiceId: inv.id },
        }),
        this.prisma.serviceEnquiry.update({
          where: { id: thread.id },
          data: {
            lastMessageAt: this.clock.now(),
            // The unread count belongs to whoever did NOT write the line.
            ...(side === 'owner' ? { seekerUnread: { increment: 1 } } : { ownerUnread: { increment: 1 } }),
          },
        }),
      ]);
    }
    await this.notifications.create({
      userId: inv.userId,
      kind: say.kind,
      title: say.title,
      body: say.notice,
      href: `/financial/invoices/${inv.id}`,
      entityId: inv.id,
    });
  }

  /**
   * CANCELLING, WITH A REASON THE CITIZEN READS.
   *
   * An invoice with money against it cannot be cancelled — that is a refund,
   * and refunding is a different act with a different record. Saying so is
   * better than a `cancelled` chip on a document somebody has paid.
   */
  async cancel(ownerId: string, id: string, reason: string) {
    const inv = await this.ownInvoice(ownerId, id);
    if (inv.paidInr > 0) {
      throw new BadRequestException('This invoice has been part paid. Refund it instead — cancelling would leave their money with no document against it.');
    }
    if (inv.cancelledAt) return this.detail(ownerId, id);

    await this.prisma.invoice.updateMany({
      where: { id, ownerId, cancelledAt: null, paidInr: 0 },
      data: { cancelledAt: this.clock.now(), cancelReason: reason },
    });

    if (inv.sentAt) {
      const listing = await this.prisma.serviceListing.findUnique({
        where: { id: inv.listingId }, select: { businessName: true },
      });
      const name = listing?.businessName ?? 'A business';
      await this.deliver(inv, {
        body: `${name} cancelled invoice ${inv.number}. ${reason}`,
        kind: 'invoice_cancelled',
        title: 'Invoice cancelled',
        notice: `${name} cancelled ${inv.number}. ${reason}`,
      });
    }
    return this.detail(ownerId, id);
  }

  /** Deleting a draft. Only ever a draft — anything sent is a document. */
  async removeDraft(ownerId: string, id: string) {
    const inv = await this.ownInvoice(ownerId, id);
    if (inv.sentAt) throw new BadRequestException('This invoice has been sent. Cancel it rather than deleting it.');
    await this.prisma.invoice.deleteMany({ where: { id, ownerId, sentAt: null } });
    return { ok: true };
  }

}

/**
 * TCX8••••21 — a reference somebody can read down a phone.
 *
 * The full id is a uuid and stays one; this is the shape the brief asks for and
 * the shape every card statement in the country already uses. It is derived
 * rather than stored because it carries no information the id does not.
 */
export const maskRef = (id: string): string => {
  const clean = id.replace(/-/g, '').toUpperCase();
  return `TCX${clean.slice(0, 1)}••••${clean.slice(-2)}`;
};

/** YYYY-MM-DD to the day itself, at UTC midnight, for a `date` column. */
export function dayFrom(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * The tax RATE an existing invoice was written at, recovered from its amounts.
 *
 * The rate is not stored — the amount is, because the amount is what the
 * document says. Editing a draft has to re-price it, and re-pricing needs the
 * rate back. Recovered rather than added as a column: a column would be a
 * second source of truth for a number that is already implied, and it would
 * disagree the first time somebody edited one of the two.
 */
export function rateBpOf(inv: { subtotalInr: number; discountInr: number; taxInr: number }): number {
  const taxable = inv.subtotalInr - inv.discountInr;
  if (taxable <= 0 || inv.taxInr <= 0) return 0;
  return Math.round((inv.taxInr * 10_000) / taxable);
}

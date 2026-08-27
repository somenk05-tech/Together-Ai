import {
  BadRequestException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FinancialService } from '../financial/financial.service';
import { PaymentsService } from '../commerce/payments.service';
import { ClockService } from '../shared/clock/clock.service';
import { AiService } from '../ai/ai.service';
import { swallowed } from '../shared/swallow';
import { findAllergen } from '../shared/allergens';
import { isUniqueViolation } from '../financial/financial.service';
import { LocalServicesService } from './local-services.service';
import { VerificationService } from './verification.service';
import { FREE_ORDERS_BEFORE_VERIFIED, gateLifted } from './trust';
import type {
  AcceptOrderDto, CancelOrderDto, PlaceOrderDto, QuoteOrderDto, RecommendDto, RejectOrderDto,
} from './dto/orders.dto';

/**
 * THE ORDER ENGINE — a published menu becomes something a citizen can hold a
 * kitchen to, inside the thread the two of them already share.
 *
 * WHAT IT STANDS ON, rather than reinvents:
 *   · the thread   — ServiceEnquiry, alias and all. The order card lands there,
 *     the talking happens there, and the citizen stays "#7" unless they choose
 *     otherwise. What the kitchen needs to cook (name, phone, address for a
 *     delivery) travels ON THE ORDER, shared explicitly at checkout for this
 *     one business — never by renaming the thread.
 *   · the till     — Invoice → PaymentIntent, wallet leg first, idempotency
 *     keys, merchant ledger, settlements. An order is PAID AT SUBMIT through
 *     that rail, so "accepted" never means "now chase the money", and a
 *     rejection is a refund through the same machinery that took the payment.
 *   · the menu     — live availability. Nothing sold out can be quoted, placed
 *     or recommended, and every price is read from the table at quote time and
 *     charged only if it is still true at submit (`expectInr`).
 *
 * THE STATE MACHINE WALKS FORWARD ONLY:
 *   submitted → accepted → preparing → ready → completed
 *   submitted → rejected  (the owner's no — full refund, reason read verbatim)
 *   submitted → cancelled (the citizen's while it is still just a request)
 * transitions() below is the single arbiter; no route takes a status from a
 * request body, and every step stamps its own column.
 */

type MenuItemRow = {
  id: string; listingId: string; section: string | null; name: string;
  description: string | null; priceInr: number | null; available: boolean;
  veg: string | null; spice: number | null; photoUrl: string | null;
  prepMinutes: number | null; variantsJson: string | null; addonsJson: string | null;
};

type ListingRow = {
  id: string; ownerId: string; businessName: string; moderation: string; categoryKey: string;
  businessType: string | null; createdAt: Date;
};

type OrderRow = {
  id: string; listingId: string; userId: string; enquiryId: string; number: string;
  status: string; fulfilment: string; itemsJson: string; subtotalInr: number;
  platformFeeInr: number; deliveryFeeInr: number; totalInr: number;
  prepMinutes: number | null; note: string | null; customerName: string; phone: string | null;
  addressText: string | null; lat: number | null; lng: number | null;
  rejectReason: string | null; cancelReason: string | null; adjustmentNote: string | null;
  invoiceId: string; submittedAt: Date; acceptedAt: Date | null; preparingAt: Date | null;
  readyAt: Date | null; completedAt: Date | null; rejectedAt: Date | null; cancelledAt: Date | null;
};

/** A snapshot line — what was agreed, immune to every later menu edit. */
export interface OrderLine {
  name: string;
  qty: number;
  unitPriceInr: number;
  variant?: string;
  addons?: Array<{ name: string; priceInr: number }>;
  lineTotalInr: number;
}

interface NamedPrice { name: string; priceInr: number }

/**
 * THE TWO FLAT FEES (owner, 24 Aug) — ₹20 platform on every order, ₹50
 * delivery on delivery orders. Declared once, ITEMIZED EVERYWHERE THE NUMBER
 * APPEARS — the quote, the checkout, the order card, the invoice's own
 * extra line — and never only in the charge: the promise priceLines made
 * ("the day a fee exists it appears HERE, named") comes due today. The
 * merchant side is untouched: the city's per-sale commission stays where the
 * settlement service already takes it.
 */
export const PLATFORM_FEE_INR = 20;
export const DELIVERY_FEE_INR = 50;

const feesFor = (fulfilment: 'delivery' | 'pickup') => ({
  platformFeeInr: PLATFORM_FEE_INR,
  deliveryFeeInr: fulfilment === 'delivery' ? DELIVERY_FEE_INR : 0,
});

/** The one arbiter. Everything a status may become, from where it is. */
export function transitions(status: string): readonly string[] {
  switch (status) {
    case 'submitted': return ['accepted', 'rejected', 'cancelled'];
    case 'accepted': return ['preparing'];
    case 'preparing': return ['ready'];
    case 'ready': return ['completed'];
    default: return [];
  }
}

/** What the citizen is told a state means. One wording, server-owned. */
export const ORDER_STATUS_LINE: Record<string, string> = {
  submitted: 'Sent to the kitchen — waiting for them to accept.',
  accepted: 'Accepted. They are on it.',
  preparing: 'Being prepared now.',
  ready: 'Ready.',
  completed: 'Completed.',
  rejected: 'The business said no — the payment came straight back to your wallet.',
  cancelled: 'Cancelled before the kitchen took it — the payment came straight back to your wallet.',
};

const parseNamed = (json: string | null): NamedPrice[] => {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is NamedPrice => !!v && typeof (v as NamedPrice).name === 'string'
        && typeof (v as NamedPrice).priceInr === 'number')
      .slice(0, 12);
  } catch { return []; }
};

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly financial: FinancialService,
    private readonly payments: PaymentsService,
    private readonly clock: ClockService,
    private readonly ai: AiService,
    private readonly services: LocalServicesService,
    private readonly verification: VerificationService,
  ) {}

  // ───────────────────────── pricing ─────────────────────────

  /**
   * Resolve what the citizen picked against the LIVE menu, refusing anything
   * the kitchen cannot currently be held to: an item that is gone, sold out or
   * unpriced, a variant or add-on name the menu no longer lists. The refusals
   * are per-line and name the line, because "your cart has a problem" is not
   * something anybody can fix.
   */
  private async priceLines(listingId: string, picks: QuoteOrderDto['items']): Promise<{
    lines: OrderLine[]; subtotalInr: number;
  }> {
    const rows = await this.prisma.serviceMenuItem.findMany({
      where: { id: { in: picks.map((p) => p.itemId) }, listingId }, take: 30,
    }) as unknown as MenuItemRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));

    const lines: OrderLine[] = [];
    for (const pick of picks) {
      const item = byId.get(pick.itemId);
      if (!item) throw new BadRequestException('One of those items has come off the menu. Reload it and pick again.');
      if (!item.available) throw new BadRequestException(`${item.name} is sold out right now.`);

      let unit = item.priceInr;
      let variant: string | undefined;
      if (pick.variant) {
        const v = parseNamed(item.variantsJson).find((x) => x.name === pick.variant);
        if (!v) throw new BadRequestException(`${item.name} no longer comes as “${pick.variant}”. Reload the menu.`);
        unit = v.priceInr;
        variant = v.name;
      }
      // "Ask" is a conversation, not a checkout. The thread is right there.
      if (unit == null) throw new BadRequestException(`${item.name} has no listed price — ask the business about it instead.`);

      const addonList = parseNamed(item.addonsJson);
      const addons: NamedPrice[] = [];
      for (const name of [...new Set(pick.addons ?? [])]) {
        const a = addonList.find((x) => x.name === name);
        if (!a) throw new BadRequestException(`${item.name} no longer offers “${name}”. Reload the menu.`);
        addons.push(a);
      }

      const lineTotalInr = pick.qty * (unit + addons.reduce((s, a) => s + a.priceInr, 0));
      lines.push({
        name: item.name, qty: pick.qty, unitPriceInr: unit,
        ...(variant ? { variant } : {}),
        ...(addons.length ? { addons } : {}),
        lineTotalInr,
      });
    }

    const subtotalInr = lines.reduce((s, l) => s + l.lineTotalInr, 0);
    // The items alone. The two flat fees are added — NAMED — by quote() and
    // place(), which know the fulfilment; nothing is ever only in the charge.
    return { lines, subtotalInr };
  }

  private async approvedListing(listingId: string): Promise<ListingRow> {
    const l = await this.prisma.serviceListing.findUnique({ where: { id: listingId } }) as ListingRow | null;
    if (!l || l.moderation !== 'approved') throw new NotFoundException('listing not found');
    return l;
  }

  /**
   * FIVE ORDERS, TOTAL, BEFORE VERIFICATION (owner, 24 Aug) — the checkout's
   * sibling of the five-threads-a-day gate, with one deliberate difference: a
   * thread can wait in a queue, but an order moves money the moment it is
   * placed, so the cap is a refusal said to the citizen in one honest
   * sentence, checked at the QUOTE (before anything is typed) and again at
   * place. Rejected and cancelled orders never count — those were never
   * taken. The cap lifts the moment the owner is identity-verified, same rung
   * that opens the inbox.
   */
  private async assertUnderOrderCap(l: ListingRow) {
    const tier = await this.verification.tierOf(l);
    if (gateLifted(tier)) return;
    const taken = await this.prisma.serviceOrder.count({
      where: { listingId: l.id, status: { notIn: ['rejected', 'cancelled'] } },
    });
    if (taken >= FREE_ORDERS_BEFORE_VERIFIED) {
      throw new BadRequestException(
        `${l.businessName} can take ${FREE_ORDERS_BEFORE_VERIFIED} orders before it verifies, and it has them. `
        + 'Message them instead — verifying takes minutes, and your order can follow.',
      );
    }
  }

  // ───────────────────────── the quote ─────────────────────────

  /**
   * What this cart costs and whether the wallet covers it — priced by the
   * server so the number on the button is the number that will be charged.
   */
  async quote(userId: string, listingId: string, dto: QuoteOrderDto) {
    const l = await this.approvedListing(listingId);
    if (l.ownerId === userId) throw new BadRequestException('This is your own business.');
    await this.assertUnderOrderCap(l);
    const priced = await this.priceLines(listingId, dto.items);
    const fees = feesFor(dto.fulfilment ?? 'delivery');
    const totalInr = priced.subtotalInr + fees.platformFeeInr + fees.deliveryFeeInr;
    const wallet = await this.financial.wallet(userId);
    return {
      lines: priced.lines,
      subtotalInr: priced.subtotalInr,
      ...fees,
      totalInr,
      walletInr: wallet.balanceInr,
      card: wallet.card,
      shortfallInr: Math.max(0, totalInr - wallet.balanceInr),
      // The sentence the sheet prints beside the button. Server-owned so the
      // one wording exists.
      shares: 'Placing this order shares your name and phone — and for delivery, your address — with this business only.',
    };
  }

  // ───────────────────────── placing ─────────────────────────

  /**
   * PAY, THEN PROMISE. The invoice is minted quietly, the till takes the money
   * (wallet leg first, card making up any rest, both idempotent), and only
   * then does the order exist for anybody. The one order of writes that can
   * never leave a kitchen cooking against money that was not taken.
   *
   * A retry with the same Idempotency-Key replays the payment, finds the order
   * it already created, cancels the duplicate invoice this attempt minted, and
   * returns the original — charged exactly once, promised exactly once.
   */
  async place(userId: string, listingId: string, dto: PlaceOrderDto, idempotencyKey?: string) {
    const l = await this.approvedListing(listingId);
    if (l.ownerId === userId) throw new BadRequestException('This is your own business.');
    await this.assertUnderOrderCap(l);

    // ── what a delivery needs, said before any money moves ──────────────────
    if (dto.fulfilment === 'delivery') {
      if (!dto.address) throw new BadRequestException('A delivery order needs an address.');
      if (dto.lat == null || dto.lng == null) {
        throw new BadRequestException('Turn on location services to place a delivery order — the pin is how the kitchen checks the address is findable.');
      }
    } else if (dto.address || dto.saveAddress) {
      // Nothing is over-shared by habit: a pickup order carries no address.
      throw new BadRequestException('A pickup order does not take an address.');
    }

    const priced = await this.priceLines(listingId, dto.items);
    const fees = feesFor(dto.fulfilment);
    const totalInr = priced.subtotalInr + fees.platformFeeInr + fees.deliveryFeeInr;
    if (totalInr !== dto.expectInr) {
      throw new BadRequestException(
        `This order now comes to ₹${totalInr.toLocaleString('en-IN')}. Look it over again before placing it.`,
      );
    }

    // ── the thread, made or found — the room the order will live in ─────────
    await this.services.enquire(userId, listingId);
    const enquiry = await this.prisma.serviceEnquiry.findUnique({
      where: { listingId_seekerId: { listingId, seekerId: userId } }, select: { id: true },
    });
    if (!enquiry) throw new BadRequestException('Could not open a conversation with this business.');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const customerName = user?.name ?? 'A customer';

    // ── the quiet invoice — the money's record, not the conversation's ──────
    const invoiceId = await this.mintInvoice(l, userId, priced.lines, {
      subtotalInr: priced.subtotalInr,
      extraInr: fees.platformFeeInr + fees.deliveryFeeInr,
      totalInr,
    });

    // ── the till. Its idempotency is the order's idempotency. ───────────────
    let payment: Awaited<ReturnType<PaymentsService['pay']>>;
    try {
      payment = await this.payments.pay(userId, invoiceId, { expectInr: totalInr, useWallet: true }, idempotencyKey);
    } catch (e) {
      // Nothing was taken (the till already said so, in its own words). The
      // invoice this attempt minted must not sit in anybody's list as owed.
      await this.prisma.invoice.updateMany({
        where: { id: invoiceId, userId, paidInr: 0 },
        data: { status: 'cancelled', cancelledAt: this.clock.now(), cancelReason: 'Order was not placed.' },
      }).catch(swallowed('serviceOrders.cancelUnpaidInvoice', undefined));
      throw e;
    }

    const paidInvoiceId: string = (payment.invoice as { id: string }).id;
    if (payment.replayed && paidInvoiceId !== invoiceId) {
      // This attempt's duplicate invoice dies; the first attempt's order stands.
      await this.prisma.invoice.updateMany({
        where: { id: invoiceId, userId, paidInr: 0 },
        data: { status: 'cancelled', cancelledAt: this.clock.now(), cancelReason: 'Duplicate of a retried order.' },
      }).catch(swallowed('serviceOrders.cancelDuplicateInvoice', undefined));
    }

    // ── the order — created once, healed by retry if a crash split the pair ──
    let order = await this.prisma.serviceOrder.findFirst({ where: { invoiceId: paidInvoiceId, userId } }) as OrderRow | null;
    if (!order) {
      order = await this.mintOrder({
        listing: l, userId, enquiryId: enquiry.id, invoiceId: paidInvoiceId,
        dto, lines: priced.lines, subtotalInr: priced.subtotalInr, fees, totalInr, customerName,
      });

      // The card in the room, then the knock on the door. Both are delivery,
      // not truth — the order and the money already exist if either fails.
      await this.deliverCard(order, l).catch(swallowed('serviceOrders.deliverCard', undefined));
      void this.notifications.create({
        userId: l.ownerId, kind: 'service_order', entityId: order.id,
        title: `New order at ${l.businessName}`,
        body: `${customerName} — ${priced.lines.length} ${priced.lines.length === 1 ? 'item' : 'items'}, ₹${totalInr.toLocaleString('en-IN')}, paid.`,
        href: `/services/messages/${enquiry.id}`,
      });

      // The address outlives the order ONLY because they ticked the box — and
      // it lands on the page of the book they picked (home | work | other).
      // "home" is also mirrored into the legacy MasterProfile.address, so the
      // one place that read it before the book existed keeps reading true.
      if (dto.fulfilment === 'delivery' && dto.saveAddress && dto.address) {
        const label = dto.saveLabel ?? 'home';
        await this.prisma.savedAddress.upsert({
          where: { userId_label: { userId, label } },
          update: { addressText: dto.address, lat: dto.lat ?? null, lng: dto.lng ?? null },
          create: { userId, label, addressText: dto.address, lat: dto.lat ?? null, lng: dto.lng ?? null },
        }).catch(swallowed('serviceOrders.saveAddress', undefined));
        if (label === 'home') {
          await this.prisma.masterProfile.upsert({
            where: { userId },
            update: { address: dto.address },
            create: { userId, address: dto.address },
          }).catch(swallowed('serviceOrders.saveHomeMirror', undefined));
        }
      }
    }

    return { order: this.shape(order, 'seeker'), threadId: enquiry.id };
  }

  /** TC- invoice numbering's sibling, same unique-index-is-the-mechanism loop.
   *  The two flat fees ride in `extraInr` — the till's own after-tax line — so
   *  the invoice's arithmetic says exactly what the checkout said. */
  private async mintInvoice(l: ListingRow, userId: string, lines: OrderLine[], money: {
    subtotalInr: number; extraInr: number; totalInr: number;
  }): Promise<string> {
    const items = lines.map((line, position) => ({
      name: line.variant ? `${line.name} (${line.variant})` : line.name,
      description: line.addons?.length ? `with ${line.addons.map((a) => a.name).join(', ')}` : null,
      qty: line.qty,
      unitPriceInr: Math.round(line.lineTotalInr / line.qty),
      amountInr: line.lineTotalInr,
      position,
    }));
    const base = 10_000 + await this.prisma.invoice.count();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const created = await this.prisma.invoice.create({
          data: {
            listingId: l.id, ownerId: l.ownerId, userId,
            number: `TC-${base + attempt}`,
            // Born sent: an order's invoice was never a draft anybody edits,
            // and the till only accepts payment against a sent invoice.
            status: 'sent', sentAt: this.clock.now(),
            subtotalInr: money.subtotalInr, extraInr: money.extraInr, totalInr: money.totalInr,
            notes: money.extraInr > 0
              ? `Paid at checkout for an order. Includes the flat ₹${PLATFORM_FEE_INR} platform fee${money.extraInr > PLATFORM_FEE_INR ? ` and ₹${DELIVERY_FEE_INR} delivery fee` : ''}.`
              : 'Paid at checkout for an order.',
            items: { create: items },
          },
        });
        return created.id;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    throw new BadRequestException('Could not start this order just now. Try again in a moment.');
  }

  private async mintOrder(args: {
    listing: ListingRow; userId: string; enquiryId: string; invoiceId: string;
    dto: PlaceOrderDto; lines: OrderLine[]; subtotalInr: number;
    fees: { platformFeeInr: number; deliveryFeeInr: number }; totalInr: number; customerName: string;
  }): Promise<OrderRow> {
    const { listing, userId, enquiryId, invoiceId, dto, lines, subtotalInr, fees, totalInr, customerName } = args;
    const base = 10_000 + await this.prisma.serviceOrder.count();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.prisma.serviceOrder.create({
          data: {
            listingId: listing.id, userId, enquiryId, invoiceId,
            number: `TCO-${base + attempt}`,
            fulfilment: dto.fulfilment,
            itemsJson: JSON.stringify(lines),
            subtotalInr,
            platformFeeInr: fees.platformFeeInr,
            deliveryFeeInr: fees.deliveryFeeInr,
            totalInr,
            note: dto.note?.trim() || null,
            customerName,
            phone: dto.phone,
            addressText: dto.fulfilment === 'delivery' ? dto.address ?? null : null,
            lat: dto.lat ?? null, lng: dto.lng ?? null,
            submittedAt: this.clock.now(),
          },
        }) as unknown as OrderRow;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    throw new BadRequestException('Could not start this order just now. Try again in a moment.');
  }

  /** The card in the thread — a sentence first, upgraded by orderId. */
  private async deliverCard(order: OrderRow, l: ListingRow) {
    const lines = (JSON.parse(order.itemsJson) as OrderLine[])
      .map((x) => `· ${x.name}${x.variant ? ` (${x.variant})` : ''} × ${x.qty} — ₹${x.lineTotalInr.toLocaleString('en-IN')}`);
    /* NO NAME AND NO ADDRESS IN THE BODY, deliberately. A seeker's thread
       messages survive their own deletion precisely because "there is no
       identity in those rows to destroy" (purge-plan.ts) — so the sentence
       carries items and money only, and everything the citizen shared lives
       on the ORDER row, which the purge takes with them. The card the owner
       sees fetches that row live; when it is gone, this sentence is what
       remains, and it identifies nobody. */
    const fees = [
      ...(order.deliveryFeeInr > 0 ? [`· Delivery fee — ₹${order.deliveryFeeInr}`] : []),
      ...(order.platformFeeInr > 0 ? [`· Platform fee — ₹${order.platformFeeInr}`] : []),
    ];
    const body = [
      `Order ${order.number} · ₹${order.totalInr.toLocaleString('en-IN')} · paid`,
      ...lines,
      ...fees,
      order.fulfilment === 'delivery' ? 'Delivery — address on the order card.' : 'Pickup',
      ...(order.note ? [`Note: ${order.note}`] : []),
    ].join('\n');
    await this.prisma.$transaction([
      this.prisma.serviceMessage.create({
        data: { enquiryId: order.enquiryId, senderSide: 'seeker', body, orderId: order.id },
      }),
      this.prisma.serviceEnquiry.update({
        where: { id: order.enquiryId },
        data: { lastMessageAt: this.clock.now(), ownerUnread: { increment: 1 } },
      }),
    ]);
    void l; // name already used by the caller's notification
  }

  // ───────────────────────── reading ─────────────────────────

  private async sided(userId: string, orderId: string): Promise<{ o: OrderRow; l: ListingRow; side: 'seeker' | 'owner' }> {
    // An order has exactly two legitimate readers — the citizen who placed it
    // and the owner of the listing it was placed at — and the WHERE now says
    // so, rather than reading any row by id and deciding afterwards. A
    // stranger's id matches neither arm and no row comes back at all.
    const o = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, OR: [{ userId }, { listing: { ownerId: userId } }] },
    }) as OrderRow | null;
    if (!o) throw new NotFoundException('order not found');
    const l = await this.prisma.serviceListing.findUnique({ where: { id: o.listingId } }) as ListingRow | null;
    if (!l) throw new NotFoundException('order not found');
    if (o.userId === userId) return { o, l, side: 'seeker' };
    if (l.ownerId === userId) return { o, l, side: 'owner' };
    // A 404 and not a 403 — an order you are not part of is an order you
    // cannot know exists, same rule as the thread it lives in.
    throw new NotFoundException('order not found');
  }

  /**
   * One order, shaped for whichever side is looking. The citizen's identity
   * fields exist ONLY in the owner's copy — the citizen knows their own
   * address, and their copy of the wire is one more place it could travel from.
   */
  private shape(o: OrderRow, side: 'seeker' | 'owner') {
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      statusLine: ORDER_STATUS_LINE[o.status] ?? o.status,
      fulfilment: o.fulfilment,
      lines: JSON.parse(o.itemsJson) as OrderLine[],
      subtotalInr: o.subtotalInr,
      platformFeeInr: o.platformFeeInr,
      deliveryFeeInr: o.deliveryFeeInr,
      totalInr: o.totalInr,
      prepMinutes: o.prepMinutes,
      note: o.note,
      adjustmentNote: o.adjustmentNote,
      rejectReason: o.rejectReason,
      cancelReason: o.cancelReason,
      enquiryId: o.enquiryId,
      listingId: o.listingId,
      submittedAt: o.submittedAt.toISOString(),
      acceptedAt: o.acceptedAt?.toISOString() ?? null,
      preparingAt: o.preparingAt?.toISOString() ?? null,
      readyAt: o.readyAt?.toISOString() ?? null,
      completedAt: o.completedAt?.toISOString() ?? null,
      rejectedAt: o.rejectedAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      /** What the citizen may still do; what the owner may still do. */
      next: transitions(o.status),
      ...(side === 'owner' ? {
        customerName: o.customerName,
        phone: o.phone,
        addressText: o.addressText,
        lat: o.lat, lng: o.lng,
      } : {}),
    };
  }

  async one(userId: string, orderId: string) {
    const { o, side } = await this.sided(userId, orderId);
    return this.shape(o, side);
  }

  async mine(userId: string) {
    const rows = await this.prisma.serviceOrder.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 100,
    }) as unknown as OrderRow[];
    // unbounded: `in:` of the distinct listings on the page of orders above,
    // which its take: 100 already bounds.
    const listings = await this.prisma.serviceListing.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.listingId))] } },
      select: { id: true, businessName: true },
    });
    const names = new Map(listings.map((x) => [x.id, x.businessName]));
    return { orders: rows.map((o) => ({ ...this.shape(o, 'seeker'), businessName: names.get(o.listingId) ?? '' })) };
  }

  async forBusiness(ownerId: string, listingId: string) {
    const l = await this.prisma.serviceListing.findUnique({ where: { id: listingId } }) as ListingRow | null;
    if (!l || l.ownerId !== ownerId) throw new NotFoundException('listing not found');
    const rows = await this.prisma.serviceOrder.findMany({
      where: { listingId, listing: { ownerId } }, orderBy: { createdAt: 'desc' }, take: 200,
    }) as unknown as OrderRow[];
    const open = rows.filter((o) => ['submitted', 'accepted', 'preparing', 'ready'].includes(o.status));
    const done = rows.filter((o) => !['submitted', 'accepted', 'preparing', 'ready'].includes(o.status));
    return {
      open: open.map((o) => this.shape(o, 'owner')),
      done: done.slice(0, 50).map((o) => this.shape(o, 'owner')),
    };
  }

  // ───────────────────────── the owner's verbs ─────────────────────────

  /**
   * ACCEPT — with, at most, agreed removals. An accept can make an order
   * SMALLER and refund the difference in the same breath; it can never make
   * one larger, because a bigger order is a new decision the citizen has not
   * paid for. The Coke-for-Pepsi case at the same price is a note, not a line
   * edit — the thread is where it was agreed, the note is where it is recorded.
   */
  async accept(ownerId: string, orderId: string, dto: AcceptOrderDto) {
    const { o, l, side } = await this.sided(ownerId, orderId);
    if (side !== 'owner') throw new NotFoundException('order not found');
    this.mustAllow(o, 'accepted');

    let lines = JSON.parse(o.itemsJson) as OrderLine[];
    let refundInr = 0;
    const removed: OrderLine[] = [];
    if (dto.removeLines?.length) {
      const drop = new Set(dto.removeLines);
      for (const [i, line] of lines.entries()) if (drop.has(i)) removed.push(line);
      if (removed.length === lines.length) {
        throw new BadRequestException('That removes everything. Reject the order instead, with the reason.');
      }
      refundInr = removed.reduce((s, x) => s + x.lineTotalInr, 0);
      lines = lines.filter((_, i) => !drop.has(i));
    }

    const now = this.clock.now();
    const touched = await this.prisma.serviceOrder.updateMany({
      // status in the WHERE: a compare-and-set, so two taps or two devices
      // cannot accept twice or revive a cancellation that landed first. The
      // listing's owner is in it too, so the write can only ever land on an
      // order taken at a business this caller owns.
      where: { id: o.id, status: 'submitted', listing: { ownerId } },
      data: {
        status: 'accepted', acceptedAt: now,
        prepMinutes: dto.prepMinutes ?? null,
        adjustmentNote: dto.adjustmentNote?.trim() || null,
        ...(removed.length ? {
          itemsJson: JSON.stringify(lines),
          subtotalInr: o.subtotalInr - refundInr,
          totalInr: o.totalInr - refundInr,
        } : {}),
      },
    });
    if (touched.count !== 1) throw new BadRequestException('This order has already moved on.');

    if (refundInr > 0) {
      // Through the till, so the merchant ledger and the citizen's wallet agree.
      await this.payments.refund(ownerId, o.invoiceId, refundInr,
        `${removed.map((x) => x.name).join(', ')} unavailable — removed from order ${o.number}.`);
    }

    const eta = dto.prepMinutes ? ` About ${dto.prepMinutes} minutes.` : '';
    const changed = removed.length
      ? ` ${removed.map((x) => x.name).join(', ')} came off — ₹${refundInr.toLocaleString('en-IN')} is back in your wallet.`
      : '';
    await this.say(o, 'owner', `Order ${o.number} accepted.${eta}${changed}${dto.adjustmentNote ? ` ${dto.adjustmentNote.trim()}` : ''}`);
    void this.notifications.create({
      userId: o.userId, kind: 'service_order_update', entityId: o.id,
      title: `${l.businessName} accepted your order`,
      body: `${o.number}.${eta}${changed}`.trim(),
      href: `/services/messages/${o.enquiryId}`,
    });
    return this.one(ownerId, o.id);
  }

  /** REJECT — the owner's no, with the money back before the sentence ends. */
  async reject(ownerId: string, orderId: string, dto: RejectOrderDto) {
    const { o, l, side } = await this.sided(ownerId, orderId);
    if (side !== 'owner') throw new NotFoundException('order not found');
    this.mustAllow(o, 'rejected');

    const touched = await this.prisma.serviceOrder.updateMany({
      where: { id: o.id, status: 'submitted', listing: { ownerId } },
      data: { status: 'rejected', rejectedAt: this.clock.now(), rejectReason: dto.reason.trim() },
    });
    if (touched.count !== 1) throw new BadRequestException('This order has already moved on.');

    await this.payments.refund(ownerId, o.invoiceId, o.totalInr, `Order ${o.number} rejected: ${dto.reason.trim()}`);

    await this.say(o, 'owner', `Order ${o.number} rejected — ${dto.reason.trim()}. ₹${o.totalInr.toLocaleString('en-IN')} is back in your wallet.`);
    void this.notifications.create({
      userId: o.userId, kind: 'service_order_update', entityId: o.id,
      title: `${l.businessName} could not take your order`,
      body: `${dto.reason.trim()} — ₹${o.totalInr.toLocaleString('en-IN')} refunded to your wallet.`,
      href: `/services/messages/${o.enquiryId}`,
    });
    return this.one(ownerId, o.id);
  }

  /** The kitchen's progress — one step forward at a time, each step stamped. */
  async advance(ownerId: string, orderId: string, to: 'preparing' | 'ready' | 'completed') {
    const { o, l, side } = await this.sided(ownerId, orderId);
    if (side !== 'owner') throw new NotFoundException('order not found');
    this.mustAllow(o, to);

    const stamp = to === 'preparing' ? { preparingAt: this.clock.now() }
      : to === 'ready' ? { readyAt: this.clock.now() }
        : { completedAt: this.clock.now() };
    const touched = await this.prisma.serviceOrder.updateMany({
      where: { id: o.id, status: o.status, listing: { ownerId } },
      data: { status: to, ...stamp },
    });
    if (touched.count !== 1) throw new BadRequestException('This order has already moved on.');

    const note = to === 'preparing' ? 'is being prepared'
      : to === 'ready' ? (o.fulfilment === 'delivery' ? 'is ready and on its way' : 'is ready to collect')
        : 'is completed';
    void this.notifications.create({
      userId: o.userId, kind: 'service_order_update', entityId: o.id,
      title: `Your order ${note}`,
      body: `${o.number} · ${l.businessName}`,
      href: `/services/messages/${o.enquiryId}`,
    });
    return this.one(ownerId, o.id);
  }

  /** The citizen's cancel — only while the kitchen has not said yes. */
  async cancel(userId: string, orderId: string, dto: CancelOrderDto) {
    const { o, l, side } = await this.sided(userId, orderId);
    if (side !== 'seeker') throw new NotFoundException('order not found');
    if (o.status !== 'submitted') {
      throw new BadRequestException('The kitchen has already taken this order. Message them — they can still help.');
    }

    const touched = await this.prisma.serviceOrder.updateMany({
      where: { id: o.id, status: 'submitted', userId },
      data: { status: 'cancelled', cancelledAt: this.clock.now(), cancelReason: dto.reason?.trim() || null },
    });
    if (touched.count !== 1) throw new BadRequestException('This order has already moved on.');

    // The refund runs under the listing owner's book — it is their sale being
    // unwound — but the act is the citizen's, and the reason says so.
    await this.payments.refund(l.ownerId, o.invoiceId, o.totalInr,
      `Order ${o.number} cancelled by the customer before acceptance.`);

    await this.say(o, 'seeker', `Order ${o.number} cancelled${dto.reason?.trim() ? ` — ${dto.reason.trim()}` : ''}.`);
    void this.notifications.create({
      userId: l.ownerId, kind: 'service_order_update', entityId: o.id,
      title: `Order ${o.number} was cancelled`,
      body: 'Cancelled before acceptance. The payment has been returned.',
      href: `/services/messages/${o.enquiryId}`,
    });
    return this.one(userId, o.id);
  }

  private mustAllow(o: OrderRow, to: string) {
    if (!transitions(o.status).includes(to)) {
      throw new BadRequestException(`This order is ${o.status}; it cannot become ${to}.`);
    }
  }

  /** A plain line in the thread — history both sides keep, card-free. */
  private async say(o: OrderRow, side: 'seeker' | 'owner', body: string) {
    await this.prisma.$transaction([
      this.prisma.serviceMessage.create({ data: { enquiryId: o.enquiryId, senderSide: side, body } }),
      this.prisma.serviceEnquiry.update({
        where: { id: o.enquiryId },
        data: {
          lastMessageAt: this.clock.now(),
          ...(side === 'owner' ? { seekerUnread: { increment: 1 } } : { ownerUnread: { increment: 1 } }),
        },
      }),
    ]).catch(swallowed('serviceOrders.say', undefined));
  }

  // ───────────────────────── the recommender ─────────────────────────

  /**
   * "Vegetarian, not too spicy, ₹800 for two." THE MODEL PROPOSES AND THE LIVE
   * MENU DISPOSES, twice over: it is shown only items that are available and
   * priced, and whatever it answers is filtered against that same set again —
   * an invented id, a sold-out dish or a hallucinated name simply cannot come
   * back out. Declared allergens are screened deterministically BEFORE the
   * call, with the same shared matcher every other hub uses, and the screen is
   * named in the answer so a wrong match can be corrected rather than trusted.
   */
  async recommend(userId: string, listingId: string, dto: RecommendDto) {
    await this.approvedListing(listingId);
    const rows = await this.prisma.serviceMenuItem.findMany({
      where: { listingId, available: true, priceInr: { not: null } },
      orderBy: { sortOrder: 'asc' }, take: 300,
    }) as unknown as MenuItemRow[];
    if (!rows.length) throw new BadRequestException('Nothing on this menu can be ordered right now.');

    const profile = await this.prisma.masterProfile.findUnique({
      where: { userId }, select: { foodAllergens: true },
    });
    const declared = (profile?.foodAllergens ?? '').split(',').map((s) => s.trim()).filter(Boolean);

    const screened: Array<{ name: string; because: string }> = [];
    const safe = rows.filter((r) => {
      const hit = declared.length ? findAllergen(r.name, r.description ? [r.description] : [], declared) : null;
      if (hit) screened.push({ name: r.name, because: hit.term });
      return !hit;
    });
    if (!safe.length) {
      throw new BadRequestException('Everything orderable here matches an allergen you declared. Ask the business directly — menus know less than kitchens do.');
    }

    const out = await this.ai.recommendFromMenu({
      brief: dto.brief,
      items: safe.map((r) => ({
        id: r.id, name: r.name, section: r.section, description: r.description,
        priceInr: r.priceInr as number, veg: r.veg, spice: r.spice,
      })),
    });
    if (!out.ok) {
      throw new ServiceUnavailableException(
        out.reason === 'off'
          ? 'The recommender is switched off on this server. The menu is all there — pick by hand.'
          : 'The recommender could not be reached just now. The menu is all there — pick by hand.',
      );
    }

    // The second filter. Only ids from the safe set survive, at sane
    // quantities, and the total is OUR arithmetic, never the model's.
    const byId = new Map(safe.map((r) => [r.id, r]));
    const picks = out.picks
      .filter((p) => byId.has(p.id))
      .slice(0, 12)
      .map((p) => {
        const item = byId.get(p.id) as MenuItemRow;
        const qty = Math.min(6, Math.max(1, Math.trunc(p.qty)));
        return {
          itemId: item.id, name: item.name, section: item.section,
          description: item.description, priceInr: item.priceInr as number,
          veg: item.veg, spice: item.spice, qty,
          lineTotalInr: qty * (item.priceInr as number),
        };
      });
    if (!picks.length) throw new ServiceUnavailableException('The recommender did not manage a usable answer. The menu is all there — pick by hand.');

    return {
      picks,
      totalInr: picks.reduce((s, p) => s + p.lineTotalInr, 0),
      why: out.why,
      ...(screened.length ? {
        screened: screened.map((s) => `${s.name} — left out because you told us about ${s.because}`),
      } : {}),
      caveat: 'Suggestions from the live menu, at listed prices. Nothing is ordered until you place it.',
    };
  }
}

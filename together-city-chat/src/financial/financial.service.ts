import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import type { PrismaTx } from '../shared/prisma/prisma-tx';
import { LEDGER_CAP, SPEND_LOG_CAP } from '../shared/paging';
import type { AddSpendLogDto, SetBudgetDto } from './dto/financial.dto';

/** Spend categories — one per commerce-producing hub. */
export const CATEGORIES = [
  { key: 'nutrition', label: 'Nutrition', hint: 'Groceries & meal orders', defaultBudget: 8000 },
  { key: 'beauty', label: 'Beauty', hint: 'Skincare & haircare', defaultBudget: 3000 },
  { key: 'medical', label: 'Medical', hint: 'Consults & care', defaultBudget: 4000 },
  { key: 'dating', label: 'Dating', hint: 'Chat unlocks & boosts', defaultBudget: 1000 },
  { key: 'entertainment', label: 'Entertainment', hint: 'Events & tickets', defaultBudget: 4000 },
  { key: 'travel', label: 'Travel', hint: 'Trips & flights', defaultBudget: 60000 },
  { key: 'dining', label: 'Dining', hint: 'Restaurants & food orders', defaultBudget: 6000 },
  // The Till: invoices from businesses in the Local Services directory. It is
  // a spend category like any other, and it is here so the Spending page's
  // percentages are shares of something they are actually shares of — money
  // paid to a plumber lands in `cityTotal` whether or not it has a heading.
  { key: 'services', label: 'Local services', hint: 'Invoices from businesses near you', defaultBudget: 5000 },
] as const;

/**
 * Central rate card for fixed-price city services. This is the ONE place to
 * update prices or add new chargeable services — every hub charges through here,
 * so the whole city's pricing lives in a single config. (Cart-priced flows like
 * groceries and the beauty market pass their own computed total instead.)
 */
export const SERVICE_RATES: Record<string, { label: string; hub: string; category: string; amountInr: number; note: string }> = {
  datingChatUnlock: { label: 'Dating chat unlock', hub: 'Dating', category: 'dating', amountInr: 199, note: 'Unlock messaging with a new match.' },
  // Add future services here — rates update in one place.
};

export interface Txn { id: string; date: string; hub: string; category: string; label: string; amountInr: number; direction: 'debit' | 'credit' }
export type PayMethod = 'wallet' | 'card';
export interface ChargeInput { hub: string; category: string; label: string; amountInr: number; method?: PayMethod }

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;

/**
 * A unique-constraint violation, whatever shape the client reports it in.
 *
 * Prisma raises `PrismaClientKnownRequestError` with `code === 'P2002'`. Reading
 * the code off an `unknown` rather than importing the error class keeps this
 * true when the generated client is regenerated, and keeps the tests free of a
 * real Prisma dependency — they throw an object with the code, which is exactly
 * what the driver does.
 */
export function isUniqueViolation(e: unknown): boolean {
  return Boolean(e && typeof e === 'object' && (e as { code?: unknown }).code === 'P2002');
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureWalletOn(db: PrismaTx, userId: string) {
    return db.cityWallet.upsert({ where: { userId }, update: {}, create: { userId, balanceInr: 0 } });
  }

  private async ensureWallet(userId: string) {
    return this.ensureWalletOn(this.prisma, userId);
  }

  /**
   * The unified payment rail. Every hub's checkout pays from the one city wallet
   * through here — it enforces balance, deducts, and records a single payment in
   * the central ledger. Throws 400 if the wallet can't cover it (→ top up).
   *
   * Pass `tx` to charge INSIDE a caller's transaction, so that taking the money
   * and recording what it bought either both happen or neither does. Without it
   * the charge is still atomic in itself, just not with whatever follows.
   */
  async charge(userId: string, input: ChargeInput, tx?: PrismaTx) {
    if (tx) return this.chargeOn(tx, userId, input);
    // No annotation on `t` — let TypeScript infer Prisma's own callback type.
    // Naming a hand-written one here is what broke the build before.
    return this.prisma.$transaction((t) => this.chargeOn(t, userId, input));
  }

  /**
   * Charge + whatever the purchase creates, in ONE transaction.
   *
   * Every checkout in the city used to charge the wallet and then create its
   * order row as a separate write. If that second write failed — a constraint, a
   * dropped connection, a bad payload — the money was gone and the order did not
   * exist, with nothing to reconcile it against and no refund path. This closes
   * that window.
   *
   * `work` must do database work ONLY. Sending mail or calling an AI provider
   * inside a transaction holds a connection open across a network call and will
   * trip Prisma's transaction timeout under any real load; do that after this
   * resolves, where a failure costs a receipt rather than an order.
   */
  async paid<T>(userId: string, input: ChargeInput, work: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.chargeOn(tx, userId, input);
      return work(tx);
    });
  }

  /**
   * Can this citizen pay this amount right now? Throws the same 400 charge()
   * would, without taking anything.
   *
   * For flows that spend something expensive — an AI generation, a third-party
   * lookup — before there is anything to charge for. Check first, do the work,
   * then charge with paid(). Two callers can still race past this and only one
   * succeed at the real charge, which is correct: this is a courtesy check, not
   * a reservation. What makes that true is the conditional deduction in
   * chargeOn — before it, both callers succeeded and the wallet went negative.
   */
  async assertCanPay(userId: string, amountInr: number, method?: PayMethod): Promise<void> {
    const wallet = await this.ensureWallet(userId);
    if (method === 'card') {
      if (!wallet.cardLast4) throw new BadRequestException('No card linked. Link a card or pay from your wallet.');
      return;
    }
    if (wallet.balanceInr < amountInr) {
      throw new BadRequestException(`Insufficient wallet balance. Top up ₹${amountInr - wallet.balanceInr} more, or pay by card.`);
    }
  }

  /**
   * Take the money.
   *
   * THE DEDUCTION IS THE CHECK. It used to be two steps — read the balance,
   * compare it, then decrement — and two steps are not one step, because
   * Postgres runs at Read Committed and a transaction is not a lock. Two
   * charges arriving together both read ₹500, both decide ₹500 covers ₹500,
   * and both decrement: the citizen spends ₹1,000 and the column lands on
   * −₹500, which nothing in the schema forbids. Two taps on Pay, or two tabs,
   * is all it takes — and every checkout in the city (restaurants, travel,
   * groceries, dating, astrology, entertainment) pays through this one method.
   *
   * `updateMany` with the balance in the WHERE is the whole fix: Postgres
   * evaluates the condition and writes the row under the same lock, so a second
   * charge matches no rows and takes nothing. `count` is then the answer to
   * "did I get the money", and it is the only answer trusted here.
   *
   * The read above it stays, for the message. Knowing somebody is ₹80 short is
   * worth a query; it is just not worth authorising a payment on.
   */
  private async chargeOn(db: PrismaTx, userId: string, input: ChargeInput) {
    const wallet = await this.ensureWalletOn(db, userId);
    const method: PayMethod = input.method === 'card' ? 'card' : 'wallet';
    if (method === 'card') {
      if (!wallet.cardLast4) throw new BadRequestException('No card linked. Link a card or pay from your wallet.');
      await db.walletTxn.create({ data: { userId, kind: 'payment', amountInr: input.amountInr, hub: input.hub, category: input.category, label: `${input.label} · card ••${wallet.cardLast4}` } });
      return { paid: true, balanceInr: wallet.balanceInr, method };
    }

    const short = input.amountInr - wallet.balanceInr;
    if (short > 0) {
      throw new BadRequestException(`Insufficient wallet balance. Top up ₹${short} more, or pay by card.`);
    }

    const taken = await db.cityWallet.updateMany({
      where: { userId, balanceInr: { gte: input.amountInr } },
      data: { balanceInr: { decrement: input.amountInr } },
    });
    if (taken.count !== 1) {
      // It covered the amount a moment ago and does not now: another payment
      // landed in between. The same message as above, because from the
      // citizen's side the two situations are the same one.
      throw new BadRequestException('Insufficient wallet balance. Top up, or pay by card.');
    }

    await db.walletTxn.create({ data: { userId, kind: 'payment', amountInr: input.amountInr, hub: input.hub, category: input.category, label: input.label } });
    const after = await db.cityWallet.findUnique({ where: { userId }, select: { balanceInr: true } });
    return { paid: true, balanceInr: after?.balanceInr ?? wallet.balanceInr - input.amountInr, method };
  }

  async getCard(userId: string) {
    const w = await this.ensureWallet(userId);
    return w.cardLast4 ? { brand: w.cardBrand, last4: w.cardLast4, name: w.cardName } : null;
  }

  async linkCard(userId: string, input: { brand?: string; last4?: string; name?: string }) {
    await this.ensureWallet(userId);
    const w = await this.prisma.cityWallet.update({
      where: { userId },
      data: { cardBrand: input.brand ?? 'Visa', cardLast4: (input.last4 ?? '4242').slice(-4), cardName: input.name ?? 'City Card' },
    });
    return { brand: w.cardBrand, last4: w.cardLast4, name: w.cardName };
  }

  async removeCard(userId: string) {
    await this.ensureWallet(userId);
    await this.prisma.cityWallet.update({ where: { userId }, data: { cardBrand: null, cardLast4: null, cardName: null } });
    return { ok: true };
  }

  /**
   * Ledger entries as a unified feed (payments = debit, top-ups = credit).
   *
   * `limit` caps the STATEMENT view only. The month and spending calculations
   * deliberately read the whole ledger: capping there would quietly under-report
   * what someone has spent, and a wrong number is worse than a slow query.
   */
  private async ledger(userId: string, limit?: number): Promise<Txn[]> {
    const txns = await this.prisma.walletTxn.findMany({
      where: { userId },
      ...(limit ? { orderBy: { createdAt: 'desc' as const }, take: limit } : {}),
    });
    return txns.map((t) => ({
      id: t.id, date: t.createdAt.toISOString(),
      hub: t.hub ?? 'Wallet', category: t.category ?? 'wallet',
      label: t.label ?? (t.kind === 'topup' ? 'Wallet top-up' : t.kind === 'refund' ? 'Refund' : 'Payment'),
      amountInr: t.amountInr, direction: t.kind === 'payment' ? 'debit' : 'credit',
    }));
  }

  private debits(all: Txn[]) { return all.filter((t) => t.direction === 'debit'); }

  async transactions(userId: string): Promise<Txn[]> {
    return (await this.ledger(userId, LEDGER_CAP)).sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  async wallet(userId: string) {
    const wallet = await this.ensureWallet(userId);
    const all = await this.ledger(userId);
    const debits = this.debits(all);
    const now = new Date();
    const thisMonth = debits.filter((d) => monthKey(new Date(d.date)) === monthKey(now));
    return {
      balanceInr: wallet.balanceInr,
      spentThisMonthInr: thisMonth.reduce((s, d) => s + d.amountInr, 0),
      lifetimeSpendInr: debits.reduce((s, d) => s + d.amountInr, 0),
      recent: [...all].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6),
      card: wallet.cardLast4 ? { brand: wallet.cardBrand, last4: wallet.cardLast4, name: wallet.cardName } : null,
    };
  }

  /**
   * Put money in. ONCE, and either both halves or neither.
   *
   * This was two statements outside a transaction: write the ledger row, then
   * increment the balance. Two things follow from that, and both are money.
   *
   * FIRST, IT WAS NOT ATOMIC. A failure between them left a ledger row saying
   * ₹500 arrived and a balance that never moved — the reconciliation the audit
   * asks for would report a discrepancy nobody could act on, because the money
   * was never real. Now the row and the balance move in one transaction, so the
   * ledger is a description of the balance rather than a claim beside it.
   *
   * SECOND, IT WAS NOT REPLAY-SAFE. A charge has been safe since the conditional
   * decrement landed — the balance is in the WHERE, so a second charge takes
   * nothing. A top-up had no such guard, so two taps on "Add ₹500" credited
   * ₹1,000. That is free money, and a double tap on a slow connection is all it
   * takes. A PSP webhook is worse: every processor delivers at least once and
   * therefore sometimes twice, and the audit asks for this BEFORE one is wired,
   * which is the only point at which it is cheap.
   *
   * THE UNIQUE INDEX IS THE MECHANISM, not a lookup. Checking for an existing
   * key and then inserting is a read-then-write, which is the same race this
   * exists to close: two retries arriving together both find nothing and both
   * insert. Postgres refuses the second one, and that refusal is the answer.
   *
   * A replay returns the CURRENT balance and does not throw. The caller is a
   * client that already believes it topped up; telling it "duplicate" invites a
   * retry loop, and telling it the balance is the truth it was asking for.
   */
  async topUp(userId: string, amountInr: number, idempotencyKey?: string) {
    await this.ensureWallet(userId);
    const key = (idempotencyKey ?? '').trim().slice(0, 120) || null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        // idempotencyKey is a new column the sandbox Prisma client's types do
        // not carry yet; the cast is the same one writeCart uses for its own.
        await (tx.walletTxn.create as unknown as (a: { data: Record<string, unknown> }) => Promise<unknown>)({
          data: { userId, kind: 'topup', amountInr, hub: 'Wallet', category: 'wallet', label: 'Wallet top-up', idempotencyKey: key },
        });
        const wallet = await tx.cityWallet.update({ where: { userId }, data: { balanceInr: { increment: amountInr } } });
        return { balanceInr: wallet.balanceInr };
      });
    } catch (e) {
      // P2002 on (userId, idempotencyKey) means this exact attempt already
      // landed. Nothing was credited a second time — which is the entire point
      // — so report where the money actually stands.
      if (key && isUniqueViolation(e)) {
        const w = await this.prisma.cityWallet.findUnique({ where: { userId }, select: { balanceInr: true } });
        return { balanceInr: w?.balanceInr ?? 0, replayed: true as const };
      }
      throw e;
    }
  }

  /** Spend by category for the current month, with previous-month trend. */
  async spending(userId: string) {
    const debits = this.debits(await this.ledger(userId));
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const inMonth = (key: string) => debits.filter((d) => monthKey(new Date(d.date)) === key);
    const thisM = inMonth(monthKey(now));
    const prevM = inMonth(monthKey(prev));
    const sumBy = (list: Txn[], cat: string) => list.filter((d) => d.category === cat).reduce((s, d) => s + d.amountInr, 0);
    const cityTotal = thisM.reduce((s, d) => s + d.amountInr, 0);
    const cityPrev = prevM.reduce((s, d) => s + d.amountInr, 0);

    /**
     * THE HAND-WRITTEN HALF, COUNTED IN THE TOTAL AND NAMED SEPARATELY.
     *
     * A log entry has no category and cannot be given one — see the schema
     * note — so it cannot join `byCategory` without inventing a heading the
     * citizen never chose. It joins the TOTAL, because "what did I spend this
     * month" is a question about money and not about who moved it, and it is
     * reported on its own line so no per-category figure is ever quietly wrong.
     *
     * That is also why the percentages below are computed against the CITY
     * total rather than the combined one: a category showing 32% of a number
     * that includes uncategorised cash would be describing a share of something
     * it is not a share of.
     */
    const [loggedThis, loggedPrev] = await Promise.all([
      this.loggedInMonth(userId, monthKey(now)),
      this.loggedInMonth(userId, monthKey(prev)),
    ]);
    const total = cityTotal + loggedThis.amountInr;
    const prevTotal = cityPrev + loggedPrev.amountInr;

    return {
      totalInr: total,
      prevTotalInr: prevTotal,
      trendPct: prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
      /** What the city moved, and what the citizen wrote down. They add to totalInr. */
      cityInr: cityTotal,
      loggedInr: loggedThis.amountInr,
      loggedCount: loggedThis.count,
      byCategory: CATEGORIES.map((c) => {
        const amt = sumBy(thisM, c.key);
        return { category: c.key, label: c.label, hint: c.hint, amountInr: amt, pct: cityTotal ? Math.round((amt / cityTotal) * 100) : 0 };
      }),
      txnCount: thisM.length,
    };
  }

  /** One month of the citizen's own entries, summed. Used by `spending`. */
  private async loggedInMonth(userId: string, key: string) {
    const [y, m] = key.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    // The LIST in spendLog() is capped at SPEND_LOG_CAP; this is arithmetic, and
    // paging.ts's own header says why the two differ — a cap on a list is a slow
    // query avoided, a cap on a computation is a wrong number shipped.
    // unbounded: one citizen's entries for ONE month, summed. The date window IS
    // the bound, and a cap here would under-report a total while looking fine.
    const rows = await this.prisma.spendLogEntry.findMany({
      where: { userId, spentOn: { gte: from, lt: to } },
      select: { amountInr: true },
    });
    return { amountInr: rows.reduce((s, r) => s + r.amountInr, 0), count: rows.length };
  }

  /**
   * THE CITIZEN'S OWN LOG — newest first, and bounded.
   *
   * `SPEND_LOG_CAP` rather than every row ever written: this is the page's
   * list, and a page that fetches four years of entries to show the last fifty
   * gets slower every month it is used. The month totals above do NOT read
   * through this — they aggregate their own window — so the cap can never make
   * a total wrong, which is the failure a capped list usually causes.
   */
  async spendLog(userId: string) {
    const rows = await this.prisma.spendLogEntry.findMany({
      where: { userId },
      orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
      take: SPEND_LOG_CAP,
    });
    return rows.map((r) => ({
      id: r.id,
      spentOn: r.spentOn.toISOString().slice(0, 10),
      note: r.note,
      amountInr: r.amountInr,
    }));
  }

  /**
   * Write one line. The day arrives as YYYY-MM-DD and is stored as that day at
   * UTC midnight — a `date` column, so the time is never read back and cannot
   * drift a row into the wrong month.
   */
  async addSpendLog(userId: string, dto: AddSpendLogDto) {
    const [y, m, d] = dto.spentOn.split('-').map(Number);
    await this.prisma.spendLogEntry.create({
      data: { userId, spentOn: new Date(Date.UTC(y, m - 1, d)), note: dto.note, amountInr: dto.amountInr },
    });
    return this.spendLog(userId);
  }

  /**
   * Remove one line. Scoped by userId in the WHERE and not merely checked after
   * reading — a delete that fetches, compares and then deletes is two round
   * trips and one race; `deleteMany` with both keys is one statement that
   * cannot touch somebody else's row.
   */
  async removeSpendLog(userId: string, id: string) {
    await this.prisma.spendLogEntry.deleteMany({ where: { id, userId } });
    return this.spendLog(userId);
  }

  /** Budgets per category with current-month spend against them. */
  async budgets(userId: string) {
    // unbounded: budgets — one row per category, a handful by design
    const [rows, all] = await Promise.all([this.prisma.budget.findMany({ where: { userId } }), this.ledger(userId)]);
    const debits = this.debits(all);
    const byCat = new Map(rows.map((r) => [r.category, r.monthlyInr]));
    const now = new Date();
    const thisM = debits.filter((d) => monthKey(new Date(d.date)) === monthKey(now));
    const spentBy = (cat: string) => thisM.filter((d) => d.category === cat).reduce((s, d) => s + d.amountInr, 0);
    return CATEGORIES.map((c) => {
      const monthlyInr = byCat.has(c.key) ? (byCat.get(c.key) as number) : c.defaultBudget;
      const spentInr = spentBy(c.key);
      return {
        category: c.key, label: c.label, hint: c.hint, monthlyInr, spentInr,
        pct: monthlyInr ? Math.min(200, Math.round((spentInr / monthlyInr) * 100)) : 0,
        over: spentInr > monthlyInr, isDefault: !byCat.has(c.key),
      };
    });
  }

  /** The rate card — every fixed-price city service and its current price. */
  services() {
    return Object.entries(SERVICE_RATES).map(([key, v]) => ({ key, ...v }));
  }

  /** Look up a service's current price (used by hubs that charge a fixed fee). */
  rate(key: string): number {
    return SERVICE_RATES[key]?.amountInr ?? 0;
  }

  async setBudget(userId: string, dto: SetBudgetDto) {
    await this.prisma.budget.upsert({
      where: { userId_category: { userId, category: dto.category } },
      update: { monthlyInr: dto.monthlyInr },
      create: { userId, category: dto.category, monthlyInr: dto.monthlyInr },
    });
    return this.budgets(userId);
  }
}

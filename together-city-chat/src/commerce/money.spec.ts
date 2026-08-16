import {
  priceInvoice, splitFor, feeFor, nextBusinessDay, dayKey, statusOf, outstandingInr, PAYABLE, FEE,
} from './money';

/**
 * THE ARITHMETIC, PROVED WITHOUT BOOTING ANYTHING.
 *
 * Every number a business or a citizen sees in the Till comes out of money.ts,
 * and money.ts takes no clock, no database and no injection — which is what
 * makes this file possible and why the functions were written that way. A split
 * payment tested through a controller is a test of a controller.
 */

describe('what an invoice comes to', () => {
  // The brief's own example, so the numbers on the page and the numbers here
  // are the same numbers.
  const salon = [
    { name: 'Haircut', qty: 1, unitPriceInr: 1_500 },
    { name: 'Facial', qty: 1, unitPriceInr: 2_000 },
    { name: 'Products', qty: 1, unitPriceInr: 1_350 },
  ];

  it('adds the lines up', () => {
    const t = priceInvoice({ items: salon });
    expect(t.subtotalInr).toBe(4_850);
    expect(t.totalInr).toBe(4_850);
  });

  it('multiplies quantity by unit price on every line', () => {
    const t = priceInvoice({ items: [{ name: 'Wash', qty: 3, unitPriceInr: 250 }] });
    expect(t.items[0].amountInr).toBe(750);
    expect(t.subtotalInr).toBe(750);
  });

  /**
   * THE ORDER IS THE ARGUMENT, and this is the assertion that pins it.
   *
   * Discount first, tax on what is left, extras after tax. Taxing before the
   * discount would charge a customer tax on money they were never asked for —
   * ₹180 here instead of ₹162 — and that is the version somebody disputes.
   */
  it('discounts before it taxes, and adds extras after', () => {
    const t = priceInvoice({ items: [{ name: 'Job', qty: 1, unitPriceInr: 1_000 }], discountInr: 100, taxRateBp: 1_800, extraInr: 50 });
    expect(t.discountInr).toBe(100);
    expect(t.taxInr).toBe(162);          // 18% of 900, not of 1000
    expect(t.totalInr).toBe(900 + 162 + 50);
  });

  it('treats a discount bigger than the bill as a typo, not a credit', () => {
    const t = priceInvoice({ items: [{ name: 'Job', qty: 1, unitPriceInr: 500 }], discountInr: 900 });
    expect(t.discountInr).toBe(500);
    expect(t.totalInr).toBe(0);
  });

  it('keeps the lines in the order they were typed', () => {
    const t = priceInvoice({ items: salon });
    expect(t.items.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(t.items.map((i) => i.name)).toEqual(['Haircut', 'Facial', 'Products']);
  });

  it('rounds the tax once, at the end', () => {
    // 7.5% of 1,333 is 99.975 — one rounding, to 100, not a fraction stored.
    const t = priceInvoice({ items: [{ name: 'x', qty: 1, unitPriceInr: 1_333 }], taxRateBp: 750 });
    expect(Number.isInteger(t.taxInr)).toBe(true);
    expect(t.taxInr).toBe(100);
  });
});

describe('the split', () => {
  it('takes the wallet first and puts the rest on the card', () => {
    // The brief's example: ₹4,850 owed, ₹2,350 in the wallet.
    expect(splitFor({ amountInr: 4_850, balanceInr: 2_350, useWallet: true }))
      .toEqual({ walletInr: 2_350, cardInr: 2_500 });
  });

  it('pays entirely from the wallet when it covers it', () => {
    expect(splitFor({ amountInr: 1_200, balanceInr: 5_000, useWallet: true }))
      .toEqual({ walletInr: 1_200, cardInr: 0 });
  });

  /**
   * A WALLET TOGGLE IS A CHOICE, NOT A CAPABILITY. Somebody with the money
   * still gets to put the whole thing on a card, and a toggle that silently
   * means "if there is enough" is a toggle nobody trusts twice.
   */
  it('pays entirely by card when the citizen says so, however full the wallet', () => {
    expect(splitFor({ amountInr: 1_200, balanceInr: 90_000, useWallet: false }))
      .toEqual({ walletInr: 0, cardInr: 1_200 });
  });

  it('never draws more from the wallet than is in it', () => {
    expect(splitFor({ amountInr: 900, balanceInr: 0, useWallet: true }))
      .toEqual({ walletInr: 0, cardInr: 900 });
  });

  it('always sums to the amount owed', () => {
    for (const amount of [1, 99, 4_850, 100_000]) {
      for (const balance of [0, 1, 4_849, 4_850, 999_999]) {
        const s = splitFor({ amountInr: amount, balanceInr: balance, useWallet: true });
        expect(s.walletInr + s.cardInr).toBe(amount);
        expect(s.walletInr).toBeGreaterThanOrEqual(0);
        expect(s.cardInr).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('what the business actually receives', () => {
  it('shows its working, and the three numbers add up', () => {
    const m = feeFor(4_850);
    expect(m.feeInr).toBe(Math.round((4_850 * FEE.rateBp) / 10_000) + FEE.flatInr);
    expect(m.taxInr).toBe(Math.round((m.feeInr * FEE.taxOnFeeBp) / 10_000));
    expect(m.grossInr - m.feeInr - m.taxInr).toBe(m.netInr);
  });

  /**
   * THE NET IS DERIVED BY SUBTRACTION, not computed independently — otherwise
   * two separate roundings can put the statement a rupee out, and a merchant
   * whose three figures do not add up has no reason to believe any of them.
   */
  it('never leaves a rupee unaccounted for, at any amount', () => {
    for (const gross of [1, 7, 99, 100, 4_850, 12_849, 184_500]) {
      const m = feeFor(gross);
      expect(m.netInr + m.feeInr + m.taxInr).toBe(gross);
    }
  });

  it('charges nothing on nothing', () => {
    expect(feeFor(0)).toEqual({ grossInr: 0, feeInr: 0, taxInr: 0, netInr: 0 });
  });
});

describe('the next working day', () => {
  const on = (iso: string) => dayKey(nextBusinessDay(new Date(`${iso}T00:00:00.000Z`)));

  it('is tomorrow, on a weekday', () => {
    expect(on('2026-08-17')).toBe('2026-08-18');   // Monday → Tuesday
  });

  it('rolls Friday, Saturday and Sunday into the same Monday', () => {
    // Which is why sales are batched by the day they LAND rather than the day
    // they were earned: three days collapse into one payout by construction.
    expect(on('2026-08-14')).toBe('2026-08-17');   // Friday
    expect(on('2026-08-15')).toBe('2026-08-17');   // Saturday
    expect(on('2026-08-16')).toBe('2026-08-17');   // Sunday
  });

  it('reads no clock of its own', () => {
    // The whole reason it takes a date: the Friday case can be tested on a
    // Tuesday. A function that called new Date() could not be.
    const a = nextBusinessDay(new Date('2026-08-14T23:59:59.000Z'));
    const b = nextBusinessDay(new Date('2026-08-14T00:00:00.000Z'));
    expect(dayKey(a)).toBe(dayKey(b));
  });
});

describe('what an invoice says it is', () => {
  const base = {
    totalInr: 4_850, paidInr: 0, refundedInr: 0,
    sentAt: null as Date | null, viewedAt: null as Date | null,
    cancelledAt: null as Date | null, dueOn: null as Date | null,
  };
  const today = new Date('2026-08-16T09:00:00.000Z');
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('is a draft until it is sent', () => {
    expect(statusOf(base, today)).toBe('draft');
  });

  it('is sent, then seen', () => {
    expect(statusOf({ ...base, sentAt: today }, today)).toBe('sent');
    expect(statusOf({ ...base, sentAt: today, viewedAt: today }, today)).toBe('viewed');
  });

  it('is part paid the moment any money lands', () => {
    expect(statusOf({ ...base, sentAt: today, paidInr: 2_350 }, today)).toBe('part_paid');
  });

  /**
   * THE BRIEF'S FIRMEST INSTRUCTION: never Paid until payment is confirmed.
   * The way that promise is kept is that no route can write the word — this
   * function is the only thing that produces it, and it produces it from money.
   */
  it('is paid only when the money is all there', () => {
    expect(statusOf({ ...base, sentAt: today, paidInr: 4_849 }, today)).not.toBe('paid');
    expect(statusOf({ ...base, sentAt: today, paidInr: 4_850 }, today)).toBe('paid');
  });

  it('is overdue the day after it was due, and computes it rather than storing it', () => {
    const due = { ...base, sentAt: today, dueOn: day('2026-08-15') };
    expect(statusOf(due, today)).toBe('overdue');
    // The same row, read a day earlier, is not overdue — which is exactly why
    // this cannot be a column: it becomes true at midnight and no job runs then.
    expect(statusOf(due, new Date('2026-08-14T09:00:00.000Z'))).toBe('sent');
  });

  it('keeps saying part paid when a part-paid invoice goes past its date', () => {
    // The money that DID arrive is the more useful fact. A business chasing the
    // balance knows it is late without being told twice.
    const s = statusOf({ ...base, sentAt: today, paidInr: 2_000, dueOn: day('2026-08-01') }, today);
    expect(s).toBe('part_paid');
  });

  it('says cancelled above everything except money already taken', () => {
    expect(statusOf({ ...base, sentAt: today, cancelledAt: today }, today)).toBe('cancelled');
  });

  it('says refunded once everything paid has gone back', () => {
    expect(statusOf({ ...base, sentAt: today, paidInr: 4_850, refundedInr: 4_850 }, today)).toBe('refunded');
    // A partial refund is not a refunded invoice — the business kept some of it.
    expect(statusOf({ ...base, sentAt: today, paidInr: 4_850, refundedInr: 100 }, today)).toBe('paid');
  });

  it('lets a citizen pay exactly the states that are theirs to pay', () => {
    expect([...PAYABLE].sort()).toEqual(['overdue', 'part_paid', 'sent', 'viewed']);
    expect(PAYABLE.has('draft')).toBe(false);
    expect(PAYABLE.has('cancelled')).toBe(false);
    expect(PAYABLE.has('paid')).toBe(false);
  });

  it('never reports a negative balance owing, even after an overpayment', () => {
    expect(outstandingInr({ totalInr: 100, paidInr: 250 })).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(APP, dir))) {
    const rel = join(dir, e);
    if (statSync(join(APP, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(rel) && !/\.(test|spec)\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}
const TILL = walk('src/features/pay');

/**
 * THE FOUR PROMISES THE TILL MAKES, HELD TO SOURCE.
 *
 * The server has its own guards — money.spec.ts on the arithmetic,
 * payments.spec.ts on the state machine — and neither of them can see a screen.
 * These are the client-side halves, and they are source scans in the same idiom
 * as the rest of this folder: crude on purpose, cheap, and each one pinned to a
 * failure that would otherwise be invisible until somebody's money was involved.
 */
describe('The Till', () => {
  /**
   * NO SCREEN IN HERE DOES ITS OWN MONEY ARITHMETIC.
   *
   * The split lives in one function on the server. A page that computed
   * `total - balance` for itself would be a second copy, and the copy that
   * drifts is always the one nobody is looking at — which in this feature is
   * the number on the Pay button.
   *
   * CreateInvoice is the one exception and it is named here rather than hidden:
   * it prices a document that does not exist yet, so there is nothing to ask
   * the server about, and the server re-prices from the same rules the moment
   * it is created. Nothing downstream ever reads its preview.
   */
  it('computes a payment split nowhere on the client', () => {
    const offenders: string[] = [];
    for (const file of TILL) {
      if (file.endsWith('pages/CreateInvoice.tsx')) continue;
      const code = strip(read(file));
      // The shapes a hand-rolled split takes: subtracting a balance from an
      // amount, or clamping one against the other.
      if (/Math\.min\([^)]*balance/i.test(code) || /-\s*(?:balance|balanceInr)\b/.test(code)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * NOTHING SAYS PAID EXCEPT THE SERVER.
   *
   * The brief's firmest instruction. On the client that means no screen
   * decides the word for itself: every status chip is fed `statusLabel` and
   * `status` straight off the response, and there is no `=== 'paid'` assignment
   * or optimistic 'paid' literal anywhere that could light one up early.
   */
  it('never writes a paid state on the client', () => {
    const offenders: string[] = [];
    for (const file of TILL) {
      const code = strip(read(file));
      // Assigning the word, rather than comparing against it.
      if (/(?:status|setStatus)\s*[:=]\s*'paid'/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * ONE IDEMPOTENCY KEY PER SHEET, AND IT IS MINTED WHERE THE SHEET OPENS.
   *
   * A key minted inside the press handler makes every retry a fresh charge,
   * which is the exact bug idempotency keys exist to prevent — and it would
   * look completely correct in review. So the mint is pinned to the effect that
   * runs on open, and the header is pinned to the client.
   */
  it('mints the payment key when the sheet opens, not when Pay is pressed', () => {
    const sheet = strip(read('src/features/pay/PayInvoiceSheet.tsx'));
    expect(sheet).toMatch(/useEffect\(\(\) => \{[\s\S]{0,120}newPaymentKey\(\)/);
    // …and the press handler reuses it rather than making another.
    const submit = sheet.slice(sheet.indexOf('const submit'), sheet.indexOf('return ('));
    expect(submit).not.toMatch(/newPaymentKey/);

    const client = strip(read('src/features/pay/api.ts'));
    expect(client).toMatch(/'Idempotency-Key'/);
  });

  /**
   * NO CARD NUMBER EVER REACHES A FIELD IN THIS FEATURE.
   *
   * Together City does not hold card credentials, and the way that promise is
   * kept on the client is that there is nowhere to type one. The payout account
   * form is the only bank input in the product and its own screen says the
   * details go straight to the provider.
   */
  it('has no input anywhere that could take a card number', () => {
    const offenders: string[] = [];
    for (const file of TILL) {
      const code = strip(read(file));
      if (/\b(?:cardNumber|cvv|cvc|expiry|expiryMonth|cardExpiry)\b/i.test(code)) offenders.push(file);
      if (/autoComplete=["'](?:cc-number|cc-csc|cc-exp)/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * EVERY SCREEN IN HERE KNOWS A REQUEST CAN BE REFUSED — and says what is
   * still true when one is.
   *
   * The failure-states ratchet next door already requires an `isError` branch.
   * This adds the money-specific half: a citizen who cannot see their invoice
   * is already asking one question, and the answer has to include whether their
   * money moved. Every error branch in the Till says so.
   */
  it('tells a citizen what is still true when a money screen fails', () => {
    const reassured = /nothing has (?:been|changed|moved)|has been (?:paid|taken)|untouched|unaffected/i;
    const offenders: string[] = [];
    for (const file of TILL) {
      if (!file.includes('/pages/')) continue;
      const code = read(file);
      if (!code.includes('isError')) { offenders.push(`${file} — no failure branch`); continue; }
      if (!reassured.test(code)) offenders.push(`${file} — a failure that does not say what is still true`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * THE SPLIT IS ALWAYS TWO VISIBLE LINES.
   *
   * A sheet that showed one number and quietly took part of it from the wallet
   * would be the same feature and a completely different product. Both amounts
   * are rendered, and the wallet row is a real switch with `aria-checked`
   * rather than a styled div, so somebody using a screen reader is told which
   * way it is set.
   */
  it('draws the wallet leg and the card leg as separate amounts', () => {
    const sheet = read('src/features/pay/PayInvoiceSheet.tsx');
    expect(sheet).toMatch(/inr\(q\.walletInr\)/);
    expect(sheet).toMatch(/inr\(q\.cardInr\)/);
    expect(sheet).toMatch(/role="switch"/);
    expect(sheet).toMatch(/aria-checked=\{useWallet\}/);
    // The receipt repeats both, or a split payment has no record a person can read.
    expect(sheet).toMatch(/Wallet used/);
    expect(sheet).toMatch(/Card used/);
  });

  /**
   * THE CITIZEN IS NOT SHOWN THE MERCHANT'S SETTLEMENT.
   *
   * §21. A person paying a salon does not need to know when the salon is
   * banked, and putting it in front of them makes a simple act look like
   * financial infrastructure. The word belongs on the business's screens only.
   */
  it('keeps settlement language off the citizen-facing screens', () => {
    const citizen = [
      'src/features/pay/pages/Invoices.tsx',
      'src/features/pay/PayInvoiceSheet.tsx',
      'src/features/pay/ThreadInvoice.tsx',
    ];
    const offenders = citizen.filter((f) => /settlement|payout/i.test(strip(read(f))));
    expect(offenders).toEqual([]);

    /* THE INVOICE SCREEN IS THE HARD CASE, because one route serves both
       people. Its business half does mention a payout — refunding comes out of
       the next one, which the business needs to know before pressing it — so
       the rule here is not silence but LOCATION: every mention sits inside
       BusinessActions, which only renders when the server said `side` was
       'business'. If one ever moves above that line, a customer starts reading
       merchant plumbing on a screen about their own bill. */
    const view = strip(read('src/features/pay/pages/InvoiceView.tsx'));
    const businessHalf = view.indexOf('function BusinessActions');
    expect(businessHalf).toBeGreaterThan(0);
    expect(/settlement|payout/i.test(view.slice(0, businessHalf))).toBe(false);
  });
});

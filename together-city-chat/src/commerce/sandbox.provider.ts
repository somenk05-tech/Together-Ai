import { Injectable, Logger } from '@nestjs/common';
import type {
  ChargeRequest, ChargeResult, PaymentProvider, PayoutAccountRequest, PayoutAccountResult,
  PayoutProvider, RefundRequest, RefundResult, TransferRequest, TransferResult,
} from './provider';
import { bankCodeOf, last4Of } from './provider';

/**
 * THE PROVIDER THAT IS NOT ONE.
 *
 * "Sandbox" and not "mock", and the name is load-bearing rather than fussy:
 * this class SHIPS. A mock is a thing a test builds and throws away; this is
 * the simulated processor the product runs on until a real one is signed, and
 * calling it a mock is how a test double ends up in production without anybody
 * having decided that.
 *
 * It exists so the Till can be built, tested and demonstrated end to end before
 * a payment company is chosen — and so that choosing one is an afternoon
 * implementing two interfaces rather than a rewrite. Nothing above this file
 * knows it is a mock.
 *
 * IT SUCCEEDS BY DEFAULT AND FAILS ON DEMAND. A mock that only ever succeeds is
 * a mock that proves the happy path and hides every branch the brief's
 * edge-case list asks for, so the failure modes are reachable deliberately:
 * a saved instrument whose ref carries `decline`, `timeout` or `reverse`
 * behaves that way every time. Deterministic, not random — a flaky test double
 * teaches people to re-run the suite.
 *
 * IT KEEPS ITS OWN IDEMPOTENCY BOOK. Handed the same key twice it returns the
 * first answer without doing the work again, exactly as a real processor does.
 * That is not decoration: it is the only way the double-tap path is exercised
 * in development, and the map is per-process because a mock has no business
 * owning a table.
 */
@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly log = new Logger('SandboxPayments');
  private readonly seen = new Map<string, ChargeResult>();
  private readonly refunds = new Map<string, RefundResult>();
  private n = 0;

  private id(prefix: string): string {
    this.n += 1;
    // Sequential and prefixed rather than random: a reference in a log is
    // something somebody has to read out, and Math.random() in a test double
    // makes two runs of the same suite incomparable.
    return `${prefix}_${String(this.n).padStart(8, '0')}`;
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const replay = this.seen.get(req.idempotencyKey);
    if (replay) return replay;

    const instrument = req.instrumentRef.toLowerCase();
    let result: ChargeResult;

    if (req.amountInr <= 0) {
      result = { status: 'failed', code: 'amount_invalid', message: 'Nothing to charge.' };
    } else if (instrument.includes('decline')) {
      result = {
        status: 'failed', providerRef: this.id('ch'), code: 'card_declined',
        message: 'The bank declined this card.',
      };
    } else if (instrument.includes('timeout')) {
      result = {
        status: 'failed', code: 'processor_timeout',
        message: 'The payment processor did not answer in time.',
      };
    } else {
      result = { status: 'succeeded', providerRef: this.id('ch') };
    }

    this.seen.set(req.idempotencyKey, result);
    this.log.debug(`charge ${req.reference} ${req.amountInr} → ${result.status}`);
    return result;
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    const replay = this.refunds.get(req.idempotencyKey);
    if (replay) return replay;
    const result: RefundResult = req.amountInr > 0
      ? { status: 'succeeded', providerRef: this.id('rf') }
      : { status: 'failed', message: 'Nothing to refund.' };
    this.refunds.set(req.idempotencyKey, result);
    return result;
  }
}

/**
 * THE PAYOUT SIDE OF THE SAME FICTION.
 *
 * `registerAccount` is the one method here whose shape matters more than its
 * behaviour: it takes an account number and an IFSC, and returns a reference
 * and four digits. That asymmetry is the architecture — the details go in and
 * do not come back, so there is nowhere upstream for them to be stored even by
 * accident.
 *
 * Transfers answer `processing` rather than `settled`, because a real one does.
 * A payout that is instantly green in development is a payout whose Pending
 * state nobody ever looks at.
 */
@Injectable()
export class SandboxPayoutProvider implements PayoutProvider {
  readonly name = 'mock';
  private readonly seen = new Map<string, TransferResult>();
  private n = 0;

  private id(prefix: string): string {
    this.n += 1;
    return `${prefix}_${String(this.n).padStart(8, '0')}`;
  }

  async registerAccount(req: PayoutAccountRequest): Promise<PayoutAccountResult> {
    const digits = req.accountNumber.replace(/\D/g, '');
    if (digits.length < 6) {
      return { status: 'rejected', message: 'That account number is too short to be one.' };
    }
    if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(req.ifsc.trim())) {
      return { status: 'rejected', message: 'That IFSC is not in the right shape — four letters, a zero, then six characters.' };
    }
    return {
      status: 'accepted',
      accountRef: this.id('fa'),
      last4: last4Of(req.accountNumber),
      bankName: bankCodeOf(req.ifsc),
    };
  }

  async transfer(req: TransferRequest): Promise<TransferResult> {
    const replay = this.seen.get(req.idempotencyKey);
    if (replay) return replay;
    const result: TransferResult = req.accountRef.includes('fail')
      ? { status: 'failed', message: 'The receiving bank returned this transfer.' }
      : { status: 'processing', providerRef: this.id('pt') };
    this.seen.set(req.idempotencyKey, result);
    return result;
  }
}

/**
 * What a spoken consultation costs: ₹99 a minute (owner, 4 Sep).
 *
 * ── IT IS A METER NOW, AND THAT CHANGES THE MECHANISM ───────────────────────
 *
 * The first cut of this file sold a five-minute call for ₹99 flat, and said so
 * loudly: "minutes are a ceiling, not a meter", because a meter needs a balance
 * and a balance is the ledger `question-quota.ts` deliberately refused. The
 * owner priced it per minute instead, which settles that argument the other
 * way: you cannot bill by the minute without somewhere to bill it FROM.
 *
 * That somewhere already exists and is the right one. `financial.service.ts`
 * holds the city wallet — one balance per citizen, one ledger, idempotent
 * charges, and a race test (`wallet-race.spec.ts`) written because two
 * checkouts once took it negative. Voice does not get a second purse. Minutes
 * are funded from the city wallet and debited as they are used, so a citizen
 * who tops up for a call has topped up for the city.
 *
 * ── WHOLE MINUTES, STARTED ──────────────────────────────────────────────────
 *
 * A minute begins and it is charged. Ninety seconds is two minutes. This is
 * the convention every Indian telecom and every astrology app on the market
 * bills on, and it is the one that can be explained in a sentence before the
 * call — which is the actual test, because a caller watching a ₹99 meter and
 * unable to predict it will not call twice. Per-second billing is fairer by a
 * few rupees and unexplainable at the door; we take the explainable one and
 * say it out loud.
 *
 * NOTHING IS CHARGED FOR THE DISCLOSURE. The meter starts when the citizen
 * first speaks, not when Tara says who she is. Being told you are talking to a
 * machine is not a service anybody buys.
 *
 * ── THE BALANCE IS THE CEILING; THE MAX IS THE SAFETY ───────────────────────
 *
 * What bounds a call is now the wallet: when the balance cannot fund the next
 * minute, the call closes — announced a minute ahead, never mid-sentence.
 * MAX_CALL_MINUTES sits above that as a stop for the case the balance cannot
 * bound: a phone face-down on a table belonging to somebody with ₹50,000 in
 * their wallet is otherwise an open line to three metered APIs and a bill they
 * will dispute. It is a safety, not a product limit.
 */

/** What one minute of spoken consultation costs, in whole rupees. */
export const CALL_PRICE_INR_PER_MINUTE = 99;

/**
 * The least a citizen may start a call with. One minute — anything smaller is
 * a call that opens and immediately closes, which reads as a fault.
 */
export const MIN_BALANCE_INR = CALL_PRICE_INR_PER_MINUTE;

/**
 * The longest any single call runs, however much money is behind it. A safety
 * stop, not what the money bought.
 */
export const MAX_CALL_MINUTES = 30;

/** Warn this long before the balance runs out, so it never arrives as a cut. */
export const CALL_WARN_AT_SECONDS = 60;

export interface VoiceQuota {
  /** How many spoken consultations this citizen has ever had. Never decreases. */
  taken: number;
  /** ₹ per minute. */
  rateInr: number;
  /** The citizen's city wallet, in whole rupees. */
  balanceInr: number;
  /** Whole minutes that balance funds, before the safety stop. */
  minutesAfforded: number;
  /** True when the balance funds at least one minute AND the till is open. */
  canStart: boolean;
  /** Why not, when `canStart` is false — the screen says this rather than inventing one. */
  blockedBy: 'none' | 'balance' | 'till-closed';
}

/**
 * What `n` whole minutes cost. A function rather than a multiplication at the
 * call sites, because when voice grows a first-minute offer or a per-language
 * rate there is one place it changes.
 */
export function priceForMinutes(minutes: number): number {
  return Math.max(0, Math.ceil(minutes)) * CALL_PRICE_INR_PER_MINUTE;
}

/**
 * Whole minutes a balance funds, capped by the safety stop.
 *
 * Floor, never round: a balance of ₹197 funds one minute and part of a second
 * one, and selling the part is how a call ends mid-sentence owing money.
 */
export function minutesAfforded(balanceInr: number): number {
  const whole = Math.floor(Math.max(0, balanceInr) / CALL_PRICE_INR_PER_MINUTE);
  return Math.min(whole, MAX_CALL_MINUTES);
}

/**
 * What a minute of talking has cost so far.
 *
 * `spokenSeconds` is time on the meter — from the citizen's first word, not
 * from the greeting. Zero seconds is zero rupees; one second is a minute.
 */
export function costSoFarInr(spokenSeconds: number): number {
  const s = Math.max(0, Math.floor(spokenSeconds));
  return Math.ceil(s / 60) * CALL_PRICE_INR_PER_MINUTE;
}

/** Everything a screen needs to say what happens if the citizen calls now. */
export function voiceQuotaFor(taken: number, balanceInr: number, tillOpen: boolean): VoiceQuota {
  const afforded = minutesAfforded(balanceInr);
  const blockedBy: VoiceQuota['blockedBy'] = !tillOpen ? 'till-closed' : afforded < 1 ? 'balance' : 'none';
  return {
    taken: Math.max(0, Math.floor(taken)),
    rateInr: CALL_PRICE_INR_PER_MINUTE,
    balanceInr: Math.max(0, Math.floor(balanceInr)),
    minutesAfforded: afforded,
    canStart: blockedBy === 'none',
    blockedBy,
  };
}

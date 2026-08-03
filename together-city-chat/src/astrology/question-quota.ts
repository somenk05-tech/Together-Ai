/**
 * What the next consultation costs.
 *
 * FIVE FREE, THEN ₹100 FOR FIVE MORE. The charge lands on the question that
 * OPENS a pack — the sixth, the eleventh, the sixteenth — and the four after it
 * are already paid for. So there is no balance to store and no expiry to
 * explain: a citizen who buys a pack and asks one question has bought five and
 * used one, and the other four are waiting whenever they come back.
 *
 * THE WHOLE THING IS A FUNCTION OF ONE NUMBER, and that is the point. An
 * entitlement ledger — credits bought, credits spent, credits left — is three
 * numbers that can disagree with each other, and the day they do, somebody is
 * either charged twice or reading for free. One counter cannot contradict
 * itself.
 *
 * That counter is `AstroProfile.questionsAsked`, and it must be a COUNTER
 * rather than `count(AstroQuestion)`. Consultations are deletable now, and a
 * quota derived from deletable rows is not a quota: delete five answers and the
 * five free questions come back, for ever. The counter never goes down. Nothing
 * in this file can be persuaded otherwise, because nothing in this file reads a
 * row.
 */

/** Free consultations, once, per citizen. Not per month — see the note above. */
export const FREE_QUESTIONS = 5;
/** How many a paid pack covers, including the question that buys it. */
export const PACK_SIZE = 5;
/** What that pack costs. */
export const PACK_PRICE_INR = 100;

export interface QuestionQuota {
  /** How many consultations this citizen has ever been given. Never decreases. */
  asked: number;
  /** What the next one costs: 0, or PACK_PRICE_INR if it opens a new pack. */
  priceInr: number;
  /**
   * How many more consultations are already covered, before anything is charged
   * again. Counts down through the free five and then through each paid pack,
   * so one number carries both halves of the story and the screen does not have
   * to work out which half it is in.
   */
  includedLeft: number;
  /** True while the citizen is still inside their free five. */
  onFreeAllowance: boolean;
  packSize: number;
  packPriceInr: number;
  freeQuestions: number;
}

/**
 * The price of the NEXT consultation, given how many have already been given.
 *
 * asked 0–4 → free. asked 5 → ₹100 (and it buys 6–10). asked 6–9 → free.
 * asked 10 → ₹100 again.
 */
export function priceForNextQuestion(asked: number): number {
  const n = Math.max(0, Math.floor(asked));
  if (n < FREE_QUESTIONS) return 0;
  return (n - FREE_QUESTIONS) % PACK_SIZE === 0 ? PACK_PRICE_INR : 0;
}

/** Everything a screen needs to say what happens if the citizen asks now. */
export function quotaFor(asked: number): QuestionQuota {
  const n = Math.max(0, Math.floor(asked));
  const priceInr = priceForNextQuestion(n);
  const includedLeft = n < FREE_QUESTIONS
    ? FREE_QUESTIONS - n
    : (PACK_SIZE - ((n - FREE_QUESTIONS) % PACK_SIZE)) % PACK_SIZE;
  return {
    asked: n,
    priceInr,
    includedLeft,
    onFreeAllowance: n < FREE_QUESTIONS,
    packSize: PACK_SIZE,
    packPriceInr: PACK_PRICE_INR,
    freeQuestions: FREE_QUESTIONS,
  };
}

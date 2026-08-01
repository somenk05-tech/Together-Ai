/**
 * How much dating you get in a day. (M2.)
 *
 * ── THESE NUMBERS ARE THE OWNER'S, NOT ENGINEERING'S ────────────────────────
 * They were chosen to unblock the work, not decided by the product. Both are a
 * one-line change and nothing else needs to move; the spec asserts the
 * BEHAVIOUR (a limit exists, it resets locally, a super-like is scarce) rather
 * than the figures, so changing them here does not turn a suite red.
 *
 * WHY THERE IS A LIMIT AT ALL. Without one a like costs nothing to give, and a
 * signal that costs nothing carries nothing — the receiving end cannot tell
 * interest from a thumb moving down a list. The cap is not a monetisation
 * lever and must not become one by accident: it is what makes the like mean
 * something. This hub is defined against endless (see DATING_CHAT_CAP's note,
 * which is the same argument about conversations).
 *
 * WHY SIXTY. High enough that nobody browsing honestly will meet it — the
 * curated stack rarely offers that many in a day — and low enough that
 * liking everything stops being a strategy. If it turns out real citizens hit
 * it, that is a finding about the number, not about the rule.
 *
 * WHY ONE SUPER-LIKE. Scarcity is the entire mechanism. Two is not meaningfully
 * different from one, and five is a second kind of like. It is deliberately NOT
 * purchasable: "nothing to pay for" (K.53) is an open product question, and
 * quietly answering it inside a rate limit would be the wrong way to decide it.
 *
 * THE DAY RESETS AT THE CITIZEN'S LOCAL MIDNIGHT, not UTC — ClockService knows
 * their zone, and a Delhi evening should not be tomorrow's allowance.
 */

/** Likes — ordinary and super combined — one citizen may send per local day. */
export const DAILY_LIKES = 60;

/** Super-likes within that allowance per local day. */
export const DAILY_SUPER_LIKES = 1;

/**
 * What the citizen is told when they run out. Written here so the sentence and
 * the number can never disagree, and so it says when it lifts rather than just
 * that they are done.
 */
export function likeLimitMessage(resetsAtLocal: string): string {
  return `That's ${DAILY_LIKES} likes today — the daily limit. It resets at midnight (${resetsAtLocal}), and the people you haven't seen yet will still be there.`;
}

export function superLimitMessage(resetsAtLocal: string): string {
  return DAILY_SUPER_LIKES === 1
    ? `You've used your super-like for today. You get one a day — that's what makes it worth receiving. It comes back at midnight (${resetsAtLocal}).`
    : `You've used all ${DAILY_SUPER_LIKES} of today's super-likes. They come back at midnight (${resetsAtLocal}).`;
}

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
 * something. (The conversation cap that used to make the same argument about
 * talking was removed on 27 Aug; this one is about what a like means, and it
 * stays.)
 *
 * WHY TWENTY. Set by the owner on 2 Aug, down from the 60 engineering had
 * chosen to unblock the work.
 *
 * The change is not cosmetic, and the old comment would have become untrue if
 * it had been left: 60 was justified here as a ceiling "high enough that nobody
 * browsing honestly will meet it". Twenty is not that. An active citizen on a
 * good day can plausibly reach twenty, which means the limit stops being an
 * invisible backstop against liking everything and becomes a budget people
 * actually feel.
 *
 * That is a defensible thing to want — a like nobody has to think about is the
 * signal this cap exists to protect — but it is a different design, so the
 * things to watch are different too. `likeLimitMessage` is now a sentence real
 * citizens will read rather than an edge case, which is why it names when the
 * allowance returns and says the people they have not seen will still be there.
 * If citizens hit it and stop opening the hub, that is a finding about the
 * number; if they hit it and the likes they do send land better, the number is
 * doing its job.
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
export const DAILY_LIKES = 20;

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

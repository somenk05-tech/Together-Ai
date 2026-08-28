/**
 * WHAT THE SERVER SAID, WHEN IT SAID ANYTHING.
 *
 * Split out of `components/ReadFailure.tsx` so the component file exports a
 * component and nothing else — the rule Fast Refresh enforces, and the reason
 * two pure functions live one directory up from the thing that renders them.
 */

/**
 * The sentence the API sent, if it sent one. Nest serialises a validation
 * failure's message as an array, which is why the join is here and not at each
 * call site.
 */
export function serverMessage(error: unknown): string | null {
  const m = (error as { response?: { data?: { message?: string | string[] } } } | null)?.response?.data?.message;
  const text = Array.isArray(m) ? m.join(' ') : m;
  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
}

/**
 * A HELD PROFILE IS NOT A FAILED REQUEST, AND THE SERVER HAS ALWAYS SAID SO.
 *
 * `myApprovedProfile` throws a 403 carrying one of two precise sentences —
 * "Your dating profile is still being reviewed. This usually takes a moment"
 * and "Your dating profile has not been approved… You can appeal in the Safety
 * Centre." Browse and Curated Matches threw both away and printed "this didn't
 * reach us. Try again in a moment."
 *
 * For a queued or rejected profile every clause of that is false, and the loop
 * it invites never ends: the citizen retries, gets the same 403, reads the same
 * apology, and never learns there is a sentence in their own bio to change.
 * Two screens told somebody the app was broken when the truth was one line
 * away — and `MatchCards` was already reading `data.message` off a refused
 * like, so the pattern existed in this very feature.
 *
 * 403 alone is not enough and neither is a message alone: a 500 with a message
 * is still a failure, and a 403 with nothing in it is nothing to show.
 */
export function moderationHold(error: unknown): string | null {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 ? serverMessage(error) : null;
}

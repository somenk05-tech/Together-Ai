/**
 * THE TRADE, STATED BEFORE IT IS MADE — the chat header's version.
 *
 * BusinessPage.tsx has carried that heading for months, over a `tel:` link, and
 * the paragraph under it is the reason these two functions exist: "A phone call
 * carries a number… that is what a telephone is." The same sentence is true of
 * a chat header, in both directions at once — the citizen is given the other
 * person's number, and hands over their own the moment it rings.
 *
 * WHY THE VIDEO KEY OPENS A THREAD. WhatsApp publishes no person-to-person call
 * link. Its only programmatic calling is the Business Calling API — voice only,
 * customer-to-business, an approved business number. `wa.me` opens a
 * conversation, so the nearest honest thing is to put the citizen in front of
 * the thread with the camera key already on screen.
 *
 * BOTH FUNCTIONS REFUSE ANYTHING THAT IS NOT E.164, and refuse it here rather
 * than trusting the server to have refused it. Not distrust of that gate — the
 * same check runs in calls/reach.ts, deliberately twice. A malformed number
 * that reaches this file becomes an href, and an href is a thing a citizen
 * presses. Returning null is what lets the caller fall back to the in-app call
 * instead of dialling nobody.
 */

/** A plus, a non-zero country digit, then seven to fourteen more. */
const E164 = /^\+[1-9]\d{7,14}$/;

/** `tel:+919876543210`, or null when there is nothing safe to dial. */
export function telHref(phoneE164: string | null | undefined): string | null {
  return phoneE164 && E164.test(phoneE164) ? `tel:${phoneE164}` : null;
}

/**
 * `https://wa.me/919876543210`, or null.
 *
 * wa.me wants the country code and the subscriber number and no plus, which is
 * exactly E.164 with the first character removed — so the string is sliced
 * rather than stripped of non-digits. Stripping would quietly turn a number
 * this file has just refused into a link to somebody.
 */
export function whatsappHref(phoneE164: string | null | undefined): string | null {
  return phoneE164 && E164.test(phoneE164) ? `https://wa.me/${phoneE164.slice(1)}` : null;
}

/**
 * WHERE A CALL GOES WHEN IT LEAVES THE APP.
 *
 * The two keys in a chat header used to mean one thing: ring this conversation
 * over WebRTC. They now mean "reach this person", and the first answer offered
 * is the one their handset already knows how to do — the dialler for voice, the
 * WhatsApp thread for video.
 *
 * WHY THE VIDEO KEY OPENS A THREAD AND NOT A CALL. WhatsApp has no
 * person-to-person call link. The only programmatic calling it offers is the
 * Business Calling API: voice only, customer-to-business, an approved business
 * number and per-minute billing. `wa.me/<number>` opens a conversation. So the
 * honest handoff is to put the citizen in front of the thread with the camera
 * key already on screen, and let them press it.
 *
 * WHAT THIS FILE ACTUALLY DECIDES is not a link. It decides whether one citizen
 * may be given another citizen's telephone number, which this city has never
 * done — `local-services/anonymity.spec.ts` keeps business numbers out of
 * public cards and `realestate/moderation.ts` flags "WhatsApp me" in a listing
 * as contact walking off the platform. So the gate is a pure function, where it
 * fits on one screen and can be tested without a database:
 *
 *   - A DATING CHAT NEVER YIELDS A NUMBER, and which chats those are is read
 *     from `kind`, the column added 29 Aug for exactly this question. It used
 *     to be read from `anonymousTrust`, which is a near-enough proxy and not
 *     the same thing: a real-estate enquiry sets that column and has nothing to
 *     do with dating, so the refusal it produced told the citizen a lie about
 *     why. Trust level does not change the answer — including 3, "friends":
 *     that column exists because two people chose how much of themselves to
 *     show each other in a room where they had not met. A number is not inside
 *     that choice, and unlike a revealed name it cannot be taken back.
 *   - NEITHER DOES ANY OTHER ANONYMOUS ROOM. An enquiry is also a room where
 *     two people have not met, and the person who opened it did so behind a
 *     pseudonym. Same answer, its own reason, so the page can say the true
 *     thing rather than the dating thing.
 *   - A GROUP NEVER YIELDS A NUMBER, because there is no "the other person" to
 *     yield, and picking one would be the app deciding on everybody's behalf.
 *   - AN UNVERIFIED NUMBER IS NOT A NUMBER. `phoneE164` is nullable and, by the
 *     schema's own admission, may hold something typed before that column was
 *     E.164 at all. Handing it to a dialler dials a stranger.
 *
 * Everything returned is a decision rather than a lookup: `reason` exists so
 * the page can offer the in-app call knowing why, instead of guessing from a
 * null.
 */

export type ReachDenial = 'dating' | 'anonymous' | 'group' | 'nobody' | 'unverified';

export interface Reach {
  /** E.164, or null when this conversation may not be carried off the app. */
  phoneE164: string | null;
  /** Why not, when null. Null itself only when a number is being handed over. */
  reason: ReachDenial | null;
}

export interface ReachConversation {
  type: string;
  /** "city" or "dating" — the row's own word for which hub it belongs to. */
  kind: string;
  anonymousTrust: number | null;
}

export interface ReachPerson {
  phoneE164: string | null;
  phoneVerifiedAt: Date | null;
  deletedAt: Date | null;
}

/**
 * A plus, a non-zero country digit, then seven to fourteen more. Deliberately
 * stricter than the column: this is the last check before a string becomes a
 * `tel:` href, and the column is documented as possibly holding a number typed
 * before E.164 storage existed.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export function reachOf(conversation: ReachConversation, others: ReachPerson[]): Reach {
  if (conversation.kind === 'dating') return { phoneE164: null, reason: 'dating' };
  if (conversation.anonymousTrust !== null && conversation.anonymousTrust !== undefined) {
    return { phoneE164: null, reason: 'anonymous' };
  }
  if (conversation.type !== 'DIRECT') return { phoneE164: null, reason: 'group' };
  if (others.length !== 1) return { phoneE164: null, reason: 'nobody' };

  const them = others[0];
  if (them.deletedAt) return { phoneE164: null, reason: 'nobody' };
  if (!them.phoneVerifiedAt) return { phoneE164: null, reason: 'unverified' };

  const number = (them.phoneE164 ?? '').trim();
  if (!E164.test(number)) return { phoneE164: null, reason: 'unverified' };

  return { phoneE164: number, reason: null };
}

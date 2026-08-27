import { NICK_ADJ, NICK_NOUN, nickname } from '../shared/nickname';

/**
 * ── THE NAME YOU DATE UNDER ──────────────────────────────────────────────────
 *
 * A citizen's Dating presence gets an identifier of its own, chosen when the
 * dating profile is created. It is not their city @handle, it is not derived
 * from it, and — this is the part that matters — the city cannot resolve it.
 *
 * WHY A SECOND IDENTIFIER AT ALL. Until now a person in Dating had a display
 * name (`extras.firstName`, or their account name if they hadn't chosen one)
 * and nothing stable underneath it. Two matches could both be "Maya". The
 * anonymous chat filled the gap with `nickname(userId)` — "Coastal Ember" —
 * a generated pseudonym nobody picked and nobody recognised. So there were two
 * names for one person, one of them assigned by a hash, and neither of them
 * was an identifier you could refer to.
 *
 * WHAT IT IS NOT. It is not a search key. There is no endpoint that takes a
 * dating handle and returns a person, and there must never be one — the second
 * dating audit's blocker 02 was four endpoints that turned an identifier back
 * into a city identity, and the cheapest way not to write a fifth is to build
 * the identifier with no lookup in the first place. It is shown to people you
 * have matched with. That is all it does.
 *
 * THE TRADE-OFF, WRITTEN DOWN. A stable handle a person chooses is a string
 * people reuse — "maya_sf" here is "maya_sf" on three other services, and that
 * is a link out of the city that no amount of masking on our side can undo.
 * The mitigation is not technical: it is the sentence beside the field telling
 * them so, and the fact that nothing in the product invites them to search for
 * one. A handle that cannot be looked up is a poor tool for finding somebody
 * and a fine one for being somebody.
 */

/** Anything that could be mistaken for the city, the company, or a service. */
const RESERVED = new Set([
  'admin', 'administrator', 'moderator', 'mod', 'support', 'help', 'helpdesk',
  'togethercity', 'together_city', 'city', 'official', 'staff', 'team',
  'mira', 'system', 'security', 'safety', 'billing', 'payments', 'noreply',
  'root', 'api', 'www', 'me', 'you', 'null', 'undefined', 'anonymous', 'deleted',
]);

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** The shape, and nothing about who already holds it. */
const SHAPE = /^[a-z][a-z0-9_]{1,18}[a-z0-9]$/;

export type HandleProblem =
  | 'empty' | 'tooShort' | 'tooLong' | 'shape' | 'doubleUnderscore' | 'reserved' | 'generated';

/** The message a person reads. One sentence, saying what to do about it. */
export const HANDLE_MESSAGE: Record<HandleProblem, string> = {
  empty: 'Choose a dating name — it is how matches will know you.',
  tooShort: `A dating name needs at least ${HANDLE_MIN} characters.`,
  tooLong: `A dating name can be at most ${HANDLE_MAX} characters.`,
  shape: 'Use lowercase letters, numbers and underscores. Start with a letter, end with a letter or number.',
  doubleUnderscore: 'Two underscores in a row is one too many.',
  reserved: 'That one is kept back for the city itself. Pick another.',
  generated: 'That is one of the names we hand out to profiles that have not chosen yet. Pick your own.',
};

/**
 * The 144 adjective_noun pairs `fallbackHandle` can produce.
 *
 * Held back from anyone choosing, so the generated namespace and the chosen
 * one cannot overlap. Without this, a citizen could take `coastal_ember` and
 * then share it with whichever unchosen profile happens to hash there — two
 * people, one identifier, and no unique index to catch it because the
 * generated one is computed rather than stored.
 */
function isGeneratedShape(h: string): boolean {
  const parts = h.split('_');
  if (parts.length !== 2) return false;
  const adj = new Set(NICK_ADJ.map((a) => a.toLowerCase()));
  const noun = new Set(NICK_NOUN.map((n) => n.toLowerCase()));
  return adj.has(parts[0]) && noun.has(parts[1]);
}

/** Trim and lowercase, and drop a leading @ if they typed one. Nothing else —
 *  a handle is never silently repaired into something they did not type. */
export function normaliseHandle(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/^@/, '').toLowerCase() : '';
}

/** What is wrong with this handle, or null if the shape is fine. Says nothing
 *  about whether somebody already holds it — that is a database question. */
export function handleProblem(raw: unknown): HandleProblem | null {
  const h = normaliseHandle(raw);
  if (!h) return 'empty';
  if (h.length < HANDLE_MIN) return 'tooShort';
  if (h.length > HANDLE_MAX) return 'tooLong';
  if (h.includes('__')) return 'doubleUnderscore';
  if (!SHAPE.test(h)) return 'shape';
  if (RESERVED.has(h)) return 'reserved';
  if (isGeneratedShape(h)) return 'generated';
  return null;
}

/**
 * The handle a profile without one is shown under.
 *
 * Deterministic, from the same generator that used to supply the anonymous
 * chat pseudonym — so the person who was "Coastal Ember" in a chat yesterday
 * is `coastal_ember` today rather than something new, and a profile written
 * before this column existed still has a stable name until its owner picks
 * one. Derived from the user id and nothing else: it carries no fragment of
 * their account name, their city handle or their email.
 */
export function fallbackHandle(userId: string): string {
  return nickname(userId).toLowerCase().replace(/\s+/g, '_');
}

/** What Dating shows: the chosen handle, or the generated one until they choose. */
export function datingHandleOf(p: { userId: string; handle?: string | null }): string {
  return p.handle || fallbackHandle(p.userId);
}

/**
 * WHAT A CONSOLE MAY EVER SEE ABOUT A PERSON.
 *
 * The 360° user view is the screen where an admin console stops being a tool
 * and becomes surveillance, and it happens by accretion rather than by
 * decision: somebody handling a support case needs one more field, and one
 * more, and eighteen months later a support account can read a citizen's
 * medical hub because nobody ever wrote down where the line was.
 *
 * So the line is written down here, as an ALLOW-LIST, and the guard beside it
 * fails on anything outside it. Adding a field to this screen means adding it
 * to this file, which means somebody reads this comment first. That is the
 * entire mechanism, and it only works because the projection below is the ONLY
 * way the console reads a User row.
 *
 * ── WHAT IS REFUSED, AND WHY IT IS REFUSED HERE RATHER THAN DEBATED LATER ──
 *
 * Messages and conversations. Already refused once, when the CRM asked for
 * them. A citizen who chats with a business believes the business is reading
 * it, not the platform.
 *
 * The health hubs — medical, nutrition, beauty, fitness, dating. Nothing an
 * admin does in this console is improved by knowing somebody's blood work.
 * A moderation decision about a salon listing does not need its owner's BMI.
 *
 * Mail, drive files, calendar. Same argument, less obviously, which is why
 * they are named rather than left to the general principle.
 *
 * Credentials, tokens and hashes. Not because an admin would use them — because
 * a screen that renders them is a screen that ends up in a screenshot.
 *
 * ── AND THE ONE THAT IS A JUDGEMENT CALL, MADE OUT LOUD ──
 *
 * The email address and the phone number are MASKED, not withheld and not
 * shown. The real support case is "somebody wrote to us from s…@gmail.com,
 * is that this account" — which a mask answers completely. Handing the actual
 * address to every one of ten roles answers it too, and also hands over a
 * contact detail the citizen gave us for receipts. If unmasking is ever
 * genuinely needed it gets its own permission key and its own audit entry; it
 * does not get quietly folded into `users.read`.
 */

/** The columns the console's User query is allowed to select. */
export const CITIZEN_FIELDS = [
  'id', 'handle', 'name', 'city', 'profileImage',
  'createdAt', 'lastSeen',
  'email', 'emailVerified', 'phoneE164', 'phoneVerifiedAt',
  'deletedAt', 'purgedAt', 'suspendedAt', 'suspendedReason',
  'role',
] as const;

/**
 * Columns that must never appear in a console projection, listed by name.
 *
 * A guard could instead check "nothing outside CITIZEN_FIELDS", and it does.
 * This second list exists because the two catch different mistakes: the
 * allow-list catches a field added to the query, and this catches a field
 * added to the allow-list. The names are the ones somebody would plausibly
 * reach for, not every column in the schema — a list of everything is a list
 * nobody maintains.
 */
export const NEVER_IN_CONSOLE = [
  'passwordHash', 'refreshTokens', 'deviceTokens', 'sessionsRevokedAt',
  'messages', 'memberships', 'messageStatuses',
  'bloodReports', 'medicalProfile', 'prescriptions', 'foodPref', 'masterProfile',
  'beautyProfile', 'fitnessProfile', 'datingProfile', 'watchlistJson',
  'mailMessages', 'driveFiles', 'driveFolders',
] as const;

/** Email as an admin may see it: enough to recognise, not enough to contact. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  // One real character. Two would identify most people in a small org, and
  // zero makes two accounts at the same provider indistinguishable — which is
  // the exact question this field exists to answer.
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domain}`;
}

/** Phone as an admin may see it: the last two digits and the country. */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/[^\d+]/g, '');
  if (digits.length < 4) return '•••';
  return `${digits.slice(0, 3)}•••${digits.slice(-2)}`;
}

/** The row shape the console renders. */
export interface CitizenView {
  id: string;
  handle: string;
  name: string;
  city: string | null;
  profileImage: string | null;
  joinedAt: Date;
  lastSeen: Date;
  /** Masked. See the note above — this is deliberate, not an oversight. */
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  /** live | suspended | deleted | purged — one word, computed in one place. */
  status: 'live' | 'suspended' | 'deleted' | 'purged';
  suspendedAt: Date | null;
  suspendedReason: string | null;
  moderator: boolean;
}

export interface CitizenRow {
  id: string; handle: string; name: string; city: string | null; profileImage: string | null;
  createdAt: Date; lastSeen: Date;
  email: string | null; emailVerified: boolean;
  phoneE164: string | null; phoneVerifiedAt: Date | null;
  deletedAt: Date | null; purgedAt: Date | null;
  suspendedAt: Date | null; suspendedReason: string | null;
  role: string;
}

/**
 * The one place a User row becomes something a console may render.
 *
 * Order matters in the status ladder: purged is checked before deleted, and
 * deleted before suspended. A purged account is also a deleted one, and an
 * account somebody suspended before closing is both — showing the LAST thing
 * that happened to it is the only reading that is never wrong.
 */
export function toCitizenView(r: CitizenRow): CitizenView {
  const status: CitizenView['status'] = r.purgedAt ? 'purged'
    : r.deletedAt ? 'deleted'
    : r.suspendedAt ? 'suspended'
    : 'live';
  return {
    id: r.id,
    handle: r.handle,
    name: r.name,
    city: r.city,
    profileImage: r.profileImage,
    joinedAt: r.createdAt,
    lastSeen: r.lastSeen,
    email: maskEmail(r.email),
    emailVerified: r.emailVerified,
    phone: maskPhone(r.phoneE164),
    phoneVerified: r.phoneVerifiedAt != null,
    status,
    suspendedAt: r.suspendedAt,
    suspendedReason: r.suspendedReason,
    moderator: r.role === 'admin',
  };
}

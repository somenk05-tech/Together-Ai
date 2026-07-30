/**
 * The rules for proving you own an email address or a phone number.
 *
 * Everything here is a pure function over values — no database, no clock, no
 * provider. That is deliberate: the interesting failures in a verification flow
 * are all timing and counting failures (a code that outlives its window, a
 * resend button that funds an SMS bill, an attempt counter that resets when it
 * should not), and those are only cheap to test when the decision is separable
 * from the row it was read from.
 *
 * The service in verification-code.service.ts does the I/O and asks this file
 * what the answer is.
 */

// ── policy constants ──────────────────────────────────────────────────────
// Named rather than inlined, because these are product decisions and someone
// will want to argue with them.

/** How long a code is good for. Long enough to switch apps and read a text. */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** Wrong guesses allowed before the code is burnt. Six digits is 1e6 space;
 *  five tries makes brute force pointless without punishing a typo. */
export const MAX_ATTEMPTS = 5;

/** Minimum gap between two sends to the same target. Stops double-taps and the
 *  "nothing arrived yet" reflex from costing two SMS. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** Sends per target per hour. This is the cost cap: an attacker who wants to
 *  bill us for SMS has to find new numbers rather than reuse one. */
export const MAX_SENDS_PER_HOUR = 5;

/** Sends per IP per hour, across every target. Catches the case
 *  MAX_SENDS_PER_HOUR misses: one host walking a list of numbers. */
export const MAX_SENDS_PER_IP_PER_HOUR = 20;

export const HOUR_MS = 60 * 60 * 1000;

export type Channel = 'email' | 'phone';

// ── target normalisation ──────────────────────────────────────────────────

/**
 * Normalise an email for storage and comparison.
 *
 * Lowercased and trimmed, and nothing else. Not gmail-dot-stripping, not
 * plus-address stripping: those are Gmail's rules, not the internet's, and
 * applying them to every domain turns two different mailboxes into one row.
 */
export function normaliseEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

/** Structurally plausible email. Deliverability is the provider's answer, not
 *  a regex's — this only rejects what cannot possibly be an address. */
export function isPlausibleEmail(raw: string): boolean {
  const e = normaliseEmail(raw);
  if (e.length < 6 || e.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) return false;
  const [local, domain] = e.split('@');
  if (local.length > 64) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  return /^[a-z0-9.-]+$/.test(domain) && !domain.startsWith('-') && !domain.endsWith('-');
}

export interface PhoneParse {
  ok: boolean;
  e164?: string;
  /** Why it was rejected, in words a person can act on. */
  reason?: string;
}

/**
 * Parse a typed phone number into E.164.
 *
 * What this does NOT do is validate the number against each country's actual
 * numbering plan — that needs libphonenumber's metadata, which is a megabyte of
 * tables that go stale. This checks the shape E.164 itself defines: a leading
 * plus, a country calling code, and a total of 8 to 15 digits.
 *
 * The consequence is honest and worth stating: a number can pass this and still
 * be unassigned. That is fine, because nothing is trusted until a code sent to
 * it comes back. Structural parsing is here to catch typos before we pay for an
 * SMS, not to be the authority on whether a line exists.
 *
 * `defaultCallingCode` lets a national-format entry ("98765 43210") work when we
 * know the user's country; without one, a number must be typed with its +.
 */
export function parseE164(raw: string, defaultCallingCode?: string): PhoneParse {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'Enter a phone number.' };

  // Strip the punctuation people actually type: spaces, dashes, dots, brackets.
  const cleaned = trimmed.replace(/[\s().-]/g, '');

  let digits: string;
  if (cleaned.startsWith('+')) {
    digits = cleaned.slice(1);
  } else if (cleaned.startsWith('00')) {
    // The other international prefix. Same number, different dialling habit.
    digits = cleaned.slice(2);
  } else if (defaultCallingCode) {
    // National format. A single leading 0 is a trunk prefix — it is not part of
    // the international number and dropping it is the whole point of E.164.
    digits = defaultCallingCode.replace(/\D/g, '') + cleaned.replace(/^0+/, '');
  } else {
    return { ok: false, reason: 'Include the country code, like +91 or +1.' };
  }

  if (!/^[0-9]+$/.test(digits)) return { ok: false, reason: 'A phone number can only contain digits.' };
  if (digits.startsWith('0')) return { ok: false, reason: 'A country code cannot start with 0.' };
  if (digits.length < 8) return { ok: false, reason: 'That number is too short.' };
  if (digits.length > 15) return { ok: false, reason: 'That number is too long.' };

  return { ok: true, e164: `+${digits}` };
}

// ── the send decision ─────────────────────────────────────────────────────

export interface SendHistory {
  /** Timestamps of sends to this target, any order. */
  toTarget: Date[];
  /** Timestamps of sends from this IP to any target, any order. */
  fromIp?: Date[];
}

export type SendVerdict =
  | { allow: true }
  | { allow: false; reason: 'cooldown'; retryAfterMs: number; message: string }
  | { allow: false; reason: 'target-hourly-cap'; retryAfterMs: number; message: string }
  | { allow: false; reason: 'ip-hourly-cap'; retryAfterMs: number; message: string };

/**
 * May we send a code right now?
 *
 * Three gates, checked cheapest-first. Each returns how long to wait rather
 * than just "no", so the UI can run a countdown instead of inviting the user to
 * keep pressing a button that will keep refusing.
 *
 * The IP gate is last because it is the one that can punish a shared NAT — an
 * office, a campus, a mobile carrier. Twenty an hour is set well above what a
 * building full of people signing up would produce, and the message says to try
 * again shortly rather than accusing anyone of anything.
 */
export function decideSend(history: SendHistory, now: Date): SendVerdict {
  const t = now.getTime();

  const recent = [...history.toTarget].sort((a, b) => b.getTime() - a.getTime());
  const last = recent[0];
  if (last) {
    const since = t - last.getTime();
    if (since < RESEND_COOLDOWN_MS) {
      const wait = RESEND_COOLDOWN_MS - since;
      return {
        allow: false, reason: 'cooldown', retryAfterMs: wait,
        message: `Wait ${Math.ceil(wait / 1000)} seconds before asking for another code.`,
      };
    }
  }

  const inLastHour = recent.filter((d) => t - d.getTime() < HOUR_MS);
  if (inLastHour.length >= MAX_SENDS_PER_HOUR) {
    // Oldest of the capping window: when it ages out, one slot frees up.
    const oldest = inLastHour[inLastHour.length - 1];
    const wait = HOUR_MS - (t - oldest.getTime());
    return {
      allow: false, reason: 'target-hourly-cap', retryAfterMs: wait,
      message: "You've asked for too many codes. Try again in about an hour, or use a different address.",
    };
  }

  const ipRecent = (history.fromIp ?? []).filter((d) => t - d.getTime() < HOUR_MS);
  if (ipRecent.length >= MAX_SENDS_PER_IP_PER_HOUR) {
    const oldest = [...ipRecent].sort((a, b) => a.getTime() - b.getTime())[0];
    const wait = HOUR_MS - (t - oldest.getTime());
    return {
      allow: false, reason: 'ip-hourly-cap', retryAfterMs: wait,
      message: 'Too many codes have been requested from this connection. Try again shortly.',
    };
  }

  return { allow: true };
}

// ── the attempt decision ──────────────────────────────────────────────────

export interface CodeState {
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export type AttemptVerdict =
  | { outcome: 'accept' }
  | { outcome: 'wrong'; attemptsLeft: number; message: string }
  | { outcome: 'exhausted'; message: string }
  | { outcome: 'expired'; message: string }
  | { outcome: 'already-used'; message: string }
  | { outcome: 'no-code'; message: string };

/**
 * Judge one attempt at a code.
 *
 * `matches` is passed in rather than computed here because comparing the code
 * means hashing it, which is async and belongs to the service. This function's
 * job is everything around that comparison — and the order of the checks is the
 * substance of it.
 *
 * Consumed and expired are checked BEFORE the match. Checking the match first
 * would mean a correct-but-expired code and an incorrect-but-expired code take
 * measurably different paths, and it would let someone burn attempts on a code
 * that was already dead. It also produces a better message: "that code has
 * expired" is actionable, "that code is wrong" about a code the user copied
 * correctly is maddening.
 *
 * Attempts are counted BEFORE the verdict, so the fifth wrong guess is the last
 * one — not the sixth.
 */
export function decideAttempt(
  state: CodeState | null,
  matches: boolean,
  now: Date,
): AttemptVerdict {
  if (!state) {
    return { outcome: 'no-code', message: 'Ask for a new code — this one is no longer on file.' };
  }
  if (state.consumedAt) {
    return { outcome: 'already-used', message: 'That code has already been used. Ask for a new one.' };
  }
  if (state.expiresAt.getTime() <= now.getTime()) {
    return { outcome: 'expired', message: 'That code has expired. Ask for a new one.' };
  }
  if (state.attempts >= MAX_ATTEMPTS) {
    return { outcome: 'exhausted', message: 'Too many wrong tries. Ask for a new code.' };
  }
  if (matches) return { outcome: 'accept' };

  const used = state.attempts + 1;
  if (used >= MAX_ATTEMPTS) {
    return { outcome: 'exhausted', message: 'Too many wrong tries. Ask for a new code.' };
  }
  const left = MAX_ATTEMPTS - used;
  return {
    outcome: 'wrong',
    attemptsLeft: left,
    message: `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
  };
}

/**
 * Does changing a target invalidate an existing verification?
 *
 * Yes, always, and the comparison is on the normalised value — otherwise
 * retyping the same address with different capitalisation would silently drop a
 * verified flag, and the user would be asked to prove something they already
 * proved.
 */
export function targetChanged(channel: Channel, current: string | null, next: string | null): boolean {
  const norm = (v: string | null) =>
    v == null ? null : channel === 'email' ? normaliseEmail(v) : v.trim();
  return norm(current) !== norm(next);
}

/** Six digits, zero-padded, from a caller-supplied random integer in [0, 1e6). */
export function formatCode(n: number): string {
  return String(Math.abs(Math.trunc(n)) % 1_000_000).padStart(6, '0');
}

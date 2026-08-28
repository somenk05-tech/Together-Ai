/**
 * WHAT A DATING BIO IS SCANNED FOR — and why it is not the property list.
 *
 * Until 28 Aug a dating bio was screened by `scanText` in
 * `realestate/moderation.ts`: the word list written to keep phone numbers and
 * escort adverts out of a flat listing in Andheri. Both of the checks it fed
 * were `severity: 'hard'`, which in `decide()` means REJECTED, and a rejected
 * profile 403s out of Browse, Curated Matches, liking and reaching.
 *
 * Measured against that list, these are the sentences it threw somebody out of
 * the hub for:
 *
 *   · "Not looking for casual sex, just something real."   → \bsex\b
 *   · "Attracted to the same sex."                          → \bsex\b
 *   · "I don't smoke weed."                                 → \bweed\b
 *   · "Lived in Mumbai 2010 - 2015, Delhi 2015 - 2020."     → "a phone number"
 *   · "Yoga at 6 30 - 7 30 every morning."                  → "a phone number"
 *   · "W.A. is where I grew up."                            → "a WhatsApp contact"
 *
 * None of those words occur in a property listing, which is why nobody had
 * seen it. All of them occur in honest dating bios, and the first two occur in
 * any bio that states an orientation in prose.
 *
 * So this file, and three rules it holds to:
 *
 *  1. **A hard check must be unambiguous.** `\bsex\b` is not a fact about a
 *     bio; "escort service available, rate card on request" is. Words that are
 *     usually innocent and occasionally not — drugs, weapons, nudity — are not
 *     here at all: `aiBioModeration` reads intent and is the right instrument
 *     for them, and when it cannot run the profile already goes to review.
 *
 *  2. **A phone number is counted, not pattern-matched.** The old regex read
 *     any run of eight digit-ish characters. This one pulls the runs out and
 *     counts the DIGITS in them: ten to fifteen is a phone number, eight is a
 *     decade of address history.
 *
 *  3. **An app's name is not a handle.** "Instagram-free since 2019" names
 *     Instagram and hands over nothing. The name counts only when a handle or
 *     an invitation is sitting next to it.
 *
 * Every sentence above is pinned in `a-bio-is-not-a-listing.spec.ts`, in both
 * directions: the honest bios that must survive, and the hand-offs that must
 * not.
 */

/** Contact routing that is off-platform whatever the sentence around it. */
const CONTACT: Array<[string, RegExp]> = [
  ['an email address', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['a payment id', /\b[\w.-]+@(?:okhdfcbank|okaxis|oksbi|okicici|ybl|paytm|upi|apl|ibl)\b/i],
  ['a link', /\b(?:https?:\/\/|www\.)\S+/i],
  ['a link', /\b(?:t\.me\/|tg:\/\/|fb\.com|fb\.me)\S*/i],
  ['a social handle', /(?:^|[^a-z0-9._@])@[a-z0-9._]{3,}/i],
];

/** The apps people hand each other off to. The name alone proves nothing. */
const APPS = /\b(?:insta(?:gram)?|snap\s?chat|telegram|whats\s?app|facebook|tik\s?tok|signal|discord|kik)\b/gi;
/** A handle, an id, or a colon, immediately after the app's name. */
const HANDLE_AFTER = /^[^a-z0-9]{0,4}(?:[:@]|\b(?:id|handle|is|me)\b)/i;
/** An invitation immediately before it. */
const INVITE_BEFORE = /\b(?:add|dm|msg|message|text|ping|find|reach|hit|call|contact|catch|follow|my|on)\s*$/i;

/**
 * Prohibited outright. Phrases, not words — each one is a thing somebody chose
 * to write, and none of them has an innocent reading in a dating bio.
 */
const PROHIBITED: Array<[string, RegExp]> = [
  ['an offer of paid or commercial services', /\b(?:escorts?\s+(?:service|services|available|only)|call\s?girls?|rate\s?card|paid\s+(?:meet|meets|companionship|dates?)|full\s+service\s+massage)\b/i],
  ['a reference to minors', /\b(?:under\s?-?\s?(?:18|eighteen)|underage|minors?\s+(?:only|welcome|preferred))\b/i],
  ['hate or violent extremism', /\b(?:heil\s+hitler|neo-?\s?nazi|white\s+power|kill\s+all\s+\w+)\b/i],
];

/**
 * Romance-scam phrasing — SOFT, so it is a look rather than a verdict.
 *
 * The property list this replaces looked for "token amount to block" and
 * "wire transfer", which is what a fraudulent listing says. What a romance
 * scam says is money, gift cards, crypto and a reason it is urgent, so that is
 * what this looks for.
 */
const SCAM = /\b(?:send\s+(?:me\s+)?(?:money|cash|gift\s?cards?)|gift\s?cards?|western\s+union|money\s?gram|wire\s+transfer|bitcoin|btc|crypto\s+(?:investment|trading|signals)|forex\s+(?:trading|signals)|investment\s+(?:opportunity|plan)|double\s+your\s+money|risk[- ]free|guaranteed\s+returns|customs\s+fee)\b/i;

/**
 * Ten to fifteen digits inside one unbroken run of digits and separators.
 *
 * The run may hold spaces, dashes, dots, brackets and a leading +, because
 * that is how people write a number; it may not hold a letter or a comma,
 * because that is what separates "2010 - 2015" from "2015 - 2020". Counting
 * the digits rather than the characters is the whole of the fix.
 */
export function phoneLike(text: string): boolean {
  for (const run of text.match(/[+\d][\d\s().-]{6,}\d/g) ?? []) {
    const digits = run.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return true;
  }
  return false;
}

function appHandoff(text: string): boolean {
  for (const m of text.matchAll(APPS)) {
    const at = m.index ?? 0;
    const before = text.slice(Math.max(0, at - 24), at);
    const after = text.slice(at + m[0].length, at + m[0].length + 24);
    if (HANDLE_AFTER.test(after) || INVITE_BEFORE.test(before)) return true;
  }
  return false;
}

export interface BioScan {
  /** Human-readable, for the citizen: "a phone number", "an email address". */
  contacts: string[];
  /** The category of the prohibited phrase found, or null. */
  prohibited: string | null;
  /** Romance-scam phrasing. */
  scam: boolean;
}

export function scanBio(text: string): BioScan {
  const contacts: string[] = [];
  const add = (label: string) => { if (!contacts.includes(label)) contacts.push(label); };

  if (phoneLike(text)) add('a phone number');
  for (const [label, re] of CONTACT) if (re.test(text)) add(label);
  if (appHandoff(text)) add('a messaging or social handle');

  let prohibited: string | null = null;
  for (const [label, re] of PROHIBITED) if (re.test(text)) { prohibited = label; break; }

  return { contacts, prohibited, scam: SCAM.test(text) };
}

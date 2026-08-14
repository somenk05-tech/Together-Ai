/**
 * "FORGET" IS A COMMAND, AND IT IS THE ONE WRITE SHE MAY EVER DO.
 *
 * Mira now keeps every conversation (MiraTurn) — that record is her memory,
 * and the promise that makes a memory tolerable is that the citizen can take
 * any of it back. The executor still has no branch that writes to the city;
 * this is not the city, it is HER OWN NOTEBOOK, and the only verb is
 * tearing pages out. Nothing here can create, order, send or spend.
 *
 * PURE, AND ITS OWN FILE, because the interesting part is telling a command
 * from a figure of speech. "Forget it" is a person dropping a subject.
 * "I forgot my keys" is a person telling you about their morning. "Don't
 * forget the milk" is the OPPOSITE of this feature. Deleting somebody's
 * history off any of those would be the scariest bug this module could have,
 * so the reader is strict: it acts only on a sentence that begins as an
 * instruction to her, and everything else returns null and flows on to the
 * conversation she would have had anyway.
 */

export interface ForgetAsk {
  scope: 'everything' | 'topic' | 'dismiss' | 'unclear';
  topic?: string;
}

const EVERYTHING = /^(?:about\s+)?(?:everything|all(?:\s+of\s+it)?|it\s+all|all\s+our\s+(?:chats|conversations|talks)|our\s+(?:chats|conversations)|everything\s+about\s+me|my\s+(?:history|memory|data))[.!\s]*$/i;

/** Figures of speech: dropping the subject, not requesting a deletion. */
const DISMISS = /^(?:about\s+)?(?:it|that|this)[.!\s]*$/i;

export function readForget(text: string): ForgetAsk | null {
  const t = (text ?? '').trim();
  // Not a command when negated, past-tense about themselves, or about the
  // future ("don't forget", "never forget", "i forgot", "forgot to").
  if (/\b(?:don'?t|do\s+not|never|won'?t|wouldn'?t|shouldn'?t)\s+forget\b/i.test(t)) return null;
  if (/\bforgot\b/i.test(t)) return null;

  const m = /^(?:hey\s+)?(?:mira[,!]?\s+)?(?:please\s+)?(?:can|could|will|would)?\s*(?:you\s+)?(?:please\s+)?forget\b(.*)$/i.exec(t);
  if (!m) return null;

  const rest = m[1].trim().replace(/[.!?\s]+$/, '');
  if (!rest) return { scope: 'unclear' };
  if (DISMISS.test(rest)) return { scope: 'dismiss' };
  if (EVERYTHING.test(rest)) return { scope: 'everything' };

  const topic = rest
    .replace(/^(?:everything\s+)?(?:about\s+)?/i, '')
    .replace(/^(?:what\s+i\s+(?:said|told\s+you)\s+about\s+)/i, '')
    .replace(/^(?:that\s+)/i, '')
    .trim();
  if (topic.length < 3) return { scope: 'unclear' };
  return { scope: 'topic', topic };
}

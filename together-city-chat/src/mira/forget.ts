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

/**
 * "FORGET" WAS THE ONLY WORD SHE KNEW FOR IT.
 *
 * Which meant "delete my history", "erase everything you know about me" and
 * "wipe my data" — the three ways a person actually asks for this, and the
 * three the privacy copy itself invites — all returned null and were answered
 * as ordinary conversation. A promise the citizen can take any of it back is
 * only as good as the sentences that reach the code. The synonyms go under the
 * same guards as `forget`, not around them.
 */
const VERB = String.raw`(?:forget|delete|erase|wipe|remove)`;

/**
 * WHO SHE IS BEING ASKED BY, AND HOW POLITELY.
 *
 * The anchor rejects any prefix it does not list, and the list was short enough
 * that "I want you to forget everything" — the plainest possible way to say it —
 * returned null. Adding a prefix is cheap; the strictness that matters is the
 * VERB and the fact that the sentence has to be addressed to her, and neither
 * of those is relaxed here.
 */
const ASK = new RegExp(
  String.raw`^(?:hey\s+)?(?:mira[,!]?\s+)?(?:please\s+)?` +
  String.raw`(?:i\s+want\s+you\s+to\s+|i'?d\s+like\s+you\s+to\s+|you\s+can\s+|just\s+|maybe\s+)?` +
  String.raw`(?:can|could|will|would)?\s*(?:you\s+)?(?:please\s+)?(?:kindly\s+)?` +
  VERB + String.raw`\b(.*)$`,
  'i',
);

const EVERYTHING = /^(?:about\s+)?(?:everything|all(?:\s+of\s+it)?|it\s+all|all\s+our\s+(?:chats|conversations|talks)|our\s+(?:chats|conversations)|everything\s+(?:you\s+know\s+)?about\s+me|everything\s+you\s+know|everything\s+i\s+(?:said|told\s+you)|my\s+(?:history|memory|data|chat\s+history))[.!\s]*$/i;

/** Figures of speech: dropping the subject, not requesting a deletion. */
const DISMISS = /^(?:about\s+)?(?:it|that|this)[.!\s]*$/i;

/**
 * A TOPIC HAS TO BE A TOPIC.
 *
 * "forget her" passed the old three-character floor and became a topic — which
 * would send a bare pronoun to a search over her whole memory and delete
 * whatever came back. Anything this thin is a sentence she has misread, and the
 * honest answer to a misreading is to ask, not to delete.
 */
const BARE = /^(?:her|him|them|it|me|us|the|that|this|one|all)$/i;

export function readForget(text: string): ForgetAsk | null {
  const t = (text ?? '').trim();
  // Not a command when negated, past-tense about themselves, or about the
  // future ("don't forget", "never forget", "i forgot", "forgot to").
  if (new RegExp(String.raw`\b(?:don'?t|do\s+not|never|won'?t|wouldn'?t|shouldn'?t)\s+${VERB}\b`, 'i').test(t)) return null;
  if (/\bforgot\b/i.test(t)) return null;

  const m = ASK.exec(t);
  if (!m) return null;

  const rest = m[1].trim().replace(/[.!?\s]+$/, '');
  if (!rest) return { scope: 'unclear' };
  if (DISMISS.test(rest)) return { scope: 'dismiss' };
  if (EVERYTHING.test(rest)) return { scope: 'everything' };

  /**
   * "forget everything else and tell me about my day" used to fall past the
   * anchored EVERYTHING pattern into the topic branch and come out as the topic
   * "else and tell me about my day" — a garbage string, handed to a delete.
   * A sentence that opens with "everything" and is not one of the phrases above
   * or a narrowing of it ("everything about the loan", "everything I told you
   * yesterday") is one she has not understood.
   */
  const narrowed = rest
    .replace(/^everything\s+(?:i\s+(?:said|told\s+you)|you\s+know)\s+(?:about\s+)?/i, '')
    .replace(/^everything\s+about\s+/i, '');
  if (narrowed === rest && /^everything\b/i.test(rest)) return { scope: 'unclear' };

  const topic = narrowed
    .replace(/^(?:about\s+)?/i, '')
    .replace(/^(?:what\s+i\s+(?:said|told\s+you)\s+about\s+)/i, '')
    .replace(/^(?:that\s+)/i, '')
    .trim();
  const words = topic.split(/\s+/).filter(Boolean);
  if (!topic || BARE.test(topic)) return { scope: 'unclear' };
  if (words.length < 2 && topic.length < 5) return { scope: 'unclear' };
  return { scope: 'topic', topic };
}

/**
 * The second turn, for the one write she can do.
 *
 * Deliberately a closed list. Everything that is not plainly a yes or plainly a
 * no comes back undefined, and undefined has to mean "ask again" at the call
 * site — because the cost of reading a hesitant sentence as consent is a
 * deletion nobody can undo, and the cost of asking twice is one turn.
 */
export function readForgetConfirm(text: string): 'yes' | 'no' | undefined {
  const t = (text ?? '').trim().toLowerCase().replace(/[.!,\s]+$/, '');
  if (/^(?:yes|yeah|yep|yup|do it|go ahead|confirm|haan)(?:\s+please)?$/.test(t)) return 'yes';
  if (/^(?:no|nope|cancel|stop|leave it|nahi|nahin)(?:\s+please)?$/.test(t)) return 'no';
  return undefined;
}

import { stripCityFooter } from './quoted';

/**
 * WRITE THE QUOTED TRAIL A REPLY CARRIES.
 *
 * A reply sent from this city used to leave with nothing under it. Inside the
 * app that read fine — the thread is on screen — but the recipient is usually
 * outside it, and what landed in their Gmail was a bare "yes, Tuesday works"
 * with no indication of what Tuesday was. Every mail client on earth quotes
 * the message it is answering, and the absence is not minimalism; it is a
 * message that cannot be read on its own.
 *
 * THE SHAPE IS THE ONE OUR OWN PARSER ALREADY LOOKS FOR. quoted.ts recognises
 * `On <date> <person> wrote:` followed by `>`-prefixed lines, because that is
 * what arrives from Gmail and Apple Mail. Writing the same shape means a reply
 * we send and a reply we receive collapse identically when either comes back —
 * and replyQuote.test.ts asserts the round trip rather than trusting that two
 * files agree.
 *
 * PURE, AND ITS OWN FILE, for the reason quoted.ts gives: the interesting part
 * is the text, not the component.
 */

/** How much of one message is quoted. A trail is quoted from the newest
 *  message only — the older ones are already inside that one's own quote — but
 *  a single message can still be enormous, and nobody reads the bottom of a
 *  400-line quotation. */
export const QUOTE_LINE_CAP = 60;

const attribution = (name: string, addr: string, at: Date): string => {
  // "On 14 Aug 2026 at 2:09 am, Somen K <somen@togethercity.app> wrote:"
  const when = at.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const who = name && name !== addr ? `${name} <${addr}>` : addr;
  return `On ${when}, ${who} wrote:`;
};

export interface Quotable {
  fromName: string;
  fromAddr: string;
  body: string;
  createdAt: string;
}

/**
 * The block that goes under a reply: one attribution line, a blank line, then
 * the quoted body with `> ` in front of every line.
 *
 * The city's own outbound footer is stripped first. It is the single most
 * repeated string in any thread, it says nothing the reader does not know, and
 * left in it would be quoted again on every exchange until the message is
 * mostly footer.
 */
export function quoteBlock(m: Quotable): string {
  const at = new Date(m.createdAt);
  const clean = stripCityFooter(m.body ?? '');
  const lines = clean.split('\n');
  const kept = lines.slice(0, QUOTE_LINE_CAP).map((l) => (l ? `> ${l}` : '>'));
  if (lines.length > QUOTE_LINE_CAP) {
    // Said out loud rather than trimmed in silence: a quotation that stops
    // without saying so reads as the whole of what was written.
    kept.push('>', `> … ${lines.length - QUOTE_LINE_CAP} more lines`);
  }
  return [attribution(m.fromName, m.fromAddr, at), '', ...kept].join('\n');
}

/**
 * What actually gets sent: what the citizen wrote, then the quotation.
 *
 * Two blank lines between them, which is what quoteStart() needs to find the
 * attribution line at the start of a line of its own, and what every client
 * puts there.
 */
export function withQuote(typed: string, quote: string): string {
  const body = (typed ?? '').replace(/\s+$/, '');
  if (!quote) return body;
  return `${body}\n\n${quote}`;
}

import { firstName, salutation } from '../shared/salutation';

/**
 * Every message Together City sends opens by addressing the person.
 *
 * Applied at the two dispatch methods rather than in each template, because
 * there are eight callers and five receipt builders and the rule is "always" —
 * a rule enforced in thirteen places is a rule that will be missed in the
 * fourteenth. MailService.deliverSystem and .deliverTo are the one door.
 *
 * A message that already opens with a salutation is left alone. The blood-test
 * narrative writes its own, and greeting somebody twice is worse than not at
 * all.
 */

/** Does this body already open by addressing the reader? */
export function alreadyGreeted(body: string): boolean {
  // Only the first non-empty line counts — "Dear" later in a sentence is not a
  // salutation.
  //
  // And the comma is required, which is the part worth stating. Matching on the
  // greeting word alone read "Hello world" and "Hi there" as salutations, so a
  // message whose first line happened to open that way would never be greeted —
  // a silent false negative in a rule whose whole point is "always". A
  // salutation is a greeting word, a short name, then a comma.
  const first = (body ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return /^(dear|hi|hello|hey)\b[^\n]{0,40},/i.test(first);
}

/** Prepend the salutation to a plain-text body. */
export function greetText(body: string, name?: string | null): string {
  if (alreadyGreeted(body)) return body;
  return `${salutation(name)}\n\n${body ?? ''}`;
}

/**
 * The same greeting, inline, for SMS.
 *
 * A text message is read in a lock-screen preview, and a paragraph break would
 * push a verification code below the fold — so the person has to open the
 * message to see the thing the message is for. "Dear Somen, 123456 is your
 * code" is just as personal and still shows the code in the preview.
 */
export function greetSms(body: string, name?: string | null): string {
  if (alreadyGreeted(body)) return body;
  return `${salutation(name)} ${(body ?? '').trim()}`;
}

const INK = '#1c1c1a';

/**
 * Put the salutation into an HTML body, where a letter's salutation goes.
 *
 * Before the first <h1> when there is one — these templates all open with a
 * heading inside a card, and above that heading is where a reader expects to be
 * addressed. Otherwise just inside <body>. Otherwise at the front, which is
 * correct for a fragment.
 */
export function greetHtml(html: string, name?: string | null): string {
  if (!html) return html;
  // Strip tags before testing, so markup around the greeting does not hide it.
  if (alreadyGreeted(html.replace(/<[^>]*>/g, ' '))) return html;

  const line = `<p style="color:${INK};font-size:15px;font-weight:600;margin:0 0 14px;">${escapeHtml(salutation(name))}</p>`;

  const h1 = html.search(/<h1\b/i);
  if (h1 !== -1) return html.slice(0, h1) + line + html.slice(h1);

  const body = /<body\b[^>]*>/i.exec(html);
  if (body) {
    const at = body.index + body[0].length;
    return html.slice(0, at) + line + html.slice(at);
  }
  return line + html;
}

/**
 * A name in a salutation is citizen-supplied text going into an email body.
 * It has never been HTML-escaped anywhere in this codebase, and "Dear
 * <script>…" in a mail client is a smaller problem than in a browser but not a
 * problem worth keeping.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** Exported for the one caller that wants the name without the "Dear". */
export { firstName };

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE ONE THING BCC HAS TO DO.
 *
 * Cc and Bcc are the same mechanism with one difference, and the difference is
 * the whole feature: a Cc list travels on every copy, and a Bcc list travels on
 * the sender's copy alone. Get that backwards and a message quietly tells every
 * reader who was blind-copied — silently, with nothing on screen looking wrong,
 * to people who were promised the opposite.
 *
 * It is enforced where the rows are WRITTEN rather than where they are read,
 * because there will always be more readers than writers, and a reader that
 * forgets is a leak. These tests read the source: they are about the shape of
 * the write, which is the thing that must not drift.
 */
const src = readFileSync(join(__dirname, 'mail.service.ts'), 'utf8');

/** Comments explain intent; they are not behaviour. Strip them before matching. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const code = stripComments(src);

describe('a blind copy stays blind', () => {
  it('never writes bccAddrs onto a recipient row', () => {
    // The recipient's inbox row is created from `base`, and `base` carries cc
    // and not bcc. If bccAddrs ever appears in the same object literal as
    // folder: 'inbox', somebody has just published the blind list.
    const inboxWrites = code.split('\n').filter((l) => /folder:\s*'inbox'/.test(l));
    expect(inboxWrites.length).toBeGreaterThan(0);
    expect(inboxWrites.filter((l) => /bccAddrs/.test(l))).toEqual([]);
  });

  it('puts bccAddrs on the sender copy and nowhere else', () => {
    const sentWrites = code.split('\n').filter((l) => /folder:\s*'sent'/.test(l) && /create\(/.test(l));
    expect(sentWrites.some((l) => /bccAddrs/.test(l))).toBe(true);
  });

  it('carries cc on every copy, because openly copied means openly', () => {
    // If cc lived only on the sender's row, Cc would silently mean Bcc.
    expect(code).toMatch(/ccAddrs:\s*dto\.ccAddrs/);
  });

  it('writes the blind list only for the copy that keeps the Sent row', () => {
    // Fanning out to five people must not produce five Sent rows, and must not
    // produce five chances to attach the blind list. The condition is the
    // ledger rather than the index because a refused first recipient writes no
    // row — see sent-is-written-by-whoever-arrives.spec.ts, which asserts the
    // behaviour this line only describes.
    expect(code).toMatch(/bccAddrs:\s*!ownCopy\.written && bcc\.length/);
  });
});

describe('fanning out to several people', () => {
  it('sends one copy to somebody named twice', () => {
    // A person on both To and Cc is one recipient. Two copies is a bug they
    // notice and the sender does not.
    expect(code).toMatch(/seen\.has\(norm\(a\)\)/);
  });

  it('reports which addresses failed rather than failing the message', () => {
    // "Could not send" on a message to five people is an error nobody can act
    // on — the citizen cannot tell whether to retype one address or all five.
    expect(code).toMatch(/failed:\s*Array<\{ to: string; reason: string \}>/);
    expect(code).toMatch(/delivered: sent, failed/);
  });

  it('clears the draft once, after the fan-out, not once per recipient', () => {
    const sendBlock = code.slice(code.indexOf('async send(userId'), code.indexOf('private async sendOne'));
    expect((sendBlock.match(/clearDraft/g) ?? []).length).toBe(1);
  });
});

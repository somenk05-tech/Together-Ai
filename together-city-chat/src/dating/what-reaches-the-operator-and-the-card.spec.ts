import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── THE DIGEST, THE NUMBER, THE UPLOAD, AND A PROMISE ABOUT A DELETED FILE ──
 *
 * Four findings from the fourth audit that share nothing except being true.
 */
const svc = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');
const ctrl = readFileSync(join(__dirname, 'dating.controller.ts'), 'utf8');

describe('what reaches the operator, and the card', () => {
  /**
   * The digest is the only thing in this hub whose purpose is to reach somebody
   * who is not looking — a stopped photo pipeline, a report backlog, the day's
   * 5xx count. Every other job degrades to an in-process run when the queue is
   * off. This one did not, and said nothing about not running.
   */
  it('sends the digest even with no queue behind it', () => {
    const init = svc.slice(svc.indexOf('onModuleInit(): void {'), svc.indexOf('onModuleDestroy'));
    expect(init).toMatch(/schedule\(JOB_DIGEST, '30 3 \* \* \*'\)\.then\(\(queued\) => \{/);
    expect(init).toMatch(/funnelDigest\(\), 'dating: funnel digest \(in-process\)'/);
    // A date guard, not a daily timer: a restart cannot skip a day and two
    // restarts in one day cannot send twice.
    expect(init).toMatch(/today === this\.lastDigestDay/);
    expect(svc).toMatch(/const DIGEST_CHECK_MS = 60 \* 60_000;/);
  });

  it('clears both timers on shutdown', () => {
    const destroy = svc.slice(svc.indexOf('onModuleDestroy(): void {'), svc.indexOf('onModuleDestroy(): void {') + 260);
    expect(destroy).toMatch(/clearInterval\(this\.photoRetryTimer\)/);
    expect(destroy).toMatch(/clearInterval\(this\.digestTimer\)/);
  });

  /**
   * Curated Matches reads `stack`, and `stack` was the one list that did not
   * send `coverage` — so the screen a citizen reaches after somebody chose them
   * back showed a bare percentage, with coverageShort() returning null on the
   * other side for a number it never received.
   */
  it('sends coverage on the stack card, where Curated Matches reads it', () => {
    const card = svc.slice(svc.indexOf('(isMatched ? matchedCards : cards).push({'), svc.indexOf('// Compatibility-band histogram'));
    expect(card).toMatch(/coverage: coverage\(myD, candDX, myInterests, theirInterests\)/);
  });

  it('does not hand the whole minute to one set of photographs', () => {
    const m = /const UPLOAD_LIMIT = \{ default: \{ ttl: 60_000, limit: (\d+) \} \};/.exec(ctrl);
    expect(m).not.toBeNull();
    // Ten is the number of photographs the editor lets somebody pick at once.
    expect(Number(m![1])).toBeGreaterThanOrEqual(20);
  });

  /**
   * A rejection deletes the object. Overturning flips a status row, so the key
   * signs a link to nothing — and the citizen was told the photo was showing
   * again.
   */
  it('does not promise back a photograph that was deleted', () => {
    expect(svc).not.toMatch(/Your photo is showing again/);
    expect(svc).toMatch(/That decision was overturned\. The photo itself was deleted when it was refused/);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A DECISION THE PERSON IT HAPPENED TO IS TOLD ABOUT ──
 *
 * moderateDecision wrote two columns, wrote a log, and ended every chat the
 * citizen was in — without a word. Their matches and conversations vanished at
 * once and the only way to learn why was to open the dating profile page and
 * read a banner nobody had told them to look at. decideAppeal, the same file
 * and the same kind of decision, has always notified.
 *
 * Also pinned here: the one genuinely quadratic loop in the hub, which was
 * `indexOf` inside the loop it was indexing, on a list that stopped being
 * capped when the conversation cap was removed.
 */
const svc = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');
const moderate = svc.slice(svc.indexOf('async moderateDecision('), svc.indexOf('// ─────────────── appeals ───────────────'));

describe('a decision somebody is told about', () => {
  it('tells the citizen their profile was taken down, and where to argue', () => {
    expect(moderate).toMatch(/notifications\.create\(/);
    expect(moderate).toMatch(/Your dating profile was taken down/);
    expect(moderate).toMatch(/href: '\/dating\/safety'/);
  });

  it('says nothing on an approval — there is nothing to tell', () => {
    expect(moderate).toMatch(/if \(decision === 'rejected'\) \{\s*\n\s*void this\.notifications\.create/);
  });

  /**
   * The moderation reason is written for the log and the moderator. Delivering
   * it as a push is not the same object as a sentence written to be read by the
   * person refused.
   */
  it('does not push the internal reason at them', () => {
    const push = moderate.slice(moderate.indexOf('Your dating profile was taken down') - 200);
    expect(push).not.toMatch(/body: reason|\$\{reason\}/);
  });

  it('does not scan the match list once per row to find its own key', () => {
    // The code, not the comment above it that records what it used to be.
    const code = svc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/matches\.indexOf\(/);
    expect(svc).toMatch(/scoreOf\.get\(\[userId, otherId\]\.sort\(\)\.join\(':'\)\)/);
  });
});

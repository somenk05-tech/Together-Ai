import { readFileSync } from 'fs';
import { join } from 'path';
import { decide } from '../realestate/moderation';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── A SILENCE IS NOT AN APPROVAL (audit finding 14) ─────────────────────────
 *
 * The bio AI check returned null on any failure — client unconfigured, call
 * threw, malformed answer — and `decide` skipped both AI branches, so a bio
 * that passed the regexes was APPROVED precisely when the AI was broken.
 * Photos fail closed on the same class of failure; bios failed open, in the
 * same product, decided in the same file.
 */
describe('a silence is not an approval', () => {
  it('holds a bio for review when the check could not run', () => {
    const svc = code(read('dating/dating.service.ts'));
    // The unavailable branch exists, is a soft failure, and reads as a hold.
    expect(svc).toMatch(/const wantsAi = bio\.length >= 15/);
    expect(svc).toMatch(/if \(wantsAi && ai === null\)/);
    expect(svc).toMatch(/name: 'bio-ai-unavailable', pass: false, severity: 'soft'/);
  });

  it('a soft failure lands on review, not approved and not rejected', () => {
    // The mechanism this relies on, proven against decide() itself rather
    // than assumed: one failing soft check moves the decision to `review`.
    const out = decide(
      [{ name: 'bio-ai-unavailable', pass: false, severity: 'soft', detail: 'held' }],
      0,
      undefined,
    );
    expect(out.decision).toBe('review');
  });

  it('and review is fail-closed — the pool only takes approved', () => {
    const svc = code(read('dating/dating.service.ts'));
    // poolWhere asks for exactly `moderation: 'approved'`; `review` is out.
    expect(svc).toMatch(/visible: true, moderation: 'approved'/);
    // The decision is written to the row as-is, so `review` reaches the column.
    expect(svc).toMatch(/data: \{ moderation: result\.decision, moderationJson/);
  });

  it('short bios stay regex-only, as they always were', () => {
    // Under 15 characters there is no room to solicit or scam; the hard
    // regex checks still run. Sending those to a human queue would bury the
    // queue in "hi :)" — a held queue nobody can empty is fail-open wearing
    // a fail-closed costume.
    const svc = code(read('dating/dating.service.ts'));
    expect(svc).toMatch(/const ai = wantsAi \? await this\.aiBioModeration\(bio\) : null/);
  });
});

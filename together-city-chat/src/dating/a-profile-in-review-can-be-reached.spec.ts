import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A PROFILE IN REVIEW CAN BE REACHED BY A PERSON ──
 *
 * `moderation: 'review'` is what upsertProfile writes when a bio check comes
 * back soft — an AI that returned nothing, a check that could not run. It takes
 * the citizen out of the pool at once, because poolWhere demands `approved`.
 *
 * And nothing in the product ever LISTED those rows. adminStats counted them.
 * The moderation console had reports, held photos and appeals. moderateDecision
 * needs a targetUserId a moderator could only obtain from a report. So somebody
 * whose bio tripped a soft failure was invisible to the city and invisible to
 * the people who could put it right, and their only exit was to find the Safety
 * Centre unprompted and appeal a decision nobody had told them about.
 *
 * Reported by the second audit as "the verification queue has no reviewer
 * screen" and again by the fourth. This is the screen.
 */
const svc = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');
const ctrl = readFileSync(join(__dirname, 'dating.controller.ts'), 'utf8');
const queue = svc.slice(svc.indexOf('async profileQueue('), svc.indexOf('async photoQueue('));

describe('a profile in review can be reached', () => {
  it('is behind the same permission every other queue is', () => {
    expect(queue).toMatch(/access\.assert\(adminId, 'moderation\.read'\)/);
    expect(ctrl).toMatch(/@Get\('admin\/profiles'\)/);
  });

  it('lists what is held, and what is stuck', () => {
    expect(queue).toMatch(/\{ moderation: 'review' \}/);
    // `pending` is the absence of a verdict, not a verdict — a pile of them
    // means the pipeline stopped. An hour, so a profile saved a moment ago is
    // in flight rather than reported as stuck.
    expect(queue).toMatch(/\{ moderation: 'pending', updatedAt: \{ lt: stale \} \}/);
    expect(queue).toMatch(/60 \* 60_000/);
  });

  it('leaves out people who are gone, and puts the longest wait first', () => {
    expect(queue).toMatch(/user: DatingService\.STILL_HERE/);
    expect(queue).toMatch(/orderBy: \{ updatedAt: 'asc' \}/);
    expect(queue).toMatch(/take: 100/);
  });

  /**
   * The appeal queue learned this on 27 Aug: a moderator handed free text and
   * nothing else decides blind. Same three facts here — the age, the bio that
   * was judged, and what the checks actually said.
   */
  it('carries the facts the decision turns on', () => {
    expect(queue).toMatch(/age: this\.ageOf\(r\.birthDate\)/);
    expect(queue).toMatch(/bio: \(r\.bio \?\? ''\)\.slice\(0, 600\)/);
    expect(queue).toMatch(/reasons/);
  });

  it('does not invent a second way to decide', () => {
    // The existing route, with its written reason, audit row and notification.
    expect(ctrl).toMatch(/@Post\('admin\/moderation\/:targetUserId'\)/);
    expect(queue).not.toMatch(/datingProfile\.update/);
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { profileCompletion } from './completion';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const readWeb = (p: string) =>
  readFileSync(join(__dirname, '..', '..', '..', 'together-city-react', 'src', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── A RULE AND THE SCREEN IT GOVERNS, IN TWO DIFFERENT METHODS ──────────────
 *
 * `DatingMatches.tsx` — the page titled "Curated Matches" — switched from
 * `useDatingMatches` to `useDatingStack` on 26 Jul. On 1 Aug two quality rules
 * were written into `matchesUncached`: a 40% profile-completion floor and a
 * requirement that a candidate has stated what they are looking for. They were
 * added to a method that had been dead for six days.
 *
 * For the month that followed, the curated shelf showed near-empty profiles
 * and profiles with no stated intent, while the comment directly above the
 * rules said "a strong score over a stub oversells a stranger" and "a stated
 * intent is the price of being on somebody's curated shelf". Both sentences
 * were false, and nothing anywhere went red:
 *
 *   - `GET /dating/matches` still answered 200, so no integration check
 *     noticed the route had no caller.
 *   - No spec asserted either rule, so deleting them would also have been
 *     silent.
 *   - The screen kept working perfectly. It was showing MORE people, which is
 *     the failure mode nobody reports.
 *
 * The fix moved the rules onto the stack and deleted `matches()` outright, so
 * there is no longer a second place where the shelf's rules can be edited
 * without effect. This file is the coverage that was missing. Each assertion
 * names the way the defect comes back.
 */
describe('the curated shelf enforces its own rules', () => {
  const svc = code(read('dating/dating.service.ts'));
  const stack = svc.slice(svc.indexOf('private async stackUncached('));

  it('has no second method where the rules could be written and not run', () => {
    // THE ROOT CAUSE. While `matches()` exists, a future edit can land in it
    // and change nothing — which is exactly what happened on 1 Aug. The guard
    // is the absence of the method, not the presence of the rules.
    expect(svc).not.toMatch(/matchesUncached\s*\(/);
    expect(svc).not.toMatch(/async matches\(userId/);
    expect(code(read('dating/dating.controller.ts'))).not.toMatch(/@Get\('matches'\)/);
  });

  it('keeps the route family that is still live', () => {
    // The negative above must not be over-broad: `matches/:targetUserId` and
    // its verbs are the whole of liking, unlocking and reporting.
    const ctl = code(read('dating/dating.controller.ts'));
    for (const route of ["@Get('matches/:targetUserId')", "@Post('matches/:targetUserId/like')"]) {
      expect({ route, present: ctl.includes(route) }).toEqual({ route, present: true });
    }
  });

  it('applies the completion floor and the stated intent inside the stack', () => {
    expect(stack).toMatch(/candCompletion\.percent < CURATED_MIN_COMPLETION/);
    expect(stack).toMatch(/canonicalGoal\(candDX\.relationshipGoal\)/);
  });

  it('never un-shows somebody you already matched', () => {
    // These are discovery filters. The stack deliberately merges matched
    // partners in, so a rule applied to them would delete an existing match
    // from the page the moment that person trimmed their bio — the same
    // defect the takedown fix had to repair on 28 Aug. Both rules must sit
    // inside the `!isMatched` block, and the block must close after them.
    const guard = stack.indexOf('if (!isMatched) {');
    const floor = stack.indexOf('candCompletion.percent < CURATED_MIN_COMPLETION');
    const intent = stack.indexOf('canonicalGoal(candDX.relationshipGoal)');
    const breakdown = stack.indexOf('const breakdown = factorScores(');
    expect(guard).toBeGreaterThan(-1);
    expect(floor).toBeGreaterThan(guard);
    expect(intent).toBeGreaterThan(guard);
    // Scored AFTER the filters, so a skipped candidate is never scored at all.
    expect(breakdown).toBeGreaterThan(intent);
  });

  it('asks for a stated intent in romantic only, so friendship is not emptied', () => {
    // The dead code applied this to both kinds. `relationshipGoal` is a
    // romantic field, so on the friendship tab that rule drops EVERY
    // candidate — a whole tab rendered empty by a line nobody ran. Copying
    // the rule across faithfully would have shipped that.
    expect(stack).toMatch(/kind === 'romantic' && !canonicalGoal\(candDX\.relationshipGoal\)/);
  });

  it('is the method the Curated Matches page actually calls', () => {
    // THE FAILURE ITSELF, pinned from the other end. A page that reads one
    // method while the rules live in another is what this whole file is
    // about, and it is invisible from the server side alone.
    const page = readWeb('features/dating/pages/DatingMatches.tsx');
    expect(page).toMatch(/useDatingStack/);
    expect(page).not.toMatch(/useDatingMatches/);
    expect(readWeb('features/dating/api.ts')).not.toMatch(/api\.get<CuratedMatch\[\]>\('\/dating\/matches'/);
  });

  it('still emits the funnel step the deleted method used to carry', () => {
    // `dating.matches.viewed` is step three of six. It was emitted ONLY by
    // `matchesUncached`, so it has read zero since 26 Jul and the digest has
    // been reporting a 0% conversion out of `dating.profile.approved` ever
    // since. Deleting the method without moving this would have left a
    // permanently-zero funnel step and a standing false alarm.
    expect(stack).toMatch(/analytics\.track\('dating\.matches\.viewed'/);
    const funnel = read('analytics/analytics.service.ts');
    expect(funnel).toMatch(/'dating\.matches\.viewed'/);
  });

  it('sets the floor where a stub fails it and a real profile clears it', () => {
    // The constant has to mean something. A bare row must land under 40 and a
    // profile with substance over it, or the rule above is arithmetic that
    // filters nobody.
    const stub = profileCompletion({ bio: '', interests: [] });
    expect(stub.percent).toBeLessThan(40);

    const real = profileCompletion({
      bio: 'Long enough to say something true about myself and what I am looking for.',
      interests: ['Travel', 'Music', 'Cooking'],
      relationshipGoal: 'long-term', height: 170, education: 'Masters',
      occupation: 'Architect', drinking: 'socially', smoking: 'never',
      children: 'none', religion: 'hindu', languages: ['English', 'Hindi'],
      photos: ['a', 'b'],
    } as Record<string, unknown>);
    expect(real.percent).toBeGreaterThanOrEqual(40);
  });
});

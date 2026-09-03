import { UpsertDatingProfileSchema } from './dto/dating.dto';
import { MIN_DATING_AGE, floorAgePreferences } from '../shared/age';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── THE AGE GATE, AND WHY IT NEEDED FIXING IN FOUR PLACES ───────────────────
 *
 * The launch audit found an 18+ check that existed, was correct, and did
 * nothing useful — because of WHERE it ran. Four defects, one subject:
 *
 *   1. It ran inside `moderateProfile`, THIRTY-FIVE LINES after the row was
 *      written, and the write left `moderation` alone. A new row took the
 *      column default — `approved` — and an edited row kept whatever it had.
 *      Since `moderateProfile` makes a live AI call, every save was a window
 *      in which a child's profile sat in every adult's pool, with photographs.
 *   2. The column defaults themselves were `approved` and `true`, so any path
 *      that did not set them created a live profile.
 *   3. Rejection did nothing to the REJECTED person: five entrypoints asked
 *      only whether a profile row existed, so a rejected minor kept browsing,
 *      liking, and hosting activities that open private chats with adults.
 *   4. `prefAgeMin` had no server floor, and a declared under-18 date of birth
 *      on the Master Profile blocked the copy but left the live dating row
 *      alone.
 *
 * There was no test coverage for any of it. That is the other half of why it
 * survived. This file is that coverage, and every assertion below names the
 * defect it exists to stop coming back.
 */
describe('the age gate refuses at the door', () => {
  const base = {
    gender: 'female' as const, seeking: 'any' as const,
    birthDate: '1995-06-15', interests: ['Travel'],
  };
  const yearsAgo = (n: number) => {
    const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString().slice(0, 10);
  };

  it('refuses an under-18 profile before anything is written', () => {
    // DEFECT 1. A rejected parse means the service is never entered, so there
    // is no row, no window, and no rejected-but-readable state to clean up.
    const r = UpsertDatingProfileSchema.safeParse({ ...base, birthDate: yearsAgo(14) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['birthDate']);
      expect(r.error.issues[0].message).toMatch(new RegExp(`${MIN_DATING_AGE} or older`));
    }
  });

  it('accepts an adult, and one exactly at the boundary', () => {
    expect(UpsertDatingProfileSchema.safeParse({ ...base, birthDate: yearsAgo(30) }).success).toBe(true);
    expect(UpsertDatingProfileSchema.safeParse({ ...base, birthDate: yearsAgo(18) }).success).toBe(true);
    expect(UpsertDatingProfileSchema.safeParse({ ...base, birthDate: yearsAgo(17) }).success).toBe(false);
  });

  it('refuses a birth date it cannot read, rather than letting it past', () => {
    // A future date is the sharp one: subtract it the wrong way and it reads
    // as a very large age.
    for (const bad of ['2040-01-01', '0000-01-01']) {
      expect({ bad, ok: UpsertDatingProfileSchema.safeParse({ ...base, birthDate: bad }).success })
        .toEqual({ bad, ok: false });
    }
  });

  it('takes the profile OUT of the pool while it is being moderated', () => {
    // DEFECT 1, the other half — for every check, not just age. The write must
    // say `pending` so `poolWhere` cannot match it during the AI call.
    const svc = code(read('dating/dating.service.ts'));
    const write = svc.slice(svc.indexOf('const data = {'), svc.indexOf('datingProfile.upsert'));
    expect(write).toMatch(/moderation: 'pending'/);
  });

  it('defaults the columns closed, for every path that does not set them', () => {
    // DEFECT 2. Belt to the braces above: the schema AND a migration, because
    // a schema edit with no migration is a default that never reaches the
    // database this runs against.
    const schema = read('../prisma/schema.prisma');
    const dating = schema.slice(schema.indexOf('model DatingProfile'), schema.indexOf('model DatingProfile') + 2000);
    expect(dating).toMatch(/moderation String\s+@default\("pending"\)/);
    expect(dating).toMatch(/visible\s+Boolean\s+@default\(false\)/);
    const sql = read('../prisma/migrations/20260827120000_dating_defaults_fail_closed/migration.sql');
    expect(sql).toMatch(/ALTER COLUMN "moderation" SET DEFAULT 'pending'/);
    expect(sql).toMatch(/ALTER COLUMN "visible" SET DEFAULT false/);
  });

  it('closes the door on a profile that is not approved', () => {
    // DEFECT 3. Every browse entrypoint and activity hosting go through one
    // helper. A sixth call site added later that reads the table directly is
    // the way this comes back, so the count is pinned.
    const svc = code(read('dating/dating.service.ts'));
    expect(svc).toMatch(/private async myApprovedProfile\(userId: string\)/);
    expect(svc).toMatch(/if \(state !== 'approved'\)/);
    // Named rather than counted: a count cannot see a NEW ungated entrypoint,
    // and these four are the ones that show a citizen somebody else.
    // `matchesUncached` was the fourth until 28 Aug, when it was deleted: the
    // curated shelf's rules moved onto the stack and the dead route went with
    // them. Removing it from this list is the only edit that change needed
    // here, which is the point — the gate is per-entrypoint, not a count.
    for (const fn of ['discoverUncached', 'stackUncached', 'matchDetail']) {
      const at = svc.indexOf(`${fn}(`);
      const body = svc.slice(at, at + 400);
      expect({ fn, gated: /myApprovedProfile\(/.test(body) }).toEqual({ fn, gated: true });
    }
    // The appeal path deliberately does NOT come through it — a rejected
    // citizen must be able to appeal their own rejection.
    // 2000, not 600: the photo branch above it grew a gate of its own on 3 Sep
    // (an appeal now needs a review row that actually carries a refusal), and
    // the window this reads has to reach past it.
    const appeal = svc.slice(svc.indexOf("kind === 'dating_profile'"), svc.indexOf("kind === 'dating_profile'") + 2000);
    expect(appeal).toMatch(/mine\.moderation === 'approved'/);
  });

  it('floors the age preference, and never inverts the range doing it', () => {
    // DEFECT 4a. Clamped rather than rejected: a stale value the citizen never
    // set this time should not fail their whole save.
    const dx: Record<string, unknown> = { prefAgeMin: 13, prefAgeMax: 16 };
    floorAgePreferences(dx);
    expect(dx).toEqual({ prefAgeMin: 18, prefAgeMax: 18 });

    const ok: Record<string, unknown> = { prefAgeMin: 25, prefAgeMax: 40 };
    floorAgePreferences(ok);
    expect(ok).toEqual({ prefAgeMin: 25, prefAgeMax: 40 });

    // Unparseable is removed, not floored — it was never a preference.
    const junk: Record<string, unknown> = { prefAgeMin: 'nineteen' };
    floorAgePreferences(junk);
    expect('prefAgeMin' in junk).toBe(false);
  });

  it('closes the dating profile when the citizen declares they are a minor', () => {
    // DEFECT 4b. Blocking the propagation left the live row saying `approved`
    // with its stale adult date, after we had direct evidence otherwise.
    const mp = code(read('profile/master-profile.service.ts'));
    expect(mp).toMatch(/private async closeDatingForMinor\(userId: string\)/);
    expect(mp).toMatch(/moderation: 'rejected'/);
    expect(mp).toMatch(/visible: false/);
    // And it is reached from the propagation branch, not merely declared.
    expect(mp).toMatch(/: this\.closeDatingForMinor\(userId\)\)/);
  });

  /**
   * ── AND 18+ IS THE RULE FOR THE WHOLE CITY (owner, 27 Aug) ────────────────
   *
   * Registration asked for no date of birth at all, and the Terms checkbox was
   * enforced only in the browser — so the server held no evidence that anybody
   * had ever claimed to be an adult. Now the front door asks, refuses, and
   * RECORDS it, and the master profile refuses too, because otherwise the city
   * rule was one PATCH away from being undone.
   */
  it('asks at the front door, refuses, and writes the claim down', () => {
    const dto = code(read('auth/dto/auth.dto.ts'));
    expect(dto).toMatch(/dateOfBirth: z\.string\(\)\.regex/);
    expect(dto).toMatch(/isAdult\(v\.dateOfBirth\)/);
    // Recorded, not merely validated — the first thing anyone asks for after.
    expect(code(read('auth/auth.service.ts'))).toMatch(/dateOfBirth: new Date\(`\$\{dto\.dateOfBirth\}/);
    // The master profile cannot be used to become 13 the next minute.
    expect(code(read('profile/profile.controller.ts'))).toMatch(/refine\(\(d\) => isAdult\(d\)/);
  });

  it('asks one module how old somebody is, everywhere', () => {
    // Two formulas that disagree by a day at this boundary is a minor in an
    // adult pool. Both files now import age.ts, and the divisor is gone from
    // every AGE decision.
    const svc = code(read('dating/dating.service.ts'));
    const mp = code(read('profile/master-profile.service.ts'));
    expect(svc).toMatch(/from '\.\.\/shared\/age'/);
    expect(mp).toMatch(/from '\.\.\/shared\/age'/);
    expect(mp).not.toContain('365.25');
    // ONE survivor in the service, and it is not an age: AGE_YEAR_MS turns a
    // stated preference range into a SQL birthDate range, re-checked in JS
    // afterwards. Pinned at exactly one so a second cannot creep back.
    expect((svc.match(/365\.25/g) ?? []).length).toBe(1);
    expect(svc).toMatch(/AGE_YEAR_MS = 365\.25/);
  });
});

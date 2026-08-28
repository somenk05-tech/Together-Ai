import { RegisterSchema } from './dto/auth.dto';
import { GENDER_IDENTITY } from '../profile/sex-and-gender';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── GENDER IS ASKED ONCE, AT THE FRONT DOOR (owner, 27 Aug) ─────────────────
 *
 * Four hubs asked this question separately — dating, beauty, nutrition,
 * fitness — and `sex-and-gender.ts` exists because they disagreed about what
 * they were asking. Registration now asks once, writes the answer to the
 * Master Profile, and `prefillFromMaster` hands it to the dating form instead
 * of asking again.
 *
 * Three things this file exists to stop coming back, each of which is a real
 * mistake somebody would make while editing near it:
 *
 *   1. A FIFTH OPTION APPEARING HERE AND NOWHERE ELSE. The dating engine's six
 *      `seeking === gender` comparisons are exact, and one unmapped value
 *      removes a citizen from everybody's results and everybody from theirs.
 *      That is not hypothetical: propagationPlan carries a comment about the
 *      one capital letter that already did it.
 *   2. THE CLINICAL QUESTION BEING COLLAPSED BACK IN. `sexAtBirth` feeds
 *      Mifflin-St Jeor; `genderIdentity` is how the app addresses somebody.
 *      Asking one question and using it for both is the exact bug
 *      sex-and-gender.ts was written to undo, and a sign-up form is the most
 *      tempting place to redo it.
 *   3. "ASKED ONCE" TURNING INTO "LOCKED". The owner chose asked-once and
 *      editable. A citizen who transitions must not be held to the answer they
 *      gave at sign-up.
 */
describe('gender is asked once, at the door', () => {
  const base = {
    handle: 'someone', name: 'Someone', password: 'Str0ng!Passw0rd!',
    email: 'someone@example.com', dateOfBirth: '1995-06-15',
    // Optional since 28 Aug; this file is about gender, so it declines here.
    orientation: 'preferNotToSay' as const,
  };

  it('refuses a registration with no gender at all', () => {
    expect(RegisterSchema.safeParse(base).success).toBe(false);
  });

  it('accepts every value the city already uses, and only those', () => {
    for (const g of GENDER_IDENTITY) {
      expect(RegisterSchema.safeParse({ ...base, gender: g }).success).toBe(true);
    }
    // The dating vocabulary is lowercase 'nonbinary'; this one is 'nonBinary'.
    // datingGender() is the only crossing point, and the form must send the
    // identity spelling — not the dating one.
    for (const bad of ['nonbinary', 'Male', 'preferNotToSay', 'intersex', '']) {
      expect(RegisterSchema.safeParse({ ...base, gender: bad }).success).toBe(false);
    }
  });

  it('does not invent its own list — it is GENDER_IDENTITY, unchanged', () => {
    const dto = code(read('auth/dto/auth.dto.ts'));
    expect(dto).toMatch(/gender: z\.enum\(GENDER_IDENTITY\)/);
    expect(dto).toMatch(/from '\.\.\/\.\.\/profile\/sex-and-gender'/);
  });

  it('takes optional free text, capped, and only alongside "other"', () => {
    expect(RegisterSchema.safeParse({ ...base, gender: 'other' }).success).toBe(true);
    expect(RegisterSchema.safeParse({ ...base, gender: 'other', genderOther: 'Agender' }).success).toBe(true);
    expect(RegisterSchema.safeParse({ ...base, gender: 'other', genderOther: 'x'.repeat(41) }).success).toBe(false);
    const svc = code(read('auth/auth.service.ts'));
    expect(svc).toMatch(/genderIdentityOther: dto\.gender === 'other' \?/);
  });

  it('writes the SOCIAL field, on the same row as the date of birth', () => {
    const svc = code(read('auth/auth.service.ts'));
    expect(svc).toMatch(/genderIdentity: dto\.gender/);
    expect(svc).toMatch(/dateOfBirth: new Date\(`\$\{dto\.dateOfBirth\}/);
    // One write, not two — a second call would be a second chance to fail half
    // way and leave an account with an age and no gender.
    expect((svc.match(/mp\?\.\w+\?\.\(/g) ?? []).length).toBe(1);
  });

  it('CREATES the row rather than updating one that is not there', () => {
    // THE BUG THIS ASSERTION EXISTS FOR, and it is not hypothetical: the 18+
    // commit wrote the date of birth with `masterProfile.updateMany`, and
    // `initializeAccount` seeds FoodPref, BeautyProfile and FitnessProfile —
    // never MasterProfile. Nothing creates that row at registration, so the
    // update matched zero rows, wrote nothing, and swallow() kept it quiet.
    // The one record proving somebody claimed to be an adult was never made.
    const svc = code(read('auth/auth.service.ts'));
    expect(svc).toMatch(/mp\?\.upsert\?\.\(/);
    expect(svc).not.toMatch(/masterProfile[\s\S]{0,400}updateMany/);
    expect(svc).toMatch(/create: \{ userId: user\.id, \.\.\.master \}/);
    // And still not created by initializeAccount, which is what makes the
    // upsert load-bearing rather than belt-and-braces.
    expect(svc).not.toMatch(/masterProfile\?\.create/);
  });

  it('never asks the clinical question at the door', () => {
    // sexAtBirth belongs to the hub that needs a coefficient. If this assertion
    // fails, somebody has collapsed the two questions back into one field.
    expect(code(read('auth/dto/auth.dto.ts'))).not.toMatch(/sexAtBirth/);
    expect(code(read('auth/auth.service.ts'))).not.toMatch(/sexAtBirth/);
  });

  it('asked once is not locked — the profile still accepts a change', () => {
    // The owner's decision, 27 Aug. If a write-once guard is ever added, it
    // belongs in a commit that says so, not as a side effect of editing here.
    const ctl = code(read('profile/profile.controller.ts'));
    expect(ctl).toMatch(/genderIdentity: z\.enum\(\['male', 'female', 'nonBinary', 'other'\]\)/);
    expect(ctl).not.toMatch(/genderIdentity.*immutable|cannot be changed/i);
  });

  it('still refuses anybody under eighteen, gender or no gender', () => {
    const child = new Date(); child.setUTCFullYear(child.getUTCFullYear() - 14);
    expect(RegisterSchema.safeParse({
      ...base, gender: 'female', dateOfBirth: child.toISOString().slice(0, 10),
    }).success).toBe(false);
  });
});

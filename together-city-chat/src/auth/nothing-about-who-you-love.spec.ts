import { RegisterSchema } from './dto/auth.dto';
import { ORIENTATION, displayOrientation, isOrientation } from '../profile/sex-and-gender';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── NOTHING ABOUT WHO YOU LOVE LEAVES YOUR OWN PROFILE ──────────────────────
 *
 * Sexual orientation is asked at registration by the owner's decision, taken on
 * 27 Aug with the objection in front of them. It is SPECIAL-CATEGORY DATA under
 * GDPR Article 9 and its equivalents, and the city now holds it about every
 * citizen — including everyone who only ever opens Jobs, Nutrition or Cars.
 *
 * The collection is settled. What this file enforces is everything that
 * follows from it, and each rule below exists because the same codebase has
 * already made the matching mistake somewhere else:
 *
 *  1. IT NEVER APPEARS IN A CROSS-CITIZEN RESPONSE. The launch audit found
 *     `handle` and the city-wide `profileImage` riding into every dating card
 *     because a candidate query spread `user` unfiltered. That is exactly how
 *     this would escape, and it would matter far more.
 *  2. IT DRIVES NOTHING. The engine matches on `gender` and `seeking`, stated
 *     separately in the hub and meaning something precise. Inferring `seeking`
 *     from a label would be guessing: bisexual is not "show me everyone", and
 *     asexual is not "show me nobody".
 *  3. DECLINING IS AN ANSWER. Required means a citizen must answer. It does not
 *     mean they must disclose — the argument sex-and-gender.ts already made for
 *     `SEX_AT_BIRTH`, and it holds harder here.
 */
describe('nothing about who you love leaves your own profile', () => {
  const base = {
    handle: 'someone', name: 'Someone', password: 'Str0ng!Passw0rd!',
    email: 'someone@example.com', dateOfBirth: '1995-06-15', gender: 'female' as const,
  };

  it('is required, and refuses a registration without it', () => {
    expect(RegisterSchema.safeParse(base).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...base, orientation: 'gay' }).success).toBe(true);
  });

  it('accepts every value in the list and nothing else', () => {
    for (const o of ORIENTATION) {
      expect(RegisterSchema.safeParse({ ...base, orientation: o }).success).toBe(true);
    }
    for (const bad of ['Straight', 'hetero', 'none', '', 'male']) {
      expect(RegisterSchema.safeParse({ ...base, orientation: bad }).success).toBe(false);
    }
  });

  it('lets somebody decline without lying', () => {
    // The field is required; declining is one of the answers. Removing this
    // value would turn a required question into a forced disclosure.
    expect(ORIENTATION).toContain('preferNotToSay');
    expect(RegisterSchema.safeParse({ ...base, orientation: 'preferNotToSay' }).success).toBe(true);
    // And a decline renders as nothing rather than as the word "declined".
    expect(displayOrientation({ orientation: 'preferNotToSay' })).toBeNull();
    expect(displayOrientation({ orientation: 'gay' })).toBe('Gay');
    expect(displayOrientation({ orientation: 'other', orientationOther: 'Demisexual' })).toBe('Demisexual');
    expect(displayOrientation(null)).toBeNull();
    expect(isOrientation('queer')).toBe(true);
    expect(isOrientation('Queer')).toBe(false);
  });

  it('takes free text only with "other", and caps it', () => {
    expect(RegisterSchema.safeParse({ ...base, orientation: 'other', orientationOther: 'Demisexual' }).success).toBe(true);
    expect(RegisterSchema.safeParse({ ...base, orientation: 'other', orientationOther: 'x'.repeat(41) }).success).toBe(false);
    expect(code(read('auth/auth.service.ts'))).toMatch(/orientationOther: dto\.orientation === 'other' \?/);
  });

  it('THE ONE THAT MATTERS — no module outside profile and auth mentions it', () => {
    // A sweep, not a list, because a list is a thing somebody adds to. Only the
    // four places that legitimately handle it may name the column at all: the
    // vocabulary, the registration DTO, the write, and the citizen's own
    // profile. Dating, messages, connections, social, admin and every other
    // module must not know the field exists.
    const ALLOWED = new Set([
      'profile/sex-and-gender.ts',
      'profile/master-profile.service.ts',
      'profile/profile.controller.ts',
      'auth/dto/auth.dto.ts',
      'auth/auth.service.ts',
    ]);
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(join(SRC, dir))) {
        const rel = `${dir}/${name}`.replace(/^\//, '');
        if (statSync(join(SRC, rel)).isDirectory()) walk(rel, out);
        else if (/\.ts$/.test(name) && !/\.spec\.ts$/.test(name)) out.push(rel);
      }
      return out;
    };
    const offenders = walk('')
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /\borientationOther\b/.test(code(read(f))) || /\.orientation\b|orientation:/.test(code(read(f))));
    // tarot-content.ts has a local `orientation` for which way a card faces.
    // The regexes above are for the COLUMN; if this ever catches it, the file
    // named in the failure is the answer, not a reason to widen the allowlist.
    expect(offenders).toEqual([]);
  });

  it('drives no matching — the engine never reads it', () => {
    const dating = code(read('dating/dating.service.ts'));
    expect(dating).not.toMatch(/orientation/);
    // What the engine DOES read, stated separately in the hub, unchanged.
    expect(code(read('dating/dto/dating.dto.ts'))).toMatch(/seeking: z\.enum\(\['male', 'female', 'nonbinary', 'any'\]\)/);
  });

  it('stays editable by the person it is about', () => {
    expect(code(read('profile/profile.controller.ts'))).toMatch(/orientation: z\.enum\(/);
  });

  it('is nullable in the database, so nobody who predates it is locked out', () => {
    const sql = readFileSync(join(SRC, '..', 'prisma/migrations/20260827160000_orientation_at_registration/migration.sql'), 'utf8');
    expect(sql).toMatch(/ADD COLUMN "orientation" TEXT;/);
    expect(sql).not.toMatch(/NOT NULL/);
    // And nothing queries by it, so nothing indexes it.
    expect(sql).not.toMatch(/CREATE INDEX/i);
  });
});

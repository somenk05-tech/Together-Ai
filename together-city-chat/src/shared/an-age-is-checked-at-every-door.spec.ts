import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { MIN_DATING_AGE, UNDER_AGE_CITY_MESSAGE, ageOn, isAdult, refuseDateOfBirth } from './age';
import { AstrologyService } from '../astrology/astrology.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { RegisterSchema } from '../auth/dto/auth.dto';
import { UpsertDatingProfileSchema } from '../dating/dto/dating.dto';

/**
 * AN AGE IS CHECKED AT EVERY DOOR, NOT AT THE FRONT ONE.
 *
 * Owner, 29 Aug: "don't accept any date of birth and age below 18."
 *
 * It was checked at registration, on `PATCH /profile/master`, and when a dating
 * profile is created or moderated. It was NOT checked in Astrology — which
 * takes a birth date, writes it to its own row, and then syncs it to the master
 * profile, from where it fans out to every hub that reads a birthday. So the
 * city's minimum age was a property of which screen a person happened to use.
 *
 * Nor was it checked in `syncShared`, the one function all eleven hubs write
 * shared fields through, which is the floor everything else stands on.
 *
 * This file holds three things: the rule itself at its boundaries, every door
 * that takes a date refusing an under-18 one, and a ratchet so a twelfth door
 * cannot be opened without one.
 */

/**
 * Source with its comments blanked, offsets preserved.
 *
 * Written after the first version of this file passed while the guard it was
 * checking had been deleted: the DOCBLOCK above the guard names
 * `refuseDateOfBirth`, so a search of the raw text found the prose describing
 * the check and reported the check. The repo's own sentence, for the fourth
 * time: a guard is only proven where the data has reached.
 */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/** A date of birth exactly `years` old today, and one day short of it. */
const yearsAgo = (years: number, minusDays = 0): string => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + minusDays);
  return d.toISOString().slice(0, 10);
};

describe('the rule, at its edges', () => {
  it('accepts the day somebody turns 18 and refuses the day before', () => {
    // The boundary is the whole point: an off-by-one here is a person who is
    // refused on their birthday, or a seventeen-year-old let in on their last
    // day of being one.
    expect(refuseDateOfBirth(yearsAgo(MIN_DATING_AGE))).toBeNull();
    expect(refuseDateOfBirth(yearsAgo(MIN_DATING_AGE, 1))).toBe(UNDER_AGE_CITY_MESSAGE);
  });

  it('refuses a date it cannot read rather than guessing at it', () => {
    for (const bad of ['not-a-date', '2026-13-45', '0001-01-01', yearsAgo(-1)]) {
      expect(refuseDateOfBirth(bad)).not.toBeNull();
    }
    // `0001-01-01` parses, and reads as an age of two thousand. "Very old" is
    // not a safe reading of a date nobody could have been born on.
    expect(ageOn('0001-01-01')).toBeNull();
    // A date in the future is not an age at all, and must never read as a big one.
    expect(ageOn(yearsAgo(-5))).toBeNull();
  });

  it('says nothing about an absent date, because absence is not a claim', () => {
    // Clearing a birthday is allowed. The doors that REQUIRE one say so in
    // their own schema; this function must not turn "no answer" into a refusal
    // and break every hub that syncs a city or a height.
    for (const empty of [null, undefined, '']) expect(refuseDateOfBirth(empty)).toBeNull();
    // …while `isAdult`, which answers a different question, still fails closed.
    for (const empty of [null, undefined, '']) expect(isAdult(empty)).toBe(false);
  });
});

describe('every door that takes a date refuses an under-18 one', () => {
  const child = yearsAgo(MIN_DATING_AGE, 1);
  const adult = yearsAgo(30);

  it('registration', () => {
    const base = {
      name: 'A Citizen', handle: 'acitizen', email: 'a@example.com', password: 'a-long-enough-password',
    } as Record<string, unknown>;
    expect(RegisterSchema.safeParse({ ...base, dateOfBirth: child }).success).toBe(false);
    // …and the same body with an adult's date is refused for other reasons or
    // not at all — what matters is that the DATE is not the one refusing it.
    const ok = RegisterSchema.safeParse({ ...base, dateOfBirth: adult });
    const dateErrors = ok.success ? [] : ok.error.issues.filter((i) => i.path.includes('dateOfBirth'));
    expect(dateErrors).toEqual([]);
  });

  it('the dating profile', () => {
    const parsed = UpsertDatingProfileSchema.safeParse({ birthDate: child, gender: 'female', seeking: 'male', bio: 'x'.repeat(20) });
    expect(parsed.success).toBe(false);
  });

  it('the master-profile PATCH, in its own schema', () => {
    const src = readFileSync(join(__dirname, '..', 'profile', 'profile.controller.ts'), 'utf8');
    const field = code(src).slice(code(src).indexOf('dateOfBirth: z.string()'));
    expect(field.slice(0, 200)).toContain('isAdult');
  });

  it('astrology, which is where this was missing — and it is CALLED, not described', async () => {
    /* Behavioural, because the source-read version of this test passed with the
       guard deleted. A birth chart is a way to write a date of birth: it is
       saved here and synced to the master profile, from where it reaches every
       hub that reads a birthday. */
    const written: unknown[] = [];
    const synced: unknown[] = [];
    const svc = Object.create(AstrologyService.prototype) as AstrologyService;
    // `db` is a private getter over the Prisma client, so the fake goes in at
    // `prisma` — the same shape the service reads through.
    Object.assign(svc, {
      prisma: { astroProfile: { upsert: async (a: unknown) => { written.push(a); return {}; } } },
      masterProfile: { syncShared: async (...a: unknown[]) => { synced.push(a); return { synced: true }; } } as unknown as MasterProfileService,
    });
    const dto = { birthDate: child, birthTime: null, birthCountry: 'India', birthState: null, birthCity: 'Kolkata', timeZone: 'Asia/Kolkata' };
    await expect(svc.saveProfile('u1', dto as never)).rejects.toThrow(UNDER_AGE_CITY_MESSAGE);
    // NOTHING was written. The master sync below the guard is wrapped in
    // `swallow`, so a refusal further down would have left a saved chart for a
    // birthday the city does not accept.
    expect(written).toEqual([]);
    expect(synced).toEqual([]);
    // And the schema names the field, so the error lands under the input.
    expect(code(readFileSync(join(__dirname, '..', 'astrology', 'astrology.controller.ts'), 'utf8'))).toContain('refuseDateOfBirth');
  });

  it('and the floor under all of them — syncShared', async () => {
    const upserts: unknown[] = [];
    const svc = Object.create(MasterProfileService.prototype) as MasterProfileService;
    // `master` is a private getter over the Prisma client; the fake goes in at
    // `prisma`, which is what the getter reads.
    Object.assign(svc, {
      logger: { warn: () => undefined, log: () => undefined },
      /* Everything except `masterProfile` answers with a no-op. `syncShared`
         fans a change out to every hub table that holds a shared field, and
         stubbing eleven of them by name would make this test about the fan-out
         instead of about the guard. */
      prisma: new Proxy(
        {
          masterProfile: {
            findUnique: async () => null,
            upsert: async (a: unknown) => { upserts.push(a); return {}; },
          },
        } as Record<string, unknown>,
        {
          get: (target, key: string) => target[key]
            ?? new Proxy({}, { get: () => async () => ({}) }),
        },
      ),
    });
    // It THROWS. A dropped field tells somebody who mistyped their year that
    // their profile saved, and leaves the old date standing.
    await expect(svc.syncShared('u1', { dateOfBirth: new Date(`${child}T00:00:00Z`) }, 'a-hub'))
      .rejects.toThrow(UNDER_AGE_CITY_MESSAGE);
    expect(upserts).toEqual([]);
    // An adult date is not refused here — this guard must not be a wall.
    await svc.syncShared('u1', { dateOfBirth: new Date(`${adult}T00:00:00Z`) }, 'a-hub');
    expect(upserts.length).toBeGreaterThan(0);
  });
});

describe('the ratchet', () => {
  /*
   * A twelfth door. Any schema or service that takes a date of birth from a
   * person has to decide about the minimum age — the failure this file records
   * is not that somebody wrote a bad check, it is that a whole hub was written
   * without one and nothing noticed for a month.
   */
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts')) out.push(p);
    }
    return out;
  };

  it('no controller or dto accepts a date of birth without an age rule', () => {
    const offenders: string[] = [];
    for (const f of walk(join(__dirname, '..'))) {
      if (!/\.(controller|dto)\.ts$/.test(f)) continue;
      const src = readFileSync(f, 'utf8');
      // A field named for a birth date, declared as an input.
      if (!/(dateOfBirth|birthDate)\s*:\s*z\./.test(src)) continue;
      if (/isAdult|refuseDateOfBirth|MIN_DATING_AGE/.test(src)) continue;
      offenders.push(f.split('/src/').pop() ?? f);
    }
    expect(offenders).toEqual([]);
  });

  it('the age rule lives in one file, and nobody has written a second one', () => {
    /* Two age formulas that disagreed is what `shared/age.ts` was created to
       end — the divisor form is wrong by a whole year at the one boundary that
       matters, so on the day somebody turned 18 the gate could still read 17.

       A 365.25-day year is not always an age, though: the astrology engine
       needs Julian centuries, and the dating query turns a stated PREFERENCE
       range into a birth-date range for SQL to narrow on before the calendar
       rule re-checks every survivor. Those say `not-an-age:` beside themselves,
       which is a claim a reviewer can check rather than a file this spec has
       been taught to skip. */
    const offenders: string[] = [];
    for (const f of walk(join(__dirname, '..'))) {
      if (f.endsWith('/shared/age.ts')) continue;
      const src = readFileSync(f, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!/365\.25|365 \* 24|getFullYear\(\) - .*[Bb]irth/.test(line)) return;
        // The line itself counts: a marker often introduces the very sentence
        // that names the number it is exempting.
        const window = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
        if (window.includes('not-an-age:')) return;
        offenders.push(`${f.split('/src/').pop() ?? f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

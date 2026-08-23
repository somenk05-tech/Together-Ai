import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NutritionService } from './nutrition.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ── THE OWNER WHO WAS NEVER AN OWNER ────────────────────────────────────────
 *
 * `familyContext` asked "am I the head of a household with an accepted member?"
 * like this:
 *
 *   findFirst({ where: { ownerId, memberUserId: { not: null }, status } })
 *
 * HouseholdMember.memberUserId is `String` — required. Prisma's filter for a
 * required String has no null in it, so it refused the ENTIRE query with
 * "Argument `not` must not be null". `swallowed()` caught that, returned null,
 * and the function read the null as "no household" and fell through to the
 * member and solo branches.
 *
 * SO EVERY HOUSEHOLD OWNER WAS CLASSIFIED AS SOMETHING ELSE, family meal
 * planning was off for all of them, and the only trace was a WARN line. The
 * production log carried it 13 times in 14 hours.
 *
 * THE TRAP WORTH REMEMBERING: `memberUserId` IS nullable — on FamilyMember.
 * This call goes through `this.household`, which is HouseholdMember. Two models
 * in one service, one field name, different nullability.
 *
 * The stub below refuses a null `not` exactly as Prisma does, so this file
 * fails against the old line rather than merely describing it.
 */

interface Row { ownerId: string; memberUserId: string; status: string }

function build(rows: Row[]) {
  const s: any = Object.create(NutritionService.prototype);
  const wheres: any[] = [];

  const matches = (row: Row, where: any) =>
    Object.entries(where).every(([k, v]) => {
      /* PRISMA'S OWN RULE, NOT A CONVENIENCE. A required String column has no
         null in its filter, and passing one rejects the whole call rather than
         matching nothing — which is why the bug was invisible as a wrong
         ANSWER and visible only as a swallowed error. */
      if (v && typeof v === 'object' && 'not' in (v as any)) {
        if ((v as any).not === null) {
          throw new Error('Invalid `prisma.householdMember.findFirst()` invocation: Argument `not` must not be null.');
        }
        return (row as any)[k] !== (v as any).not;
      }
      return (row as any)[k] === v;
    });

  /* STUBBED THROUGH `prisma.householdMember` RATHER THAN `s.household`, because
     `household` is a getter on the prototype — and going through it is the
     better test anyway: the accessor that picks the model is the very thing
     that made the two `memberUserId` columns easy to confuse. */
  s.prisma = {
    householdMember: {
      findFirst: async ({ where }: any) => {
        wheres.push(where);
        return rows.find((r) => matches(r, where)) ?? null;
      },
    },
    foodPref: { findUnique: async () => null },
  };
  s.connections = { canAccessHub: async () => true };
  s.getFamilyMealPlanning = async () => true;
  s.householdDietNotice = async () => ({ householdDiet: 'vegetarian', dietBecause: [] });
  return { s, wheres };
}

describe('a household owner is read as an owner', () => {
  const owner = { ownerId: 'u1', memberUserId: 'u2', status: 'accepted' };

  it('classifies the head of a household with an accepted member', async () => {
    const { s } = build([owner]);
    const ctx = await s.familyContext('u1');
    expect(ctx.role).toBe('owner');
    expect(ctx.ownerId).toBe('u1');
    expect(ctx.hasFamily).toBe(true);
  });

  /**
   * THE REGRESSION ITSELF. With the old filter the stub throws exactly what
   * Prisma threw, `swallowed` returns null, and the owner is reported solo —
   * so this assertion is the one that goes red if the clause ever comes back.
   */
  it('asks for the household without filtering a required column against null', async () => {
    const { s, wheres } = build([owner]);
    await s.familyContext('u1');
    expect(wheres[0]).toEqual({ ownerId: 'u1', status: 'accepted' });
    expect(wheres[0]).not.toHaveProperty('memberUserId');
  });

  it('still reads a member of somebody else’s household as a member', async () => {
    const { s } = build([{ ownerId: 'u9', memberUserId: 'u1', status: 'accepted' }]);
    const ctx = await s.familyContext('u1');
    expect(ctx.role).toBe('member');
    expect(ctx.ownerId).toBe('u9');
  });

  it('still reads somebody with no household as solo', async () => {
    const { s } = build([]);
    const ctx = await s.familyContext('u1');
    expect(ctx.role).toBe('solo');
    expect(ctx.hasFamily).toBe(false);
  });

  /**
   * A PENDING INVITE IS NOT A HOUSEHOLD. Dropping the null filter must not have
   * widened the query into "any row at all" — status is what makes it real.
   */
  it('does not count a pending invite as a family', async () => {
    const { s } = build([{ ownerId: 'u1', memberUserId: 'u2', status: 'pending' }]);
    expect((await s.familyContext('u1')).role).toBe('solo');
  });
});

/**
 * AND THE SCHEMA IS THE THING THAT MAKES THIS TRUE. If HouseholdMember ever
 * gains a nullable memberUserId the reasoning above changes, so the reasoning
 * is asserted against the schema rather than left in a comment.
 */
describe('the column this was filtering on', () => {
  it('is required on HouseholdMember and nullable on FamilyMember', () => {
    const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
    const model = (name: string) => {
      const at = schema.indexOf(`model ${name} {`);
      return schema.slice(at, schema.indexOf('\n}', at));
    };
    expect(model('HouseholdMember')).toMatch(/memberUserId\s+String(?!\?)/);
    expect(model('FamilyMember')).toMatch(/memberUserId\s+String\?/);
  });

  it('is no longer filtered against null anywhere in this service', () => {
    const src = readFileSync(join(__dirname, 'nutrition.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    expect(src).not.toMatch(/memberUserId:\s*\{\s*not:\s*null\s*\}/);
  });
});

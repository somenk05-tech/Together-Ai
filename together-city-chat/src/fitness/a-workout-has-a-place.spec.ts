import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditWorkoutSchema, LogWorkoutSchema, WORKOUT_STYLES } from './dto/fitness.dto';

const service = readFileSync(join(__dirname, 'fitness.service.ts'), 'utf8');
const controller = readFileSync(join(__dirname, 'fitness.controller.ts'), 'utf8');
/** Comments stripped, because the rules below are about what the code DOES and
 *  the words "findUnique" and "delete" both appear in the prose explaining why
 *  it does not do them. A grep that matches its own comment is a guard that
 *  fails for the wrong reason, and this file was written the night that
 *  lesson cost an hour. */
const code = service.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A WORKOUT HAS A PLACE, AND AN ENTRY HAS AN OWNER ────────────────────────
 *
 * The owner, 17 Aug: "make this log user based, let user add details of workout
 * style home gym sports and the duration". Asked which, he chose five — home,
 * gym, sports, studio, outdoor — and chose editing and deleting entries as what
 * "user based" meant.
 *
 * The style is the easy half. The half worth a spec is that the log grew its
 * first two DESTRUCTIVE routes, and a destructive route that takes an id from a
 * URL is exactly the shape of thing that ends up editing somebody else's row.
 */
describe('a workout has a place, and an entry has an owner', () => {
  describe('the owner is in the query, not in a branch', () => {
    it('scopes the edit and the delete with updateMany / deleteMany', () => {
      // The scope is part of the query the DATABASE runs. A findUnique followed
      // by an `if (row.userId !== userId)` is the same rule written somewhere a
      // later edit can forget it — and it opens a window between reading a row
      // and deciding about it.
      expect(code).toMatch(/updateMany\(\{\s*where: \{ id, userId \}/);
      expect(code).toMatch(/deleteMany\(\{ where: \{ id, userId \} \}\)/);
      expect(code).not.toMatch(/workoutLog\.findUnique/);
      expect(code).not.toMatch(/workoutLog\.update\(/);
      expect(code).not.toMatch(/workoutLog\.delete\(/);
    });

    it('answers a stranger and a fiction with the same 404', () => {
      // `count === 0` covers both "no such id" and "not yours", and they get the
      // same reply. A 403 for one and a 404 for the other is a membership
      // oracle: it tells anybody with a list of ids which ones exist.
      const both = [...code.matchAll(/if \(count === 0\) throw new NotFoundException\(/g)];
      expect({ places: both.length }).toEqual({ places: 2 });
      expect(code).not.toMatch(/ForbiddenException\('No workout/);
    });

    it('takes the id from the path and the citizen from the token', () => {
      expect(controller).toMatch(/@Patch\('log\/:id'\)/);
      expect(controller).toMatch(/@Delete\('log\/:id'\)/);
      expect(controller).toMatch(/editLog\(@CurrentUser\(\) user: JwtUser, @Param\('id'\) id: string/);
      expect(controller).toMatch(/removeLog\(@CurrentUser\(\) user: JwtUser, @Param\('id'\) id: string\)/);
      // …and neither is a voice intent. An assistant that can delete a training
      // history on a misheard word is not a feature anybody asked for.
      const patchBlock = controller.slice(controller.indexOf("@Patch('log/:id')") - 400, controller.indexOf("@Delete('log/:id')"));
      expect(patchBlock).not.toMatch(/@Mira\(/);
    });
  });

  describe('the five styles', () => {
    it('takes exactly the ones the owner chose', () => {
      expect(WORKOUT_STYLES).toEqual(['home', 'gym', 'sports', 'studio', 'outdoor']);
      for (const style of WORKOUT_STYLES) {
        expect(LogWorkoutSchema.safeParse({ focus: 'Five-a-side', minutes: 60, style }).success).toBe(true);
      }
      expect(LogWorkoutSchema.safeParse({ focus: 'x', minutes: 10, style: 'garden' }).success).toBe(false);
    });

    it('lets the question go unanswered', () => {
      // Every row written before 17 Aug was logged without anybody being asked
      // where. A required field here would put a place on all of them.
      const parsed = LogWorkoutSchema.safeParse({ focus: 'Tempo run', minutes: 40 });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.style).toBeUndefined();
    });

    it('writes null rather than a default when nobody was asked', () => {
      expect(code).toMatch(/style: dto\.style \?\? null/);
    });
  });

  describe('an edit changes what it names, and only that', () => {
    it('refuses an edit that names nothing', () => {
      expect(EditWorkoutSchema.safeParse({}).success).toBe(false);
    });

    it('accepts one field on its own', () => {
      expect(EditWorkoutSchema.safeParse({ minutes: 45 }).success).toBe(true);
      expect(EditWorkoutSchema.safeParse({ style: 'studio' }).success).toBe(true);
    });

    it('keeps the same limits as the original entry', () => {
      // A field that can be edited past the bound it was created under is a
      // bound that only applies to people who did not try twice.
      expect(EditWorkoutSchema.safeParse({ minutes: 601 }).success).toBe(false);
      expect(EditWorkoutSchema.safeParse({ minutes: 0 }).success).toBe(false);
      expect(EditWorkoutSchema.safeParse({ focus: 'x'.repeat(81) }).success).toBe(false);
      expect(EditWorkoutSchema.safeParse({ intensity: 'brutal' }).success).toBe(false);
    });

    it('never writes a field the caller did not send', () => {
      // Spreading the whole dto writes `undefined` over everything it does not
      // carry — which is how correcting a duration silently erases a note.
      expect(code).toMatch(/\.\.\.\(dto\.note !== undefined \? \{ note: dto\.note \} : \{\}\)/);
      expect(code).not.toMatch(/updateMany\(\{[\s\S]{0,200}data: \{ \.\.\.dto/);
    });
  });

  describe('the week is recounted by the server after every change', () => {
    it('returns the whole log from the add, the edit and the remove', () => {
      // The reason the owner asked for this: a 300-minute typo sat in the
      // week's total forever. If a mutation returned only the changed row, the
      // total and the row would disagree until a refetch nobody triggers.
      const returns = [...code.matchAll(/return this\.log\(userId\);/g)];
      expect({ mutationsThatRecount: returns.length }).toEqual({ mutationsThatRecount: 3 });
    });
  });
});

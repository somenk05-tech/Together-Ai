import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PURGE_RULES, PURGE_AFTER_DAYS, classifiedModels, deletions, purgeCutoff, storageBearing, whereFor,
} from './purge-plan';

/**
 * The guard on the guard.
 *
 * A purge that works from a hand-written list fails in one specific way: a hub
 * added later is never added here, and its table of medical or financial data
 * quietly outlives every deletion request that was supposed to remove it. The
 * job keeps reporting success the whole time, which is what makes it dangerous
 * rather than merely wrong.
 *
 * So this reads schema.prisma — the actual source of truth — and fails when a
 * model that carries a citizen's id has no entry in the plan. It cannot tell
 * whether a decision was RIGHT. It can guarantee one was made.
 */
const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

/**
 * ── THE LIST STOPPED BEING A LIST (30 Aug) ─────────────────────────────────
 *
 * This was `LINK_COLUMNS`, a hardcoded set of column names, and its own
 * comment had already recorded the failure twice:
 *
 *   "PAIR COLUMNS ARE LINKS TOO. userOneId/userTwoId and userA/userB tie a row
 *    to a citizen just as userId does; leaving them out let three dating tables
 *    pass this guard green while surviving every account deletion. Found
 *    26 Aug. `reporterId` joined them on 27 Aug. Report was the one model in
 *    the schema carrying a citizen's id under a name this list did not know, so
 *    it was never classified and the completeness check could not say so — a
 *    guard blind in exactly one direction reads the same as a guard that
 *    passed."
 *
 * It happened a third time. `Property.sellerId` and `AdminAudit.actorId` were
 * names nobody had added, so neither model was ever classified — a citizen's
 * property advertisements, with their photographs and floor plans, survived
 * their account entirely and this guard said everything was fine.
 *
 * Three times is the list telling us what it is. A guard built from names
 * somebody remembered can only ever find what somebody remembered, and it goes
 * green either way, which is the worst property a guard can have.
 *
 * SO THE COLUMNS COME FROM THE SCHEMA NOW. Prisma writes the link down itself:
 * every declared foreign key to a citizen appears as
 * `<field> User? @relation(… fields: [<column>], references: [id])`. Reading
 * those gives every citizen-linking column BY CONSTRUCTION — including the
 * next one, whatever it gets called.
 *
 * THE NAME LIST STAYS, AS THE OTHER HALF OF A UNION. Not every model declares
 * the relation: twenty-one carry a bare `userId String` with no relation field
 * beside it, and a relation-only scanner loses every one of them. So the two
 * are unioned, and the union is a strict superset of what this guard found
 * before — the names catch the models with no declared relation, the relations
 * catch the names nobody thought of. Neither half is complete; together they
 * are better than either, and adding to the name list is no longer the only
 * way to make this guard see something new.
 */
const LINK_COLUMNS = ['userId', 'ownerId', 'authorId', 'senderId', 'createdById', 'postedById',
  'reporterId', 'userOneId', 'userTwoId', 'userA', 'userB'];

/** Every column tying a row to a citizen: declared User relations, plus the
 *  conventional names, model by model. */
function citizenLinkedModels(): Array<{ model: string; columns: string[] }> {
  const out: Array<{ model: string; columns: string[] }> = [];
  for (const block of SCHEMA.split(/^model /m).slice(1)) {
    const model = block.split(/\s/)[0];
    const body = block.slice(0, block.indexOf('\n}'));
    const columns = new Set<string>(
      LINK_COLUMNS.filter((c) => new RegExp(`^\\s*${c}\\s+String`, 'm').test(body)),
    );
    for (const line of body.split('\n')) {
      // `author User @relation("name", fields: [authorId], references: [id])`
      // — the type sits before @relation, the column inside fields: [...].
      const rel = /^\s*\w+\s+User\??\s+@relation\([^)]*fields:\s*\[([^\]]+)\]/.exec(line);
      if (!rel) continue;
      for (const c of rel[1].split(',')) columns.add(c.trim());
    }
    if (columns.size) out.push({ model, columns: [...columns] });
  }
  return out;
}

describe('every model holding a citizen’s data has been classified', () => {
  it('finds a plausible number of models (guards the scanner itself)', () => {
    // Without this a broken regex would report zero linked models and the
    // assertion below would pass while checking nothing at all.
    const found = citizenLinkedModels();
    expect(found.length).toBeGreaterThanOrEqual(60);
    expect(found.some((m) => m.model === 'MedicalRecord')).toBe(true);
  });

  it('leaves no model unclassified', () => {
    // If this fails, a new model carries citizen data and nobody has said
    // whether deleting an account should destroy it. Add a rule to
    // purge-plan.ts — purge or keep, with a reason. Do not delete this test.
    const classified = classifiedModels();
    const missing = citizenLinkedModels()
      .map((m) => m.model)
      .filter((m) => !classified.has(m) && m !== 'User')
      .sort();
    expect(missing).toEqual([]);
  });

  it('classifies nothing that no longer exists', () => {
    // A rule for a deleted model is a delete that silently never runs.
    const real = new Set(citizenLinkedModels().map((m) => m.model));
    const stale = [...classifiedModels()].filter((m) => !real.has(m) && m !== 'ModerationLog').sort();
    expect(stale).toEqual([]);
  });

  it('links each rule by a column that model actually has', () => {
    const byModel = new Map(citizenLinkedModels().map((m) => [m.model, m.columns]));
    for (const rule of PURGE_RULES) {
      const columns = byModel.get(rule.model) ?? [];
      // memberUserId is a link this scanner does not collect (it points at a
      // citizen who is not the row's owner), so it is allowed explicitly.
      if (rule.by === 'memberUserId') continue;
      // listingId is a listing's id everywhere except ModerationLog, where
      // dating writes a userId into it. Allowed by name, for that one table.
      if (rule.by === 'listingId') { expect(rule.model).toBe('ModerationLog'); continue; }
      if (rule.by === 'either') {
        expect(rule.pair).toBeDefined();
        expect({ model: rule.model, has: columns }).toEqual({ model: rule.model, has: expect.arrayContaining(rule.pair!) });
        continue;
      }
      expect({ model: rule.model, by: rule.by, has: columns }).toEqual({
        model: rule.model, by: rule.by, has: expect.arrayContaining([rule.by]),
      });
    }
  });

  it('gives every rule a reason somebody could argue with', () => {
    for (const rule of PURGE_RULES) {
      expect(rule.reason.length).toBeGreaterThan(20);
    }
  });
});

describe('what the plan destroys', () => {
  it('destroys health data, which is the whole point', () => {
    const purged = new Set(deletions().map((r) => r.model));
    for (const model of ['MedicalRecord', 'MedicalBloodTest', 'BloodMarker', 'Prescription', 'DoseLog', 'FoodPref']) {
      expect(purged.has(model)).toBe(true);
    }
  });

  it('destroys the private journal', () => {
    expect(deletions().some((r) => r.model === 'Thought')).toBe(true);
  });

  it('keeps what other people can still see', () => {
    const kept = new Set(PURGE_RULES.filter((r) => r.action === 'keep').map((r) => r.model));
    for (const model of ['Message', 'ConversationMember', 'Comment', 'Like', 'Job']) {
      expect(kept.has(model)).toBe(true);
    }
    expect(deletions().some((r) => r.model === 'Message')).toBe(false);
  });

  it('splits meal plans by who eats from them', () => {
    const rules = PURGE_RULES.filter((r) => r.model === 'MealPlan');
    const individual = rules.find((r) => r.filter?.mode === 'individual');
    const family = rules.find((r) => r.filter?.mode === 'family');
    expect(individual?.action).toBe('purge');
    // A household did not delete anything and should not lose the week's meals.
    expect(family?.action).toBe('keep');
  });

  it('never purges a whole model without naming an owner', () => {
    // A rule whose WHERE clause omits the citizen would delete every row in the
    // table for every citizen. This is the assertion that stops that.
    for (const rule of deletions()) {
      const where = whereFor(rule, 'user-1') as Record<string, unknown> & { OR?: Record<string, string>[] };
      if (rule.by === 'either') {
        // A pair rule names the citizen on BOTH sides, and nothing else.
        expect(where.OR).toEqual([{ [rule.pair![0]]: 'user-1' }, { [rule.pair![1]]: 'user-1' }]);
      } else {
        expect(where[rule.by]).toBe('user-1');
      }
      expect(Object.keys(where).length).toBeGreaterThan(0);
    }
  });

  it('carries the stored file away with the row', () => {
    // A deleted row whose object survives in the bucket is the deletion failing
    // in the way nobody notices: the database looks clean.
    const withFiles = new Set(storageBearing().map((r) => r.model));
    for (const model of ['MedicalRecord', 'Prescription', 'LookAnalysis', 'Avatar', 'DriveFile']) {
      expect(withFiles.has(model)).toBe(true);
    }
  });
});

describe('the window', () => {
  it('is the thirty days that were decided, not a number someone typed twice', () => {
    expect(PURGE_AFTER_DAYS).toBe(30);
  });

  it('does not reach accounts deleted more recently than that', () => {
    const now = new Date('2026-07-29T00:00:00Z');
    const cutoff = purgeCutoff(now);
    const deletedYesterday = new Date('2026-07-28T00:00:00Z');
    const deletedLongAgo = new Date('2026-06-01T00:00:00Z');
    expect(deletedYesterday > cutoff).toBe(true);   // safe
    expect(deletedLongAgo < cutoff).toBe(true);     // due
  });
});

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

const LINK_COLUMNS = ['userId', 'ownerId', 'authorId', 'senderId', 'createdById', 'hostId', 'postedById'];

/** Models whose rows belong to, or were written by, one citizen. */
function citizenLinkedModels(): Array<{ model: string; columns: string[] }> {
  const out: Array<{ model: string; columns: string[] }> = [];
  for (const block of SCHEMA.split(/^model /m).slice(1)) {
    const model = block.split(/\s/)[0];
    const body = block.slice(0, block.indexOf('\n}'));
    const columns = LINK_COLUMNS.filter((c) => new RegExp(`^\\s*${c}\\s+String`, 'm').test(body));
    if (columns.length) out.push({ model, columns });
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
    const stale = [...classifiedModels()].filter((m) => !real.has(m)).sort();
    expect(stale).toEqual([]);
  });

  it('links each rule by a column that model actually has', () => {
    const byModel = new Map(citizenLinkedModels().map((m) => [m.model, m.columns]));
    for (const rule of PURGE_RULES) {
      const columns = byModel.get(rule.model) ?? [];
      // memberUserId is a link this scanner does not collect (it points at a
      // citizen who is not the row's owner), so it is allowed explicitly.
      if (rule.by === 'memberUserId') continue;
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
      const where = whereFor(rule, 'user-1');
      expect(where[rule.by]).toBe('user-1');
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  declaredHealthPatch,
  NONE_DECLARED,
  readDeclaredHealth,
  serialiseDeclaredHealth,
} from './master-health-conditions';
import { HEALTH_CONDITIONS, KIDNEY_STAGES, TRIMESTERS } from '../shared/health-conditions';

const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(__dirname, '..', '..', 'prisma', 'migrations',
    '20260802150000_master_health_conditions', 'migration.sql'), 'utf8',
);
const controller = readFileSync(join(__dirname, 'profile.controller.ts'), 'utf8');
const master = /model MasterProfile \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? '';
/** The migration explains at length what it is NOT doing, and an absence check
 *  that reads the explanation fails on its own documentation — trap 8, which
 *  three guards in this repo have now walked into. Read the statements only. */
const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('the health-condition columns', () => {
  describe('the column itself', () => {
    it('is three optional columns on the Master Profile', () => {
      expect(master).toMatch(/healthConditions\s+String\?/);
      expect(master).toMatch(/pregnancyTrimester\s+String\?/);
      expect(master).toMatch(/kidneyStage\s+String\?/);
    });

    it('adds them nullable and backfills nothing', () => {
      for (const col of ['healthConditions', 'pregnancyTrimester', 'kidneyStage']) {
        expect(sqlOnly).toContain(`ADD COLUMN "${col}" TEXT;`);
      }
      expect(sqlOnly).not.toMatch(/NOT NULL|DEFAULT/i);
      expect(sqlOnly).not.toMatch(/^\s*(UPDATE|INSERT)/im);
    });

    it('keeps the sentinel out of the vocabulary it sits in', () => {
      // 'none' shares a column with the condition keys. If it ever became one,
      // "asked and ticked nothing" and "has none-the-condition" would be the
      // same eleven bytes.
      expect(HEALTH_CONDITIONS).not.toContain(NONE_DECLARED);
    });
  });

  describe('writing an answer', () => {
    it('stores canonical keys in one order, deduplicated', () => {
      const a = serialiseDeclaredHealth({ keys: ['pregnancy', 'diabetes', 'diabetes'] });
      const b = serialiseDeclaredHealth({ keys: ['diabetes', 'pregnancy'] });
      expect(a.healthConditions).toBe(b.healthConditions);
      expect(a.healthConditions).toBe('diabetes,pregnancy');
    });

    it('accepts what the older vocabularies stored', () => {
      // The crossing point does the folding; this only checks it is used, so a
      // future migration of FoodPref.extras has one door to come through.
      expect(serialiseDeclaredHealth({ keys: ['Kidney Disease'] }).healthConditions).toBe('kidney');
      expect(serialiseDeclaredHealth({ keys: ['Fatty Liver'] }).healthConditions).toBe('fattyLiver');
    });

    it('refuses a key it does not know rather than dropping it', () => {
      // A dropped key is a silent loss of something a citizen said about their
      // own health. The read is allowed to drop; the write is not.
      expect(() => serialiseDeclaredHealth({ keys: ['lupus'] })).toThrow(/not a health condition/);
      expect(() => serialiseDeclaredHealth({ keys: ['glycemic'] })).toThrow();
      expect(() => serialiseDeclaredHealth({ keys: ['hormonal acne'] })).toThrow();
    });

    it('distinguishes never asked from asked and nothing ticked', () => {
      expect(serialiseDeclaredHealth({ keys: [] }).healthConditions).toBe(NONE_DECLARED);
      expect(readDeclaredHealth({ healthConditions: null }).asked).toBe(false);
      expect(readDeclaredHealth({ healthConditions: NONE_DECLARED })).toEqual({ asked: true, keys: [] });
    });

    it('never writes the empty string, which mergeShared would swallow', () => {
      expect(serialiseDeclaredHealth({ keys: [] }).healthConditions).not.toBe('');
    });
  });

  describe('the two qualifiers', () => {
    it('keeps the trimester only while the pregnancy is declared', () => {
      const on = serialiseDeclaredHealth({ keys: ['pregnancy'], trimester: 'third' });
      expect(on.pregnancyTrimester).toBe('third');
      // Unticking it clears the qualifier, so a later re-tick cannot resurrect
      // a trimester from months ago and feed somebody the wrong energy figure.
      const off = serialiseDeclaredHealth({ keys: ['diabetes'], trimester: 'third' });
      expect(off.pregnancyTrimester).toBeNull();
    });

    it('does not surface a stale qualifier a row still holds', () => {
      const read = readDeclaredHealth({ healthConditions: 'diabetes', pregnancyTrimester: 'third' });
      expect(read.trimester).toBeUndefined();
    });

    it('separates not answered from would rather not say', () => {
      const silent = serialiseDeclaredHealth({ keys: ['pregnancy'] });
      const declined = serialiseDeclaredHealth({ keys: ['pregnancy'], trimester: 'unstated' });
      expect(silent.pregnancyTrimester).toBeNull();
      expect(declined.pregnancyTrimester).toBe('unstated');
      expect(readDeclaredHealth({ healthConditions: 'pregnancy' }).trimester).toBeUndefined();
      expect(readDeclaredHealth({ healthConditions: 'pregnancy', pregnancyTrimester: 'unstated' }).trimester)
        .toBe('unstated');
    });

    it('does the same for the kidney stage', () => {
      expect(serialiseDeclaredHealth({ keys: ['kidney'], kidneyStage: 'dialysis' }).kidneyStage)
        .toBe('dialysis');
      expect(serialiseDeclaredHealth({ keys: ['gout'], kidneyStage: 'dialysis' }).kidneyStage).toBeNull();
      expect(() => serialiseDeclaredHealth({ keys: ['kidney'], kidneyStage: 'stage 9' })).toThrow();
    });
  });

  describe('reading a row nobody can fix', () => {
    it('opens a row holding a key the vocabulary no longer knows', () => {
      const read = readDeclaredHealth({ healthConditions: 'diabetes,unicornism' });
      expect(read).toEqual({ asked: true, keys: ['diabetes'] });
    });

    it('treats an empty column as never asked, whatever wrote it', () => {
      expect(readDeclaredHealth({ healthConditions: '' }).asked).toBe(false);
      expect(readDeclaredHealth(null).asked).toBe(false);
      expect(readDeclaredHealth(undefined).keys).toEqual([]);
    });
  });

  describe('the PATCH body', () => {
    it('changes nothing when the body does not mention the field', () => {
      expect(declaredHealthPatch({ city: 'Pune' })).toEqual({});
    });

    it('refuses a qualifier travelling on its own', () => {
      // A trimester with no conditions beside it is not an answer to anything.
      // The controller spreads this OVER the body, so the column has to be
      // explicitly undefined - returning {} would let the stray value through.
      const patch = declaredHealthPatch({ pregnancyTrimester: 'second' });
      expect(patch).toEqual({});
      expect('pregnancyTrimester' in patch).toBe(true);
      expect(patch.pregnancyTrimester).toBeUndefined();
    });

    it('takes the qualifiers with it when the answer is cleared', () => {
      expect(declaredHealthPatch({ healthConditions: null })).toEqual({
        healthConditions: null, pregnancyTrimester: null, kidneyStage: null,
      });
    });

    it('moves all three columns together', () => {
      expect(declaredHealthPatch({ healthConditions: ['pregnancy'], pregnancyTrimester: 'first' }))
        .toEqual({ healthConditions: 'pregnancy', pregnancyTrimester: 'first', kidneyStage: null });
    });
  });

  describe('one vocabulary, not a fourth copy of it', () => {
    const listIn = (re: RegExp) =>
      ((re.exec(controller)?.[1] ?? '').match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1)).sort();

    it('validates against exactly the keys the vocabulary holds', () => {
      expect(listIn(/healthConditions: z\.array\(z\.enum\(\[([\s\S]*?)\]\)\)/))
        .toEqual([...HEALTH_CONDITIONS].sort());
    });

    it('validates the qualifiers against theirs', () => {
      expect(listIn(/pregnancyTrimester: z\.enum\(\[([\s\S]*?)\]\)/)).toEqual([...TRIMESTERS].sort());
      expect(listIn(/kidneyStage: z\.enum\(\[([\s\S]*?)\]\)/)).toEqual([...KIDNEY_STAGES].sort());
    });
  });
});

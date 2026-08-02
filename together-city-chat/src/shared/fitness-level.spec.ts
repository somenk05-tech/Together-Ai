import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATING_ACTIVITY_SELF_DESCRIPTIONS,
  FITNESS_ABILITY_LEVELS,
  datingActivityFrom,
  fitnessAbilityFrom,
} from './fitness-level';
import { ACTIVITY_FACTORS } from './energy';
import { LEVELS } from '../fitness/fitness-engine';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const lookups = src('lookups', 'lookup.data.ts');
const master = src('profile', 'master-profile.service.ts');
const fitnessSvc = src('fitness', 'fitness.service.ts');
const datingSvc = src('dating', 'dating.service.ts');
const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

const ACTIVITY_KEYS = Object.keys(ACTIVITY_FACTORS);

describe('the three questions about how much somebody moves', () => {
  describe('each list is the one its owner actually uses', () => {
    it('mirrors the exercise lookup dating renders', () => {
      const offered = ((/exercise: \[([^\]]*)\]/.exec(lookups)?.[1] ?? '')
        .match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1));
      expect(offered).toEqual([...DATING_ACTIVITY_SELF_DESCRIPTIONS]);
    });

    it('mirrors the ability tiers the engine branches on', () => {
      expect(LEVELS.map((l) => l.key)).toEqual([...FITNESS_ABILITY_LEVELS]);
    });

    it('mirrors the activity scale energy.ts multiplies by', () => {
      expect(ACTIVITY_KEYS).toEqual(['sedentary', 'light', 'moderate', 'active', 'veryActive']);
    });
  });

  describe('the vocabularies, and the two words that collide', () => {
    it('shares nothing between the ability tier and either other list', () => {
      // This one IS disjoint, and the test exists so it stays that way: an
      // ability tier that ever spelled the same as a self-description would
      // make the refusals below indistinguishable from a resolution.
      const ability = new Set<string>(FITNESS_ABILITY_LEVELS);
      for (const d of DATING_ACTIVITY_SELF_DESCRIPTIONS) expect(ability.has(d.toLowerCase())).toBe(false);
      for (const a of ACTIVITY_KEYS) expect(ability.has(a.toLowerCase())).toBe(false);
    });

    it('records the collision rather than pretending it is not there', () => {
      // 'Sedentary' and 'Active' lower-case onto two of the five activity-scale
      // KEYS. A crossing built on `toLowerCase()` would resolve two values out
      // of five and drop the rest — matching sometimes is worse than never.
      const shared = DATING_ACTIVITY_SELF_DESCRIPTIONS
        .map((d) => d.toLowerCase()).filter((d) => ACTIVITY_KEYS.includes(d)).sort();
      expect(shared).toEqual(['active', 'sedentary']);
    });
  });

  describe('nothing converts', () => {
    it('reads its own vocabulary', () => {
      for (const l of FITNESS_ABILITY_LEVELS) expect(fitnessAbilityFrom(l)).toBe(l);
      for (const d of DATING_ACTIVITY_SELF_DESCRIPTIONS) expect(datingActivityFrom(d)).toBe(d);
      expect(fitnessAbilityFrom(' Advanced ')).toBe('advanced');
    });

    it('refuses the other two vocabularies', () => {
      for (const d of DATING_ACTIVITY_SELF_DESCRIPTIONS) expect(fitnessAbilityFrom(d)).toBeUndefined();
      for (const l of FITNESS_ABILITY_LEVELS) expect(datingActivityFrom(l)).toBeUndefined();
      expect(fitnessAbilityFrom('Very active')).toBeUndefined();
    });

    it('separates the colliding pair by the only thing that separates them', () => {
      // 'Sedentary' is the self-description; `sedentary` is the activity KEY
      // that multiplies a BMR. After toLowerCase() they are one string, so the
      // dating reader compares exactly — and an activity key handed to it comes
      // back undefined rather than resolving to a profile blurb.
      expect(datingActivityFrom('Sedentary')).toBe('Sedentary');
      expect(datingActivityFrom('Active')).toBe('Active');
      expect(datingActivityFrom('sedentary')).toBeUndefined();
      expect(datingActivityFrom('active')).toBeUndefined();
    });

    it('never guesses', () => {
      // 'Super-athletic' is the athlete tier's LABEL. This reader takes keys;
      // a label is not a key, and resolving one would be the guess.
      for (const junk of ['', '  ', 'fit', 'very-active', 'Super-athletic', 'gym rat']) {
        expect(fitnessAbilityFrom(junk)).toBeUndefined();
      }
      expect(datingActivityFrom(null)).toBeUndefined();
      expect(datingActivityFrom(undefined)).toBeUndefined();
    });
  });

  describe('and no code path crosses them either', () => {
    it('keeps the dating self-description out of the shared fields', () => {
      // The moment it becomes a SharedField, syncShared() can write it into a
      // hub that never asked — which is how a profile blurb would arrive at a
      // calorie target. relationshipStatus is on that list for the opposite
      // reason: nothing computes with it at all.
      expect(master).not.toContain('fitnessLevel');
    });

    it('keeps the two services from reading each other', () => {
      expect(fitnessSvc).not.toContain('fitnessLevel');
      expect(datingSvc).not.toMatch(/fitnessProfile|FitnessProfile/);
    });

    it('says in the schema what the ability tier decides', () => {
      // A one-word column comment is how a field ends up consolidated by
      // somebody who has never opened the engine that reads it.
      const model = /model FitnessProfile \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? '';
      expect(model).toMatch(/training days/i);
      expect(model).toMatch(/NOT a self-description/i);
    });
  });
});

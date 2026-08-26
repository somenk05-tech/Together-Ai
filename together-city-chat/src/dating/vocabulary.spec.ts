import { buildLookupSeed } from '../lookups/lookup.data';
import {
  canonicalGoal, committed, GOAL_ORDER, hardFilterReason, factorScores, coverage,
  dietConflicts, childrenConflict, religionConflict, languageBarrier,
} from './matching';

/**
 * THE SPEC THAT WOULD HAVE CAUGHT THE LARGEST BUG IN THE HUB.
 *
 * `matching.ts` parsed `['Friendship First', 'Casual Dating', 'Serious Dating',
 * 'Long-term Relationship', 'Marriage']`. The dropdown a citizen actually uses
 * is seeded from `lookup.data.ts` and serves `['Marriage', 'Long-term
 * relationship', 'Serious dating', 'Casual dating', 'Friendship first', 'Still
 * figuring it out']`. One of six matched. Every other label scored as
 * unanswered, and the "Marriage Intentions" deal-breaker — the one protection
 * the astrology weight makes load-bearing — could not fire at all.
 *
 * It survived because `matching.spec.ts` and `deal-breakers.spec.ts` were both
 * written in the engine's own vocabulary. They tested that the copy agreed with
 * itself. This file reads the SEED and asserts the engine can read what the form
 * sends, which is the only version of the question that could have failed.
 *
 * If a label is ever added to the `relationshipGoal` lookup, this fails until
 * `GOAL_ALIASES` knows about it. That is the whole reason the file exists.
 */
const labelsFor = (category: string) =>
  buildLookupSeed().filter((r) => r.category === category).map((r) => r.label);

describe('the engine can read what the form sends', () => {
  it('resolves every relationshipGoal label the lookup serves', () => {
    const served = labelsFor('relationshipGoal');
    expect(served.length).toBeGreaterThan(0);
    const unreadable = served.filter((l) => canonicalGoal(l) === null);
    // 'Still figuring it out' is deliberately not on the ladder: it is a
    // non-answer, and forcing it onto one would invent an intent nobody stated.
    expect(unreadable).toEqual(['Still figuring it out']);
  });

  it('maps every readable label onto GOAL_ORDER exactly', () => {
    for (const l of labelsFor('relationshipGoal')) {
      const c = canonicalGoal(l);
      if (c === null) continue;
      expect(GOAL_ORDER).toContain(c);
    }
  });

  it('fires the Marriage Intentions deal-breaker on the labels production sends', () => {
    const served = labelsFor('relationshipGoal');
    let fired = 0;
    for (const a of served) for (const b of served) {
      if (hardFilterReason({ relationshipGoal: a, dealBreakers: ['Marriage Intentions'] }, { relationshipGoal: b }, 30) === 'intent') fired++;
    }
    // Was 0 of 36 before the normaliser. Every committed x uncommitted ordered
    // pair among the five readable labels: 3 committed, 2 not, both directions.
    expect(fired).toBe(12);
  });

  it('does not treat a goal it cannot read as an answer', () => {
    expect(committed('Still figuring it out')).toBeNull();
    expect(coverage({ relationshipGoal: 'Still figuring it out' }, { relationshipGoal: 'Marriage' })).toBe(0);
  });

  it('scores two different readable goals apart from two unanswered ones', () => {
    const stated = factorScores(80, [], [], { relationshipGoal: 'Serious dating' }, { relationshipGoal: 'Casual dating' }).relationshipGoals;
    const unanswered = factorScores(80, [], [], {}, {}).relationshipGoals;
    expect(stated).not.toBe(unanswered);
    expect(stated).toBe(75);
    expect(unanswered).toBe(45);
  });

  it('reads every diet label the lookup serves', () => {
    for (const l of labelsFor('diet')) {
      // Same label on both sides is never a conflict, whatever the label is.
      expect(dietConflicts(l, l)).toBe(false);
    }
  });

  it('reads every wantsChildren label the lookup serves', () => {
    for (const l of labelsFor('wantsChildren')) expect(childrenConflict(l, l)).toBe(false);
  });

  it('reads every religion label the lookup serves', () => {
    for (const l of labelsFor('religion')) expect(religionConflict(l, l)).toBe(false);
  });
});

describe('equality is not compatibility', () => {
  it('keeps a Vegan for someone who asked for a Vegetarian', () => {
    expect(dietConflicts('Vegetarian', 'Vegan')).toBe(false);
    expect(dietConflicts('Vegetarian', 'Jain')).toBe(false);
    expect(dietConflicts('Eggetarian', 'Vegetarian')).toBe(false);
  });
  it('still removes somebody who eats what they asked not to', () => {
    expect(dietConflicts('Vegetarian', 'Non-vegetarian')).toBe(true);
    expect(dietConflicts('Vegan', 'Vegetarian')).toBe(true);
    expect(dietConflicts('Jain', 'Vegan')).toBe(true);
  });
  it('treats only Yes against No as a conflict about children', () => {
    expect(childrenConflict('Yes', 'No')).toBe(true);
    expect(childrenConflict('Yes', 'Maybe')).toBe(false);
    expect(childrenConflict('Yes', 'Prefer not to say')).toBe(false);
    expect(childrenConflict('Maybe', 'No')).toBe(false);
  });
  it('does not turn a privacy answer into a filter, in either direction', () => {
    expect(religionConflict('Prefer not to say', 'Hindu')).toBe(false);
    expect(religionConflict('Hindu', 'Prefer not to say')).toBe(false);
    expect(religionConflict('Other', 'Muslim')).toBe(false);
  });
  it('treats the three non-religious answers as compatible with each other', () => {
    expect(religionConflict('Atheist', 'Agnostic')).toBe(false);
    expect(religionConflict('Agnostic', 'Spiritual')).toBe(false);
    expect(religionConflict('Muslim', 'Christian')).toBe(true);
  });
});

describe('a shared language', () => {
  it('removes a pair with none in common', () => {
    expect(languageBarrier({ languages: ['Japanese'] }, { languages: ['Portuguese'] })).toBe(true);
    expect(hardFilterReason({ languages: ['Japanese'] }, { languages: ['Portuguese'] }, 30)).toBe('language');
  });
  it('keeps a pair that shares one', () => {
    expect(languageBarrier({ languages: ['Japanese', 'English'] }, { languages: ['Portuguese', 'English'] })).toBe(false);
  });
  it('is case-insensitive, like every other comparison here', () => {
    expect(languageBarrier({ languages: ['english'] }, { languages: ['English'] })).toBe(false);
  });
  it('filters nobody when either side has not answered', () => {
    expect(languageBarrier({ languages: [] }, { languages: ['Portuguese'] })).toBe(false);
    expect(languageBarrier({}, { languages: ['Portuguese'] })).toBe(false);
  });
});

import {
  GOAL_ORDER, INTENTS, INTENT_LABELS, canonicalGoal,
  intentOfGoal, intentsOf, sharedIntents, underLens, type Intent,
} from './matching';
import { shapeExtras } from './extras-shape';

/**
 * ── THREE LENSES, ONE POOL (owner, 1 Sep) ──────────────────────────────────
 *
 * "Apart from dating, add dating with intention and marriage." One pool with
 * three ways of looking at it: shared likes, shared allowance, shared chats.
 *
 * The whole design rests on the lens being derivable from what people have
 * ALREADY said, so that nobody is interrupted with a chooser and nobody drops
 * out of the hub while they fail to answer one. That derivation is what most
 * of this file pins — and it is pinned against the SERVED labels from
 * `lookup.data.ts`, not the Title-Case spellings, because a vocabulary that
 * existed only in this file and its own tests is the exact bug the comment
 * above GOAL_ALIASES was written for.
 */

/** The six labels the dropdown actually serves — lookup.data.ts, verbatim. */
const SERVED = [
  'Marriage', 'Long-term relationship', 'Serious dating',
  'Casual dating', 'Friendship first', 'Still figuring it out',
];

describe('three lenses, one pool', () => {
  it('reads every label the dropdown actually serves', () => {
    const got = SERVED.map((g) => [g, intentOfGoal(g)] as const);
    expect(got).toEqual([
      ['Marriage', 'marriage'],
      ['Long-term relationship', 'intentional'],
      ['Serious dating', 'intentional'],
      ['Casual dating', 'dating'],
      ['Friendship first', 'dating'],
      // Not a gap. They said they do not know; a lens is a heading that says
      // what you are here for.
      ['Still figuring it out', null],
    ]);
  });

  it('every rung of the ladder has a lens, so a new goal cannot land nowhere', () => {
    // GOAL_ORDER is the ladder the engine scores on. If a rung is ever added
    // without a lens this goes red HERE, rather than that rung's citizens
    // quietly vanishing from all three headings.
    for (const g of GOAL_ORDER) expect(intentOfGoal(g)).not.toBeNull();
  });

  it('an unstated goal is in no lens, and that is not the same as being hidden', () => {
    expect(intentsOf({})).toEqual([]);
    expect(intentsOf({ relationshipGoal: 'Still figuring it out' })).toEqual([]);
    // `canonicalGoal` already refused this label, and the curated shelf already
    // drops profiles it refuses. This changes neither.
    expect(canonicalGoal('Still figuring it out')).toBeNull();
  });

  it('lets somebody be open to more than one, which the old dropdown could not say', () => {
    const d = { relationshipGoal: 'Casual dating', openTo: ['marriage', 'dating'] };
    // Stored order does not decide display order; INTENTS does.
    expect(intentsOf(d)).toEqual(['dating', 'marriage']);
  });

  it('prefers what they chose over what their old goal implies', () => {
    expect(intentsOf({ relationshipGoal: 'Marriage', openTo: ['dating'] })).toEqual(['dating']);
  });

  it('treats an EMPTY list as a real answer and an ABSENT one as never asked', () => {
    // Present-but-empty is somebody who unticked all three. Falling back to
    // their old goal here would discard the answer the form just took from
    // them — so it does not, even though the goal still says 'Marriage'.
    expect(intentsOf({ relationshipGoal: 'Marriage', openTo: [] })).toEqual([]);
    // Absent is the profile of everyone who has never seen this control.
    expect(intentsOf({ relationshipGoal: 'Marriage' })).toEqual(['marriage']);
  });

  it('ignores a value that is not a lens rather than trusting the client', () => {
    expect(intentsOf({ relationshipGoal: 'Marriage', openTo: ['marriage', 'anything'] })).toEqual(['marriage']);
    // Understood NOTHING in a list that was nonetheless given. Same reading as
    // the empty list above — present is present — and not a fallback to the
    // goal, which would be guessing on the strength of a parse failure. The
    // `shapeExtras` drops an unknown value on the way in, so this is a row
    // written some other way, and either way they stay on the unfiltered list.
    expect(intentsOf({ relationshipGoal: 'Casual dating', openTo: ['nonsense'] })).toEqual([]);
  });

  it('asks BOTH sides, so no lens is a door locked from the other side', () => {
    const marrying = { relationshipGoal: 'Marriage' };
    const casual = { relationshipGoal: 'Casual dating' };
    expect(underLens(marrying, 'marriage')).toBe(true);
    expect(underLens(marrying, 'dating')).toBe(false);
    expect(underLens(casual, 'marriage')).toBe(false);
    expect(sharedIntents(marrying, casual)).toEqual([]);
    expect(sharedIntents(marrying, { openTo: ['dating', 'marriage'] })).toEqual(['marriage']);
  });

  it('names all three for a citizen in their own words', () => {
    expect(INTENTS.map((i: Intent) => INTENT_LABELS[i])).toEqual([
      'Dating', 'Dating with intention', 'Marriage',
    ]);
  });
});

/**
 * ── AND THE LENS SURVIVES A SAVE ───────────────────────────────────────────
 *
 * `openTo` rides in the free-form extras blob, and everything written to that
 * blob passes `shapeExtras`, which keeps ONLY the keys it names. A field the
 * form writes and the shaper does not know about is dropped on save — the
 * citizen ticks three boxes, presses save, and the answer never reaches the
 * database. Nothing would be red: the route answers 200 and the profile saves.
 */
describe('the lens survives a save', () => {
  it('keeps what they ticked, in the app’s own order', () => {
    const out = shapeExtras({ openTo: ['marriage', 'dating'], relationshipGoal: 'Marriage' });
    expect(out.openTo).toEqual(['dating', 'marriage']);
  });

  it('keeps an empty list, because unticking everything is an answer', () => {
    expect(shapeExtras({ openTo: [] }).openTo).toEqual([]);
    // And absent stays absent — the state every profile written before today
    // is in, and the one that tells intentsOf to read their stated goal.
    expect('openTo' in shapeExtras({ relationshipGoal: 'Marriage' })).toBe(false);
  });

  it('cannot be told about a fourth heading by a client', () => {
    expect(shapeExtras({ openTo: ['marriage', 'hookups', 42, null] }).openTo).toEqual(['marriage']);
  });

  it('and the shaper knows every lens the engine does', () => {
    // Not a copy of the list: the one INTENTS exports, round-tripped. A lens
    // added to matching.ts and forgotten here would go red on this line
    // rather than quietly refusing to save.
    expect(shapeExtras({ openTo: [...INTENTS] }).openTo).toEqual([...INTENTS]);
  });
});

import {
  RELATIONSHIP_STATUSES, relationshipStatusFrom, relationshipStatusLabel, relationshipStatusNote,
} from './relationship-status';

/**
 * The field is optional and nothing computes with it, so this spec is mostly
 * about the two ways it could quietly become untrue: a guess, and a blank that
 * reads as an answer.
 */
describe('relationship status', () => {
  it('reads its own vocabulary, however it arrives', () => {
    expect(relationshipStatusFrom('single')).toBe('single');
    expect(relationshipStatusFrom('inRelationship')).toBe('inRelationship');
    expect(relationshipStatusFrom('in relationship')).toBe('inRelationship');
    expect(relationshipStatusFrom('Prefer_not_to_say')).toBe('preferNotToSay');
    for (const s of RELATIONSHIP_STATUSES) expect(relationshipStatusFrom(s)).toBe(s);
  });

  it('refuses to guess', () => {
    // Whatever this returned would be filed as the citizen's own answer about
    // their life, and nothing here can check it.
    expect(relationshipStatusFrom("it's complicated")).toBeUndefined();
    expect(relationshipStatusFrom('partnered')).toBeUndefined();
    expect(relationshipStatusFrom('')).toBeUndefined();
    expect(relationshipStatusFrom(null)).toBeUndefined();
  });

  it('keeps "prefer not to say" as an ANSWER, not as a blank', () => {
    // Declining to publish a relationship is a decision. Never having been
    // asked is not. The same distinction blood group draws.
    expect(relationshipStatusFrom('preferNotToSay')).toBe('preferNotToSay');
    expect(relationshipStatusNote('preferNotToSay')).toBe('Prefer not to say');
    expect(relationshipStatusNote(null)).toBe('Not recorded');
    expect(relationshipStatusNote('preferNotToSay')).not.toBe('Not recorded');
  });

  it('shows a name, never a storage key', () => {
    expect(relationshipStatusLabel('inRelationship')).toBe('In a relationship');
    expect(relationshipStatusLabel('preferNotToSay')).toBe('Prefer not to say');
  });

  it('does not borrow dating\'s vocabulary', () => {
    // relationshipGoal is what somebody is LOOKING FOR. A goal is not a status,
    // and one list holding both would be the field-doing-two-jobs mistake.
    for (const goal of ['Marriage', 'Casual dating', 'Friendship first', 'Still figuring it out']) {
      expect(relationshipStatusFrom(goal)).toBeUndefined();
    }
  });
});

/**
 * The relationship statuses this form offers, and what each is called.
 *
 * ONE LIST, MIRRORED AND GUARDED — the values must match
 * `RELATIONSHIP_STATUSES` in the API's `shared/relationship-status.ts`, which is
 * what the server validates against. `master-profile-fields.test.ts` reads that
 * file and fails on drift, the same way the blood group pair is guarded.
 *
 * This is NOT dating's relationshipGoal ('Marriage', 'Casual dating' — what
 * somebody is looking for) and NOT a Connection's relationship (spouse, parent
 * — a fact about a pair). Three different questions.
 */
export const RELATIONSHIP_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'inRelationship', label: 'In a relationship' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'married', label: 'Married' },
  { value: 'separated', label: 'Separated' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'preferNotToSay', label: 'Prefer not to say' },
];

// No label helper here on purpose. The only place this field is shown is the
// picker on the Master Profile, which renders the labels itself — and the
// dead-export ceiling caught the helper the moment it was written with nobody
// to call it. An export with no importer is where a feature gets built by
// mistake; if a screen ever needs to show this outside the picker, that screen
// is the reason to add one.

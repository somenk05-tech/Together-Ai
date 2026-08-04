/**
 * What a deleted account actually loses, model by model.
 *
 * Deleting an account has always been two promises made at once, and only the
 * first was kept. `deleteAccount` anonymises the profile immediately — name,
 * email, handle, password — and that is the promise about IDENTITY. The promise
 * about DATA was never kept at all: every blood panel, prescription, journal
 * entry, meal plan and drive file stayed exactly where it was, indefinitely,
 * because there was no hard-delete job of any kind.
 *
 * This file is the second promise, written down. Thirty days after a deletion,
 * everything below marked `purge` is destroyed for real.
 *
 * ── The rule for what survives ──────────────────────────────────────────
 *
 * The User row itself stays, stripped to a tombstone. That is not a loophole,
 * it is what makes the rest coherent: a group conversation someone was part of
 * has to stay readable for the people still in it, and a message with a
 * dangling author is worse for everyone than one attributed to "Deleted
 * citizen". So anything OTHER PEOPLE CAN SEE is kept and attributed; anything
 * only the deleted person could ever see is destroyed.
 *
 * ── Why every model is listed, including the kept ones ──────────────────
 *
 * A purge that works by listing what to delete goes wrong quietly: somebody
 * adds a hub next year, nobody adds it here, and a table of medical data
 * outlives the deletion request that was supposed to remove it. Nothing about
 * that failure is visible — the job keeps reporting success.
 *
 * So the list is exhaustive rather than selective, and the spec beside this
 * file reads schema.prisma and fails when a model carrying a citizen's id is
 * not classified. Adding a model forces a decision. Getting that decision wrong
 * is still possible; forgetting to make it is not.
 *
 * ── The asymmetry that shapes the doubtful cases ────────────────────────
 *
 * A wrongly-kept row is a leftover to clean up later. A wrongly-purged row is
 * somebody ELSE's data, gone, with no way back — a household's meal plan, a
 * group thread with holes in it. The two mistakes are not equal, so where a
 * model is genuinely ambiguous this keeps it and says why.
 */
export type Action = 'purge' | 'keep';

export interface PurgeRule {
  /** Prisma model name, exactly as it appears in schema.prisma. */
  model: string;
  /** The column that ties a row to a citizen. */
  by: 'userId' | 'ownerId' | 'authorId' | 'senderId' | 'createdById' | 'memberUserId' | 'hostId' | 'postedById';
  action: Action;
  /** Why. Not optional — a rule nobody can explain is a rule nobody can review. */
  reason: string;
  /** Extra WHERE clause, for models where only SOME rows are personal. */
  filter?: Record<string, unknown>;
  /** Column holding an object-storage key that must be deleted with the row. */
  storageKey?: string;
  /**
   * Keys that live INSIDE a JSON column rather than in one of their own.
   *
   * Dating photos (M3) are private objects whose keys sit in an array in
   * DatingProfile.extras alongside everything else about the profile. Deleting
   * the row would leave the images in the bucket forever — the account gone and
   * the face still stored, which is the exact failure the purge exists to
   * prevent. There was no way to express that here, so a rule could be complete
   * and still leak.
   */
  storageKeysJson?: { column: string; field: string };
}

export const PURGE_RULES: PurgeRule[] = [
  // ── Health. The most sensitive data in the city, and the least ambiguous:
  //    none of it is visible to another citizen, all of it goes.
  { model: 'MedicalRecord', by: 'userId', action: 'purge', storageKey: 'fileKey', reason: 'Uploaded medical documents. Private to the citizen; the stored file goes with the row.' },
  { model: 'MedicalBloodTest', by: 'userId', action: 'purge', reason: 'Blood panels. Biomarkers and cached analyses cascade from here.' },
  { model: 'BloodAnalysis', by: 'userId', action: 'purge', reason: 'Cached interpretations of a panel.' },
  { model: 'BloodMarker', by: 'userId', action: 'purge', reason: 'Individual marker values.' },
  { model: 'MedicalConsent', by: 'userId', action: 'purge', reason: 'Consent records for a person who no longer exists here.' },
  { model: 'Prescription', by: 'userId', action: 'purge', storageKey: 'fileKey', reason: 'Uploaded prescriptions, with the scanned file.' },
  { model: 'Medicine', by: 'userId', action: 'purge', reason: 'What they were taking.' },
  { model: 'MedicineSchedule', by: 'userId', action: 'purge', reason: 'When and how much they were told to take.' },
  { model: 'MedicineReminder', by: 'userId', action: 'purge', reason: 'Pending alarms. Left behind, the cron would keep trying to reach a deleted account.' },
  { model: 'DoseLog', by: 'userId', action: 'purge', reason: 'Whether each dose was taken.' },
  { model: 'Consult', by: 'userId', action: 'purge', reason: 'Doctor consultations.' },
  { model: 'FitnessProfile', by: 'userId', action: 'purge', reason: 'Body measurements and goals.' },
  { model: 'WorkoutLog', by: 'userId', action: 'purge', reason: 'Every workout they logged, and when.' },

  // ── Nutrition. One exception, and it is the reason this file has filters.
  { model: 'MealPlan', by: 'userId', action: 'purge', filter: { mode: 'individual' }, reason: 'Their own weekly plans. Family plans are exempted below — a household still eats from those.' },
  { model: 'MealPlan', by: 'userId', action: 'keep', filter: { mode: 'family' }, reason: 'A plan made FOR a household. Deleting it takes the week\'s meals away from people who did not delete anything.' },
  { model: 'NutritionHistory', by: 'userId', action: 'purge', reason: 'Snapshots of past weeks, personal to them.' },
  { model: 'CalorieEntry', by: 'userId', action: 'purge', reason: 'What they logged eating.' },
  { model: 'FoodPref', by: 'userId', action: 'purge', reason: 'Diet, allergies and health conditions — sensitive, and theirs alone.' },
  { model: 'FoodJournalEntry', by: 'userId', action: 'purge', reason: 'A meal-by-meal record of what they ate — theirs alone, and nobody else ever saw it.' },
  { model: 'GroceryCart', by: 'userId', action: 'purge', reason: 'Grocery baskets, built from their own plans.' },
  // Placed AFTER the MealPlan rules on purpose: the retired Meal table still
  // holds a plain FK to Recipe (no cascade), and a citizen's own Meal rows
  // cascade away with their individual plans above — so by the time this rule
  // runs, nothing of theirs holds the FK open.
  { model: 'Recipe', by: 'authorId', action: 'purge', reason: 'Their own dishes. NULL authorId is the vetted world corpus and never matches a citizen; a private dish is visible only to its author, so nothing another citizen can see is destroyed. Ingredients cascade with the row.' },
  // Placed AFTER the MealPlan rules on purpose: the retired Meal table still
  // holds a plain FK to Recipe (no cascade), and a citizen's own Meal rows
  // cascade away with their individual plans above — so by the time this rule
  // runs, nothing of theirs holds the FK open.
  { model: 'Recipe', by: 'authorId', action: 'purge', reason: 'Their own dishes. NULL authorId is the vetted world corpus and never matches a citizen; a private dish is visible only to its author, so nothing another citizen can see is destroyed. Ingredients cascade with the row.' },
  { model: 'NutritionOrder', by: 'userId', action: 'purge', reason: 'Grocery orders. Line items cascade.' },
  { model: 'DietitianBooking', by: 'userId', action: 'purge', reason: 'Their side of a booking; the dietitian is a catalogue row and stays.' },

  // ── Household. Owned by one citizen, depended on by several.
  { model: 'FamilyMember', by: 'ownerId', action: 'keep', reason: 'The household roster. If the owner deletes, the remaining members still need it to exist.' },
  { model: 'HouseholdMember', by: 'ownerId', action: 'keep', reason: 'Invitations into a household others are still in.' },
  { model: 'HouseholdMember', by: 'memberUserId', action: 'keep', reason: 'Their membership of SOMEONE ELSE\'s household. Removing it silently changes another person\'s household.' },
  { model: 'PantryItem', by: 'ownerId', action: 'keep', reason: 'What is in a shared kitchen. Not personal data, and other people shop against it.' },
  { model: 'PantryConsumption', by: 'ownerId', action: 'keep', reason: 'Kitchen stock movements, same shared kitchen.' },

  // ── Private hubs. Nobody else has ever been able to see any of this.
  { model: 'Thought', by: 'userId', action: 'purge', reason: 'A private journal. If anything here is purged, this is.' },
  { model: 'MasterProfile', by: 'userId', action: 'purge', reason: 'The cross-hub profile — birth details, body, preferences.' },
  { model: 'ProfileChange', by: 'userId', action: 'purge', reason: 'Audit trail of profile edits — holds the old and new values of health data, so it is the citizen\'s data too, not just a record that they had some.' },
  { model: 'GroceryListItem', by: 'userId', action: 'purge', reason: 'Their shopping list, including anything they added by hand. Small, and theirs.' },
  { model: 'DailyTargetSnapshot', by: 'userId', action: 'purge', reason: 'The calorie and macro targets in force on each of their days — derived from their weight, height, age, sex and medical conditions, and holding the whole prescription as JSON. A record of somebody\'s body over time.' },
  { model: 'VerificationCode', by: 'userId', action: 'purge', reason: 'Six-digit codes with the email address or phone number they were sent to. Spent or not, it is contact data.' },
  { model: 'AstroProfile', by: 'userId', action: 'purge', reason: 'Birth date, time and place.' },
  { model: 'AstroReading', by: 'userId', action: 'purge', reason: 'Readings written for them and nobody else.' },
  { model: 'AstroQuestion', by: 'userId', action: 'purge', reason: 'Questions they asked, which are often about health or relationships.' },
  { model: 'TarotReading', by: 'userId', action: 'purge', reason: 'Which cards they drew, and on what day.' },
  { model: 'BeautyProfile', by: 'userId', action: 'purge', reason: 'Skin assessments, including photo-derived findings.' },
  { model: 'BeautyOrder', by: 'userId', action: 'purge', reason: 'What they bought from the beauty shelf.' },
  { model: 'LookAnalysis', by: 'userId', action: 'purge', storageKey: 'fileKey', reason: 'Reference photos of a face, and what was read from them.' },
  { model: 'Avatar', by: 'userId', action: 'purge', storageKey: 'assetKey', reason: 'Generated avatars and their stored images.' },
  { model: 'DatingProfile', by: 'userId', action: 'purge', storageKeysJson: { column: 'extras', field: 'photos' }, reason: 'Dating preferences and intent — and the photos, whose keys live in the extras JSON.' },
  { model: 'JobProfile', by: 'userId', action: 'purge', reason: 'Their CV — history, skills, salary expectations.' },
  { model: 'JobApplication', by: 'userId', action: 'purge', reason: 'Applications they sent. The employer keeps the job posting, not the applicant\'s file.' },
  { model: 'PrivacySetting', by: 'userId', action: 'purge', reason: 'Consent and permission flags.' },
  { model: 'Budget', by: 'userId', action: 'purge', reason: 'Income, spending categories and targets.' },
  { model: 'CityWallet', by: 'userId', action: 'purge', reason: 'What they were holding in the city wallet.' },
  { model: 'WalletLedger', by: 'userId', action: 'purge', reason: 'Every credit and debit against that wallet.' },
  { model: 'WalletTxn', by: 'userId', action: 'purge', reason: 'Individual wallet transactions and what they paid for.' },
  { model: 'MailAccount', by: 'userId', action: 'purge', reason: 'Their in-city mailbox.' },
  { model: 'MailMessage', by: 'ownerId', action: 'purge', reason: 'Mail in that mailbox. Private by definition — the recipient holds their own copy.' },
  { model: 'DriveFolder', by: 'ownerId', action: 'purge', reason: 'Their private vault structure.' },
  { model: 'DriveFile', by: 'ownerId', action: 'purge', storageKey: 'storageKey', reason: 'Files in the vault, with the stored objects.' },
  { model: 'TripBooking', by: 'userId', action: 'purge', reason: 'Where they went, and when they were away.' },
  { model: 'TicketBooking', by: 'userId', action: 'purge', reason: 'Which events they bought tickets to attend.' },
  { model: 'Reservation', by: 'userId', action: 'purge', reason: 'Restaurant reservations.' },
  { model: 'DiningOrder', by: 'userId', action: 'purge', reason: 'What they ordered, from where, and when.' },

  // ── Credentials. Dead the moment the account was deleted; removed now rather
  //    than left as hashes tied to a person in every future database dump.
  { model: 'RefreshToken', by: 'userId', action: 'purge', reason: 'Sessions, already revoked. The rows are still credentials.' },
  { model: 'VerificationToken', by: 'userId', action: 'purge', reason: 'Email verification links.' },
  { model: 'RecoveryCode', by: 'userId', action: 'purge', reason: 'Account recovery codes.' },
  { model: 'PasswordReset', by: 'userId', action: 'purge', reason: 'Password reset tokens, live or spent.' },
  { model: 'DeviceToken', by: 'userId', action: 'purge', reason: 'Push tokens. Kept, they would address a phone that belongs to nobody here.' },
  { model: 'EmailDelivery', by: 'userId', action: 'purge', reason: 'Delivery receipts carrying an address that has been nulled everywhere else.' },
  { model: 'Notification', by: 'userId', action: 'purge', reason: 'Their notification feed.' },

  // ── Things other people can see. Kept and attributed, per the retention
  //    decision recorded in docs/decisions.md.
  { model: 'ConversationMember', by: 'userId', action: 'keep', reason: 'Membership of conversations other people are still reading. Removing it would break those threads.' },
  { model: 'Message', by: 'senderId', action: 'keep', reason: 'What they said to other people. A group thread full of holes is worse for the people left in it than one attributed to a deleted citizen.' },
  { model: 'MessageStatus', by: 'userId', action: 'keep', reason: 'Delivery and read receipts belonging to messages that stay.' },
  { model: 'Comment', by: 'authorId', action: 'keep', reason: 'Replies on other people\'s posts, which those conversations still read as.' },
  { model: 'Like', by: 'userId', action: 'keep', reason: 'A like is a number on somebody else\'s post. Removing it edits their post.' },
  { model: 'Post', by: 'authorId', action: 'keep', reason: 'Already deleted at soft-delete time, so nothing is left. Listed so the model is classified rather than missed.' },
  { model: 'CallSession', by: 'createdById', action: 'keep', reason: 'The other person\'s call history too. Timestamps only — no content.' },
  { model: 'CallParticipant', by: 'userId', action: 'keep', reason: 'Their seat in that shared history.' },
  { model: 'DatingActivity', by: 'hostId', action: 'keep', reason: 'An activity other people joined.' },
  { model: 'Job', by: 'postedById', action: 'keep', reason: 'A posting other citizens have applied to.' },

  // ── Service providers. These carry a userId because a booking opens a chat,
  //    but the rows are a public directory rather than a citizen's data.
  { model: 'Doctor', by: 'userId', action: 'keep', reason: 'Shared medical directory, not personal data.' },
  { model: 'Dietitian', by: 'userId', action: 'keep', reason: 'Shared dietitian directory, not personal data.' },
];

/** How long a deleted account is kept before it is destroyed for real. */
export const PURGE_AFTER_DAYS = 30;

export function purgeCutoff(now: Date): Date {
  return new Date(now.getTime() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
}

/** Rules that actually delete something, in the order they should run. */
export function deletions(): PurgeRule[] {
  return PURGE_RULES.filter((r) => r.action === 'purge');
}

/** Rules whose rows hold an object-storage key that must be removed too. */
export function storageBearing(): PurgeRule[] {
  return deletions().filter((r) => r.storageKey || r.storageKeysJson);
}

/** The WHERE clause for one rule against one citizen. */
export function whereFor(rule: PurgeRule, userId: string): Record<string, unknown> {
  return { [rule.by]: userId, ...(rule.filter ?? {}) };
}

/** Every model this file has an opinion about, purged or kept. */
export function classifiedModels(): Set<string> {
  return new Set(PURGE_RULES.map((r) => r.model));
}

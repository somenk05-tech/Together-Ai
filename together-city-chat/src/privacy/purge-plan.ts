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
  by: 'userId' | 'ownerId' | 'authorId' | 'senderId' | 'createdById' | 'memberUserId' | 'hostId' | 'postedById'
    | 'reporterId' | 'listingId' | 'invitedUserId' | 'either';
  /**
   * For `by: 'either'` — a PAIR table, where the citizen may sit in one of two
   * columns. Dating's tables are all of this shape (userOneId/userTwoId,
   * userA/userB) and the plan had no vocabulary for it, which is how a
   * deleted citizen's every like, pass, reveal flag and per-pair intimacy
   * score survived their account indefinitely. Found in the 26 Aug audit.
   */
  pair?: [string, string];
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
   *
   * FIELDS, PLURAL, AS OF 27 AUG — because singular already leaked once. The
   * verification selfie's key sits in the SAME blob under `selfieKey`, and the
   * rule named only `photos`: the row went and the photograph of the person's
   * face — collected on the promise it was only ever for verification — stayed
   * in the bucket indefinitely. A field may hold an array of keys or one key;
   * the purge reads both.
   */
  storageKeysJson?: { column: string; fields: string[] };
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
  { model: 'SupplementBag', by: 'userId', action: 'purge', reason: 'What they have put in the supplement basket but not yet bought. An unfinished purchase is still a statement about their body.' },
  { model: 'SupplementOrder', by: 'userId', action: 'purge', reason: 'Which supplements they bought and when — a health record in everything but name, and read as one by anybody who sees it.' },

  // ── Nutrition. One exception, and it is the reason this file has filters.
  { model: 'MealPlan', by: 'userId', action: 'purge', filter: { mode: 'individual' }, reason: 'Their own weekly plans. Family plans are exempted below — a household still eats from those.' },
  { model: 'MealPlan', by: 'userId', action: 'keep', filter: { mode: 'family' }, reason: 'A plan made FOR a household. Deleting it takes the week\'s meals away from people who did not delete anything.' },
  { model: 'NutritionHistory', by: 'userId', action: 'purge', reason: 'Snapshots of past weeks, personal to them.' },
  { model: 'CalorieEntry', by: 'userId', action: 'purge', reason: 'What they logged eating.' },
  { model: 'FoodPref', by: 'userId', action: 'purge', reason: 'Diet, allergies and health conditions — sensitive, and theirs alone.' },
  { model: 'FoodJournalEntry', by: 'userId', action: 'purge', reason: 'A meal-by-meal record of what they ate — theirs alone, and nobody else ever saw it.' },
  { model: 'GroceryCart', by: 'userId', action: 'purge', reason: 'Grocery baskets, built from their own plans.' },

  // ── Local Services ──────────────────────────────────────────────────────
  // A business page is a shopfront the citizen put up. Taking the account away
  // has to take the shopfront down: a directory advertising a plumber who has
  // deleted themselves is a phone number that rings nowhere.
  //
  // ServiceEnquiry and ServiceMessage are NOT listed here, and that is
  // deliberate rather than an omission. They carry no `userId`-shaped column,
  // so the spec does not require a rule and a rule for them would read as
  // stale. What happens to them is decided by two facts instead:
  //   · deleting a listing cascades its threads away with it, which is right —
  //     a conversation about a business that no longer exists has no second
  //     side left to keep it for;
  //   · a SEEKER's threads survive their own deletion, because the business
  //     side of that conversation belongs to somebody who deleted nothing, and
  //     there is no identity in those rows to destroy. The seeker was
  //     "Neighbour 3" the whole time.
    /**
   * ADMIN GRANTS AND THE AUDIT TRAIL.
   *
   * AdminGrant is purged with the account: a role held by somebody who no
   * longer exists is a permission with no holder, and leaving it behind means
   * a re-registered handle could inherit it.
   *
   * AdminAudit is KEPT. An audit trail exists precisely so that an action
   * cannot be made to disappear, and an admin who could erase their own record
   * by deleting their own account has a trail that answers nothing. The rows
   * carry what a staff member DID in that role, not what a citizen is — and
   * the citizen data inside them is already reduced to the field that moved
   * rather than a copy of anybody's record.
   *
   * This is a deliberate exception to "your data is yours", and it applies to
   * staff acting as staff, never to a citizen's own use of the app.
   */
  { model: 'AdminGrant', by: 'userId', action: 'purge', reason: 'A role held by an account that no longer exists is a permission with no holder.' },
  // AdminAudit carries `actorId`, which is not one of the link columns the spec
  // scans, so it needs no rule and a rule would read as stale. The decision is
  // written down all the same: audit rows are KEPT.
{ model: 'ServiceListing', by: 'ownerId', action: 'purge', reason: 'Their own business page, and the threads hanging off it — a shopfront for somebody who has left is a door onto nothing.' },
  { model: 'ServiceRegular', by: 'userId', action: 'purge', reason: 'A private shortlist of the businesses they kept going back to. Nobody else has ever seen it, and it says a great deal about a person.' },
  // The order card in the thread deliberately carries no name and no address
  // (see deliverCard in orders.service.ts), so purging the row takes the ONLY
  // copy of what the citizen shared at checkout. The money's record survives
  // separately: the invoice under the listing and the tombstoned PaymentIntent,
  // neither of which says where anybody lives.
  { model: 'SavedAddress', by: 'userId', action: 'purge', reason: 'Their address book — home, office, wherever they had dinner sent. Where somebody lives is the last thing that should outlive them here.' },
  { model: 'ServiceOrder', by: 'userId', action: 'purge', reason: 'What they ordered, and the name, phone and delivery address they shared to get it. The identity a kitchen needed for one dinner dies with the account; the business keeps the invoice, which identifies nobody.' },
  // ── The Till. Two-sided money, and the asymmetry decides every rule below.
  //
  // An invoice is a document between two people, and only one of them has
  // left. The business still has to be able to show what it billed, what it
  // was paid and what it settled — to its accountant, to a tax authority, and
  // to anybody disputing a payout. So the CUSTOMER'S side of these rows is not
  // destroyed by the customer's deletion, exactly as a Message is not: the
  // other party keeps their copy, and the citizen is already a tombstone on it.
  //
  // The BUSINESS'S side is a different question and gets the opposite answer.
  // ServiceListing is purged by ownerId two lines above, and every table here
  // cascades from it — so an owner deleting their account takes the shopfront,
  // its invoices, its ledger and its payout account with it, which is what the
  // shopfront rule already promised.
  { model: 'Invoice', by: 'ownerId', action: 'purge', reason: 'Invoices the business itself wrote. They go with the shopfront when its owner leaves; a bill from a business that no longer exists is a demand nobody can answer.' },
  { model: 'MerchantAccount', by: 'ownerId', action: 'purge', reason: 'Where their payouts were sent — the provider reference, the last four digits and the name on the account. Nobody but the owner has ever seen it.' },
  { model: 'MerchantLedgerEntry', by: 'ownerId', action: 'purge', reason: 'The business\u2019s own book of sales, fees and payouts. Private to the owner and meaningless once the shopfront is gone.' },
  { model: 'Settlement', by: 'ownerId', action: 'purge', reason: 'Transfers out to their bank, with the invoices each covered. The owner\u2019s financial record of their own business.' },
  // PaymentIntent carries the PAYER\u2019s userId, so a rule keyed on it would
  // delete the business\u2019s record of being paid when the customer leaves.
  // Kept, for the same reason a Message is: it is one half of something two
  // people did, and the surviving half belongs to somebody who deleted
  // nothing. The rows the OWNER holds go by cascade with the listing.
  { model: 'PaymentIntent', by: 'userId', action: 'keep', reason: 'One side of a payment between two people. The business needs its record of being paid, and the citizen is already a tombstone on it — the same rule that keeps Messages.' },
  // ServiceReview carries `reviewerId`, which is not one of the link columns the
  // spec scans for, so it needs no rule here — and a rule would read as stale.
  // What happens to it is a decision all the same, so it is written down:
  // reviews are KEPT. Other people read them and a business may already have
  // replied; removing one rewrites a public record and takes the reply with it.
  // Nothing identifying is lost by keeping it, because a review is signed with
  // an alias and never carried a name in the first place.
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
  { model: 'DayPage', by: 'userId', action: 'purge', reason: 'How their days felt and what they wrote in them. A diary, and it goes with the diarist.' },
  { model: 'DayItem', by: 'userId', action: 'purge', reason: 'What they meant to do on a given day. Nobody else has a use for a stranger’s Tuesday.' },
  { model: 'DayPhoto', by: 'userId', action: 'purge', storageKey: 'fileKey', reason: 'Photographs kept in the diary. The row AND the file in the private vault — a deleted account that leaves its pictures in a bucket is not a deleted account.' },
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
  { model: 'DatingProfile', by: 'userId', action: 'purge', storageKeysJson: { column: 'extras', fields: ['photos', 'selfieKey'] }, reason: 'Dating preferences and intent — the photos, AND the verification selfie, both of whose keys live in the extras JSON. The selfie is the one the first version of this rule missed.' },
  // The three dating tables the plan could not see, because their columns are
  // not called userId. The User row stays as a tombstone, so the cascades on
  // these never fired; the plan has to name them.
  { model: 'Connection', by: 'either', pair: ['userOneId', 'userTwoId'], action: 'purge', reason: 'Their connections — friend, family, blocked. A link to a tombstone is a name in somebody else\'s people list that leads nowhere; the other person\'s side of any thread they shared is classified on its own rows.' },
  { model: 'DatingMatch', by: 'either', pair: ['userOneId', 'userTwoId'], action: 'purge', reason: 'Every like, pass, super-like and reveal between them and another citizen. Who somebody chose, and who chose them, is theirs — and the other person keeps nothing they could read from it once the profile is gone.' },
  { model: 'CompatibilityScore', by: 'either', pair: ['userA', 'userB'], action: 'purge', reason: 'Seven per-pair intimacy scores against every candidate they were ever scored with. Derived entirely from their profile, and meaningless without it.' },
  { model: 'Appeal', by: 'userId', action: 'purge', reason: 'What they wrote arguing with a moderation decision on their own profile or photo. Theirs, and about a profile that no longer exists.' },
  { model: 'AppEvent', by: 'userId', action: 'purge', reason: 'Funnel steps recorded against their id — which page they opened, whom they liked. The aggregate counts the dashboard shows are recomputed from what remains; a deleted person is not a data point.' },
  { model: 'DatingPhotoReview', by: 'userId', action: 'purge', reason: 'The review verdict on each of their dating photos. The photos themselves are carried away with DatingProfile, whose extras JSON holds the keys.' },
  { model: 'ModerationLog', by: 'listingId', action: 'purge', reason: 'Dating reuses this table keyed by userId in the listingId column — the audit trail of approvals and rejections of THEIR profile. Once the profile is gone the record is a name and a verdict.' },
  { model: 'JobProfile', by: 'userId', action: 'purge', reason: 'Their CV — history, skills, salary expectations.' },
  { model: 'JobApplication', by: 'userId', action: 'purge', reason: 'Applications they sent. The employer keeps the job posting, not the applicant\'s file.' },
  { model: 'PrivacySetting', by: 'userId', action: 'purge', reason: 'Consent and permission flags.' },
  { model: 'Budget', by: 'userId', action: 'purge', reason: 'Income, spending categories and targets.' },
  { model: 'CityWallet', by: 'userId', action: 'purge', reason: 'What they were holding in the city wallet.' },
  { model: 'MiraPass', by: 'userId', action: 'purge', reason: 'Mira conversation meter and subscription window — only the citizen ever sees it, and a tombstone needs no chat allowance.' },
  { model: 'MiraTurn', by: 'userId', action: 'purge', reason: 'Every conversation with Mira — her memory of the citizen. The most personal record in the city; nothing of it survives the account.' },
  // The two below were added by other work without a classification, which
  // this spec is designed to force. Decided here rather than left red:
  { model: 'MailProject', by: 'ownerId', action: 'purge', reason: 'Their mailbox’s project folders — names, keys, colours. Only the owner ever sees them, and the mail they organised is already classified on its own rows.' },
  { model: 'SpendLogEntry', by: 'userId', action: 'purge', reason: 'Their hand-written spend log — free-text notes about their own money.' },
  { model: 'WalletLedger', by: 'userId', action: 'purge', reason: 'Every credit and debit against that wallet.' },
  { model: 'WalletTxn', by: 'userId', action: 'purge', reason: 'Individual wallet transactions and what they paid for.' },
  { model: 'MailAccount', by: 'userId', action: 'purge', reason: 'Their in-city mailbox.' },
  { model: 'MailMessage', by: 'ownerId', action: 'purge', reason: 'Mail in that mailbox. Private by definition — the recipient holds their own copy.' },
  { model: 'DriveFolder', by: 'ownerId', action: 'purge', reason: 'Their private vault structure.' },
  { model: 'DriveFile', by: 'ownerId', action: 'purge', storageKey: 'storageKey', reason: 'Files in the vault, with the stored objects.' },
  { model: 'TripBooking', by: 'userId', action: 'purge', reason: 'Where they went, and when they were away.' },
  { model: 'TicketBooking', by: 'userId', action: 'purge', reason: 'Which events they bought tickets to attend.' },
  // Reservation and DiningOrder were dropped with the invented Restaurants hub
  // (22 Aug) — rules for them here were deletes that silently never ran, which
  // is exactly what the "classifies nothing that no longer exists" guard is for.
  { model: 'MiraFact', by: 'userId', action: 'purge', reason: 'What Mira learned about them, in their own terms — subjects, habits, people. The most personal table in the building; it dies first.' },
  { model: 'Pet', by: 'userId', action: 'purge', reason: 'Their pets\u2019 records — names, species, weights, vet notes. A household detail nobody else was ever shown.' },
  { model: 'PetPhoto', by: 'userId', action: 'purge', storageKey: 'fileKey', reason: 'Photographs of their pets, with the stored objects. They cascade from Pet, but the stored file needs its own carrying away.' },

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
  // Unclassified until the 27 Aug launch audit, and invisible to the spec beside
  // this file because that guard looked for `userId`-shaped columns and this one
  // is `reporterId` — the exact silent-miss this plan exists to prevent, one
  // column name away. Classified rather than purged: a report is a record ABOUT
  // SOMEBODY ELSE, and deleting your account should not delete the safety
  // history of the person you reported. The reporter is already a tombstone by
  // the time this runs, so the row names nobody.
  { model: 'Report', by: 'reporterId', action: 'keep', reason: 'A moderation record about a THIRD party. Purging it would let anyone erase the evidence against someone by closing their own account.' },
  { model: 'Message', by: 'senderId', action: 'keep', reason: 'What they said to other people. A group thread full of holes is worse for the people left in it than one attributed to a deleted citizen.' },
  { model: 'MessageStatus', by: 'userId', action: 'keep', reason: 'Delivery and read receipts belonging to messages that stay.' },
  { model: 'Comment', by: 'authorId', action: 'keep', reason: 'Replies on other people\'s posts, which those conversations still read as.' },
  { model: 'Like', by: 'userId', action: 'keep', reason: 'A like is a number on somebody else\'s post. Removing it edits their post.' },
  { model: 'Post', by: 'authorId', action: 'keep', reason: 'Already deleted at soft-delete time, so nothing is left. Listed so the model is classified rather than missed.' },
  { model: 'CallSession', by: 'createdById', action: 'keep', reason: 'The other person\'s call history too. Timestamps only — no content.' },
  { model: 'CallParticipant', by: 'userId', action: 'keep', reason: 'Their seat in that shared history.' },
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
  if (rule.by === 'either') {
    if (!rule.pair) throw new Error(`purge rule for ${rule.model} says 'either' and names no pair`);
    return { OR: [{ [rule.pair[0]]: userId }, { [rule.pair[1]]: userId }], ...(rule.filter ?? {}) };
  }
  return { [rule.by]: userId, ...(rule.filter ?? {}) };
}

/** Every model this file has an opinion about, purged or kept. */
export function classifiedModels(): Set<string> {
  return new Set(PURGE_RULES.map((r) => r.model));
}

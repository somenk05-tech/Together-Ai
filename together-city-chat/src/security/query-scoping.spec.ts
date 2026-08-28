import { stats, unscopedSignatures } from './query-inventory';

/**
 * Nobody's row without their name on it.
 *
 * The route guards next door prove a handler is authenticated and receives the
 * current user. They prove nothing about what the service then does with it —
 * `findUnique({ where: { id } })` with the userId sitting unused in the
 * parameter list looks perfectly fine one layer up. That gap is where an IDOR
 * lives, and it is the gap this closes.
 *
 * Every model with a `userId` column belongs to one citizen. This walks the
 * service layer, finds queries against those models that never name an owner,
 * and compares them to the reviewed list below.
 *
 * REVIEWED, 2026-07-29 — all 39 were read individually and none leaks across
 * citizens. They fall into four honest shapes:
 *
 *   1. Ownership established a line earlier. `deleteRecord` loads the row with
 *      `findFirst({ id, userId })`, throws if absent, then deletes by id. The
 *      delete carries no userId because the check already happened.
 *   2. The identifier IS the credential. A refresh token is found by its own
 *      hash; a password reset by its token; a dead push token by its value.
 *      There is no user to scope by until the credential resolves to one.
 *   3. Shared catalogue. Doctors and dietitians are Users, so their tables
 *      carry userId, but the rows are a public directory — every citizen is
 *      meant to read all of them.
 *   4. Aggregate counts with no rows returned. Restaurant popularity, likes on
 *      a post: a number over everyone's data, disclosing nobody's.
 *
 * Two that took the longest to clear, recorded so nobody has to redo the work:
 *
 *   - MealPlan keys are random tokens ('wk_' + 8 chars), NOT derived from the
 *     user, so `findUnique({ where: { key } })` is only safe when something
 *     checks the owner. Every route that takes a key from the request does:
 *     seven via assertOwnsPlan, buildCart by folding userId into the query, and
 *     daySummary through its own richer check that also lets a household member
 *     read the shared family plan.
 *   - jobs' JobApplication queries look unscoped but each is preceded by an
 *     explicit `app.userId !== userId` or `job.postedById !== userId` throw.
 *
 * Shrunk again 2026-07-29, when the account-purge work turned up a live bug:
 * the doctor and dietitian directories never checked whether the practitioner
 * had deleted their account, so a deleted one stayed listed as "Deleted
 * citizen" with a specialty, a price and a Book button. Both lookups are now
 * findFirst scoped by `user: { deletedAt: null }` — the check is part of the
 * query rather than a line after it — which also removed their two entries
 * from this list.
 *
 * Shrunk 2026-07-29, when calls arrived and pushed the count past its budget.
 * The budget exists to force exactly this, so three medical deletes were scoped
 * rather than the ceiling raised. All three already checked ownership a line or
 * two earlier; now they say so in the query too, and a future edit that moves
 * the check cannot silently widen the delete:
 *
 *   - MedicalRecord.delete → deleteMany({ id, userId })
 *   - MedicalBloodTest.delete → deleteMany({ id, userId })
 *   - BloodAnalysis.deleteMany gained the userId beside its bloodTestId
 *
 * Changed 2026-07-29, when the v2 dataset adoption stopped deleting plans:
 *
 *   - MealPlan.deleteMany went 2 → 1. The one that left was
 *     `deleteMany({})` — every citizen's saved plans, wiped at boot. The
 *     survivor deletes one user's own same-week plans and is scoped by a
 *     preceding findMany on userId.
 *   - MealPlan.count x2 is new: the before/after totals logged by that
 *     migration, so a run that loses plans says so in the log. Counts, no rows.
 *   - MealPlan.update went 2 → 3 with markEdited, which stamps editedAt by the
 *     plan's own key. Every caller passes through assertOwnsPlan first.
 *
 * Changed 2026-07-31, when BE-21.1 retired the MealPlan model:
 *
 *   - MealPlan.deleteMany x1 → 0, MealPlan.update x3 → 0, and
 *     MealPlan.findUnique x6 → x2. The routes that reached them went first
 *     (nothing in the app had called them for some time), then the methods:
 *     generatePlan, swap, repairDay, snapshotWeek, weeks and the rest.
 *   - This list getting SHORTER is why the check fails on a decrease as well
 *     as an increase. An unscoped query that quietly disappears is usually
 *     good news and occasionally means a feature left with it, and the
 *     difference is worth one deliberate edit.
 *
 * What this scanner does NOT see, recorded so the gap is a known one:
 *
 *   - Models with no userId column are outside its reach by construction.
 *     CallSession is the live example — it belongs to a conversation, not to a
 *     citizen, so "whose row is this" is the wrong question and "who is in that
 *     chat" is the right one. That check cannot be spotted by looking at a
 *     query, so it is asserted in code (CallsService.loadAuthorised routes
 *     every read and write through ConnectionPermissionService) and proven in
 *     calls/calls.service.spec.ts, which hands a valid call id to a stranger
 *     and insists on a 403.
 *
 *   - Queries built from a variable model name are invisible to a scanner that
 *     matches on the model. privacy/account-purge.service.ts is the deliberate
 *     case: it deletes across every citizen-owned table by looking the delegate
 *     up from a string, so nothing here can see it — and it is the most
 *     dangerous file in the repo to get wrong, since a delete that lost its
 *     owner filter would empty a table for the whole city. The guarantee is
 *     asserted where it can be: privacy/account-purge.spec.ts runs a real purge
 *     and checks EVERY delete it issued carried that citizen's id, and
 *     purge-plan.spec.ts fails when a new model is left unclassified.
 *
 * Added 2026-07-30, with verification codes. Five of the seven new queries came
 * back scoped rather than listed, which is the guard doing its job: three
 * writes were updating by id alone because the row had been loaded under the
 * user's scope a few lines earlier, and saying so in the query costs nothing.
 * One of those rewrites turned out to matter for more than tidiness — putting
 * `consumedAt: null` in the WHERE made single-use a compare-and-set instead of
 * a read-then-write, so two requests racing with the same correct code now
 * produce one success and one "already used" rather than two successes.
 *
 * A fifth shape has appeared with them, and it is worth naming because it is
 * not any of the four above:
 *
 *   5. A rate limit that counts across citizens on purpose. The verification
 *      send-throttle asks "how many codes went to this address in the last
 *      hour", and the answer has to include codes sent on behalf of other
 *      accounts or the limit is trivially bypassed by signing up again. It
 *      selects a timestamp column and nothing else.
 *
 * Changed 2026-08-27, when the moderation console, the daybook, the pets book
 * and the services till were all read for the first time against this list.
 *
 * TEN QUERIES WERE SCOPED RATHER THAN LISTED. Every one of them already knew
 * the owner and simply was not saying so in the WHERE:
 *
 *   - daybook: DayItem.update/delete and DayPhoto.delete each followed a
 *     findFirst({ id, userId }) by two lines; all three are now
 *     updateMany/deleteMany({ id, userId }).
 *   - pets: Pet.delete, PetPhoto.delete and the PetPhoto.update inside
 *     makeMainPhoto's transaction, the same way.
 *   - local-services/orders: the healed-order lookup now carries the userId of
 *     the citizen whose invoice was just paid; the citizen's cancel carries
 *     theirs; and the three owner verbs (accept, reject, advance) plus
 *     forBusiness now say `listing: { ownerId }`, so a write can only land on
 *     an order taken at a business the caller owns — the check sided() makes,
 *     said in the query as well.
 *   - sided() itself is now a findFirst whose WHERE names BOTH people an order
 *     can belong to: `OR: [{ userId }, { listing: { ownerId: userId } }]`. It
 *     used to read any order by id and decide afterwards.
 *
 * AND FOUR MORE, to stay inside the budget rather than raise it — which is the
 * rule this file has followed twice before. Prescription.update x4 left the
 * list the way the three medical deletes did in July: upload(), addItem() and
 * confirm() all knew the userId already, and now put it in the WHERE.
 *
 * WHAT WAS ADDED IS ALMOST ALL ONE THING: the moderation console. Appeal and
 * DatingPhotoReview both carry a userId, but a moderator is never the owner of
 * the row they are deciding, so "scope it to the caller" has no meaning there.
 * What stands in for the owner filter is the permission, and each entry below
 * names the assert that makes it. A sixth shape, then:
 *
 *   6. A console read whose scope is a PERMISSION. `access.assert(actorId,
 *      'moderation.read')` or the `access.act` wrapper, which asserts before it
 *      runs anything and writes an audit row naming the actor and the reason.
 *      These are worth more suspicion than the other five, because the control
 *      is one line above the query rather than inside it, and moving the query
 *      moves it out of the control's reach.
 *
 * That last sentence was not hypothetical. decideAppeal() read the appeal row,
 * refused an already-decided one, and re-ran the minimum-age check on the
 * stored birth date — all THREE before `access.act` asserted anything. Any
 * signed-in citizen who guessed an appeal id learned whether it existed,
 * whether it was still open, and whether the appellant is an adult. The assert
 * is now the first line of the method. No row was returned to them and no
 * appeal could be decided, so this was an oracle rather than an IDOR, but it
 * is exactly the drift shape 6 invites.
 *
 * Two console duplications went with it: adminFunnel() counted the four queue
 * depths again, inline, a few lines from adminQueueDepths() — whose stated
 * reason for existing is that the console and the digest cannot disagree about
 * the backlog. It calls it now, which is also why DatingPhotoReview.count is
 * x2 and Appeal.count is x1 rather than x4 and x2.
 *
 * Adding to this list means a reviewer decided a query needs no owner. That is
 * sometimes right. It should never be accidental.
 */
const REVIEWED_UNSCOPED = [
  'auth/auth.service.ts  PasswordReset.update x3',
  // funnel() — event names and their counts over a window. City-wide by
  // definition: a funnel of one citizen is not a funnel. groupBy on `name`
  // with `_count`, so it returns names and numbers and no userId at all. Its
  // two callers both hold moderation.read (dating.service.ts:2683) or are the
  // daily digest, which has no current user to be scoped to.
  'analytics/analytics.service.ts  AppEvent.groupBy x1',
  // adminQueueDepths() (dating.service.ts:1970) — how many photos and appeals
  // are waiting for a human. A queue depth that counted only your own rows is
  // not a queue depth; these span citizens for the same reason the reports
  // count beside them does. Numbers, no rows: shape 4.
  'dating/dating.service.ts  Appeal.count x1',
  'dating/dating.service.ts  DatingPhotoReview.count x2',
  // The same method, and the same reason, for the queue nobody was counting
  // (launch audit, 28 Aug): profiles held in `review` — or in `pending` past
  // the one-hour grace — are people who cannot open Browse until a human
  // looks. Photos, appeals and reports were all watched and the step every
  // citizen passes through FIRST was not. Same predicate as `profileQueue`,
  // which is what stops the console and the digest disagreeing. A number, no
  // rows: shape 4, exactly as its three neighbours.
  'dating/dating.service.ts  DatingProfile.count x1',
  // appealQueue() — the moderator's queue. Scoped by PERMISSION rather than by
  // owner, and the permission is asserted on the line above the read:
  // `access.assert(adminId, 'moderation.read')` at dating.service.ts:2562.
  'dating/dating.service.ts  Appeal.findMany x1',
  // decideAppeal() — a moderator deciding somebody else's appeal, so there is
  // no owner to scope to; the appellant is in the row, not in the caller. Both
  // are behind moderation.act: the read by the assert now moved above it
  // (dating.service.ts:2603 — see the note in the header), the write by the
  // `access.act` that wraps it (dating.service.ts:2613).
  'dating/dating.service.ts  Appeal.findUnique x1',
  'dating/dating.service.ts  Appeal.update x1',
  // Two different queries, one entry. reviewRows() (:121) is keyed by the
  // photo's own review id — shape 2 — and MUST read other citizens' rows:
  // approvedOf() is what decides whether a stranger's photo may be shown to
  // you at all (dating.service.ts:307, 346, 381), and it selects key+status
  // and nothing else. queue() (:160) is the held list for the console, behind
  // `access.assert(adminId, 'moderation.read')` at dating.service.ts:2644.
  'dating/photo-moderation.service.ts  DatingPhotoReview.findMany x2',
  // decide() — the moderator's verdict on a photo that is by definition not
  // theirs, addressed by the vault key. Both callers assert moderation.act
  // first: photoDecision's `access.act` (dating.service.ts:2654) and
  // decideAppeal's (dating.service.ts:2613).
  'dating/photo-moderation.service.ts  DatingPhotoReview.update x1',
  // Minting a number, twice over — the invoice's (:393) and the order's
  // (:424). The same shape, and the same reason, as the Invoice.count in
  // commerce above: a per-owner counter would publish how many customers a
  // business has had. Uniqueness comes from the unique index and the retry
  // loop around the insert, not from this read.
  //
  // The third (:221) is the pre-verification order cap, and it counts one
  // LISTING's orders across every customer on purpose: a cap that only counted
  // your own orders would be lifted by asking a friend to place the sixth.
  // All three return a number and no row.
  'local-services/orders.service.ts  Invoice.count x1',
  'local-services/orders.service.ts  ServiceOrder.count x2',
  // Minting an invoice number. `count()` over every invoice in the city,
  // returning a number and no row — shape 4 above. It CANNOT be scoped and be
  // correct: a per-owner counter would tell anybody holding two invoices how
  // many customers that business has had, which is the reason the number is
  // city-wide. The uniqueness of the result is guaranteed by the unique index
  // on Invoice.number and the retry loop around the insert, not by this read.
  'commerce/invoices.service.ts  Invoice.count x1',
  // The verification send-throttle. These two MUST span accounts: they count
  // codes issued to one email address or from one IP, and the control they
  // implement is "nobody can bury this address in codes" — which an attacker
  // would sidestep in seconds by making a second account. Scoping them by
  // userId would leave the query passing this guard and doing nothing useful.
  //
  // Neither returns a row: both select createdAt only, feeding a count. There
  // is no citizen data in the result to leak.
  'auth/verification-code.service.ts  VerificationCode.findMany x2',
  // close() — ending a call ends it for everyone on it, which is the one write
  // here that is *meant* to touch other citizens' rows. The callId comes from a
  // session already authorised against the conversation, and the write only
  // stamps leftAt. Scoping it by userId would leave the other participants
  // marked present on a call that is over.
  'calls/calls.service.ts  CallParticipant.updateMany x1',
  'auth/token.service.ts  RefreshToken.findUnique x1',
  'auth/token.service.ts  RefreshToken.update x1',
  'auth/token.service.ts  RefreshToken.updateMany x1',
  'conversations/conversations.service.ts  ConversationMember.updateMany x1',
  // onModuleInit() — a startup alarm, not a read of anybody's data. The events
  // flow was removed (owner decision, 2 Aug) and any TicketBooking row is now a
  // charge whose owner has no screen to see it on. The question the count asks
  // is "does ANY citizen hold one of these", so scoping it to a user would be
  // scoping it to nobody: there is no caller and no current user at boot.
  // Returns a number. No row, no field, nothing to leak.
  'entertainment/entertainment.service.ts  TicketBooking.count x1',
  'jobs/jobs.service.ts  JobApplication.delete x1',
  'jobs/jobs.service.ts  JobApplication.findMany x2',
  'jobs/jobs.service.ts  JobApplication.findUnique x2',
  'jobs/jobs.service.ts  JobApplication.groupBy x1',
  'jobs/jobs.service.ts  JobApplication.update x1',
  'medical/medical.service.ts  Doctor.count x1',
  'medical/medical.service.ts  MedicalBloodTest.update x1',
  'notifications/web-push.provider.ts  DeviceToken.deleteMany x1',
  'nutrition/nutrition.service.ts  Dietitian.count x1',
  'nutrition/nutrition.service.ts  MealPlan.count x2',
  'nutrition/nutrition.service.ts  MealPlan.findFirst x1',
  'nutrition/nutrition.service.ts  MealPlan.findUnique x2',
  // onModuleInit() — the same startup alarm as TicketBooking above, TWICE, for
  // two removals that each left charged rows behind.
  //
  // The first: the quick-commerce flow was removed (B.12, 2 Aug); every
  // NutritionOrder still carrying qcJson was charged at simulated prices under
  // a real retailer's name. The NutritionOrder.update that used to sit here was
  // qcOrder writing the tracking metadata onto the row it had just created
  // inside its own transaction; it went with the flow.
  //
  // The second: the grocery ordering flow was removed (B.18, 2 Aug), which had
  // charged the city wallet and scheduled seven deliveries nothing delivered.
  //
  // Both ask the same question — "does ANY citizen hold one" — and neither has
  // a current user to scope to, because the answer is needed before anybody
  // asks. Both return a number: no row, no field, nothing to leak.
  'nutrition/nutrition.service.ts  NutritionOrder.count x2',
  'social/social.service.ts  Like.count x1',
].sort();

/**
 * Queries that deliberately span every citizen because they ARE the background
 * job — a dispatcher looking for alarms now due, a nightly sweep topping up
 * reminders. There is no "current user" in a cron; the whole point is that it
 * runs for everybody while nobody is asking.
 *
 * They are listed separately from the set above, and NOT counted against its
 * size limit, because the two need different scrutiny. A user-path query
 * missing its owner filter is a bug waiting to be found. A cron query with one
 * would simply not work. What matters here instead is that each of these is
 * genuinely reachable only from a scheduled job, and that anything it then
 * writes is addressed by an id it just read rather than one a request supplied.
 */
const BACKGROUND_JOB_QUERIES = [
  // dueReminders() — every alarm now due, across all citizens. The dispatcher.
  'prescriptions/prescriptions.service.ts  MedicineReminder.findMany x1',
  // dispatchReminder() — claims one row by id, guarded on status still being
  // pending, so two dispatchers racing produce one notification.
  'prescriptions/prescriptions.service.ts  MedicineReminder.updateMany x1',
  // extendHorizon() — every active schedule, nightly.
  'prescriptions/prescriptions.service.ts  MedicineSchedule.findMany x1',
  // expandReminders() — by a schedule id the caller just created (confirm) or
  // just read (the nightly job); never one supplied by a request.
  'prescriptions/prescriptions.service.ts  MedicineSchedule.findUnique x1',
  // markMissed() — checks whether a dose already has a log before writing one.
  'prescriptions/prescriptions.service.ts  DoseLog.findUnique x1',
].sort();

const ALL_REVIEWED = [...REVIEWED_UNSCOPED, ...BACKGROUND_JOB_QUERIES].sort();

describe('citizen-owned tables are queried by owner', () => {
  it('scans a plausible surface (guards the scanner itself)', () => {
    // Without this, a broken scanner would report zero unscoped queries and
    // every assertion below would pass while checking nothing.
    const s = stats();
    expect(s.userOwnedModels).toBeGreaterThanOrEqual(50);
    expect(s.queriesScanned).toBeGreaterThan(200);
  });

  it('has no unscoped query beyond the reviewed set', () => {
    expect(unscopedSignatures()).toEqual(ALL_REVIEWED);
  });

  it('keeps the user-path exceptions small enough to actually re-read', () => {
    // A list nobody rereads is a list that stops meaning anything. If this
    // trips, the answer is to scope queries — not to raise the number.
    //
    // Counts only the request-path exceptions. Background-job queries are
    // excluded on purpose: adding a cron should not consume the budget that
    // exists to stop user-facing queries drifting out of scope.
    const total = REVIEWED_UNSCOPED.reduce((n, e) => n + Number(e.slice(e.lastIndexOf('x') + 1)), 0);
    expect(total).toBeLessThanOrEqual(45);
  });
});

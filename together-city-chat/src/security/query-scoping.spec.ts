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
 * Adding to this list means a reviewer decided a query needs no owner. That is
 * sometimes right. It should never be accidental.
 */
const REVIEWED_UNSCOPED = [
  'auth/auth.service.ts  PasswordReset.update x3',
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
  'nutrition/nutrition.service.ts  MealPlan.deleteMany x1',
  'nutrition/nutrition.service.ts  MealPlan.findFirst x1',
  'nutrition/nutrition.service.ts  MealPlan.findUnique x6',
  'nutrition/nutrition.service.ts  MealPlan.update x3',
  'nutrition/nutrition.service.ts  NutritionOrder.update x1',
  // upload(), addItem() and confirm() write by an id either created in the same
  // call or read a line earlier via findFirst({ id, userId }). Request-path, so
  // it counts against the size budget below — unlike the cron queries.
  'prescriptions/prescriptions.service.ts  Prescription.update x4',
  'restaurants/restaurants.service.ts  DiningOrder.groupBy x1',
  'restaurants/restaurants.service.ts  Reservation.groupBy x1',
  'social/social.service.ts  Like.count x1',
  'social/social.service.ts  Like.delete x1',
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

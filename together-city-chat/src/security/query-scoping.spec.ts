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
 * Adding to this list means a reviewer decided a query needs no owner. That is
 * sometimes right. It should never be accidental.
 */
const REVIEWED_UNSCOPED = [
  'auth/auth.service.ts  PasswordReset.update x3',
  'auth/token.service.ts  RefreshToken.findUnique x1',
  'auth/token.service.ts  RefreshToken.update x1',
  'auth/token.service.ts  RefreshToken.updateMany x1',
  'conversations/conversations.service.ts  ConversationMember.updateMany x1',
  'jobs/jobs.service.ts  JobApplication.delete x1',
  'jobs/jobs.service.ts  JobApplication.findMany x2',
  'jobs/jobs.service.ts  JobApplication.findUnique x2',
  'jobs/jobs.service.ts  JobApplication.groupBy x1',
  'jobs/jobs.service.ts  JobApplication.update x1',
  'medical/medical.service.ts  BloodAnalysis.deleteMany x1',
  'medical/medical.service.ts  Doctor.count x1',
  'medical/medical.service.ts  Doctor.findUnique x1',
  'medical/medical.service.ts  MedicalBloodTest.delete x1',
  'medical/medical.service.ts  MedicalBloodTest.update x1',
  'medical/medical.service.ts  MedicalRecord.delete x1',
  'notifications/web-push.provider.ts  DeviceToken.deleteMany x1',
  'nutrition/nutrition.service.ts  Dietitian.count x1',
  'nutrition/nutrition.service.ts  Dietitian.findUnique x1',
  'nutrition/nutrition.service.ts  MealPlan.count x2',
  'nutrition/nutrition.service.ts  MealPlan.deleteMany x1',
  'nutrition/nutrition.service.ts  MealPlan.findFirst x1',
  'nutrition/nutrition.service.ts  MealPlan.findUnique x6',
  'nutrition/nutrition.service.ts  MealPlan.update x3',
  'nutrition/nutrition.service.ts  NutritionOrder.update x1',
  'restaurants/restaurants.service.ts  DiningOrder.groupBy x1',
  'restaurants/restaurants.service.ts  Reservation.groupBy x1',
  'social/social.service.ts  Like.count x1',
  'social/social.service.ts  Like.delete x1',
].sort();

describe('citizen-owned tables are queried by owner', () => {
  it('scans a plausible surface (guards the scanner itself)', () => {
    // Without this, a broken scanner would report zero unscoped queries and
    // every assertion below would pass while checking nothing.
    const s = stats();
    expect(s.userOwnedModels).toBeGreaterThanOrEqual(50);
    expect(s.queriesScanned).toBeGreaterThan(200);
  });

  it('has no unscoped query beyond the reviewed set', () => {
    expect(unscopedSignatures()).toEqual(REVIEWED_UNSCOPED);
  });

  it('keeps the reviewed set small enough to actually re-read', () => {
    // A list nobody rereads is a list that stops meaning anything. If this
    // trips, the answer is to scope queries — not to raise the number.
    const total = REVIEWED_UNSCOPED.reduce((n, e) => n + Number(e.slice(e.lastIndexOf('x') + 1)), 0);
    expect(total).toBeLessThanOrEqual(45);
  });
});

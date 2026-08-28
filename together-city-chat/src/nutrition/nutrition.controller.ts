import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards, UsePipes,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { NutritionService } from './nutrition.service';
import { Deprecated } from '../shared/deprecated.decorator';
import {
  AddToCartSchema, type AddToCartDto,
  BloodInputSchema, type BloodInputDto,
  type Diet, FoodPrefSchema, type FoodPrefDto,
  type PlanMode,
  CalorieSchema, type CalorieDto,
} from './dto/nutrition.dto';
import { OwnRecipeSchema, type OwnRecipeDto } from './dto/own-recipe.dto';

import { Mira } from '../mira/mira.decorator';
import { Throttle } from '@nestjs/throttler';
import { MODEL_LIMIT } from '../shared/throttles';
/**
 * Household PHI-sharing switches — exactly the four the service stores
 * (HouseholdSharing in nutrition.service.ts). This endpoint decides which of a
 * citizen's health facts their household can see, and it used to accept an
 * untyped Record<string, boolean> straight from the request: any key, any
 * value. Keys are listed rather than open so a toggle nobody declared can't be
 * set, and .strict() rejects unknown ones loudly instead of storing them.
 */
const HouseholdSharingSchema = z.object({
  targets: z.boolean().optional(),
  conditions: z.boolean().optional(),
  weight: z.boolean().optional(),
  bloodTests: z.boolean().optional(),
}).strict();

/**
 * Editable fields on a household member, matching memberData() in the service.
 * Previously Record<string, unknown>. The service already clamps the numbers,
 * so this is about refusing junk at the door rather than re-implementing that.
 */
const FamilyMemberPatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  role: z.string().max(20).optional(),
  // Left as bounded strings rather than enums: memberData() already
  // normalises both (anything not 'female' becomes 'male'; an unknown goal
  // becomes 'maintain'), so an enum here would only turn a future UI option
  // into a 422 without making the stored value any safer.
  sex: z.string().max(20).optional(),
  age: z.number().min(1).max(110).optional(),
  heightCm: z.number().min(60).max(230).optional(),
  weightKg: z.number().min(8).max(250).optional(),
  activity: z.number().min(1.2).max(1.9).optional(),
  goal: z.string().max(20).optional(),
  diet: z.string().max(40).optional(),
  proteins: z.array(z.string().max(40)).max(30).optional(),
  cuisines: z.array(z.string().max(40)).max(30).optional(),
  allergies: z.string().max(500).optional(),
  healthConditions: z.array(z.string().max(60)).max(30).optional(),
}).strict();

@Controller('nutrition')
@UseGuards(JwtAuthGuard)
export class NutritionController {
  constructor(private readonly nutrition: NutritionService) {}

  @Mira({
    intent: 'Tell the citizen their calorie and macro targets',
    utterances: ['my calorie target', 'how many calories', 'my macros', 'how much protein', 'my nutrition targets'],
    risk: 'R0',
  })
  @Get('targets')
  targets(@CurrentUser() user: JwtUser) {
    return this.nutrition.targets(user.sub);
  }

  /** Personalized Nutrition Advice — dietary-balance advisories (informational, never blocking). */
  @Get('advice')
  advice(@CurrentUser() user: JwtUser) {
    return this.nutrition.advisories(user.sub);
  }

  /** Backend-assigned diet plans (read-only; decided from the profile). */
  @Get('diet-plans')
  dietPlans(@CurrentUser() user: JwtUser) {
    return this.nutrition.dietPlans(user.sub);
  }

  /** Nutrition QA audit report — ingredient-derived validation of the recipe library. */
  @Get('qa/report')
  qaReport() {
    return this.nutrition.qaReportView();
  }

  /** Medical Nutrition Recommendations — condition guidelines vs the user's preferences. */
  @Get('medical-recs')
  medicalRecs(@CurrentUser() user: JwtUser) {
    return this.nutrition.medicalRecs(user.sub);
  }

  @Post('medical-recs/decide')
  @UsePipes(new ZodValidationPipe(z.object({
    condition: z.string().min(1).max(40),
    choice: z.enum(['apply', 'keep']),
  })))
  decideMedicalRec(@CurrentUser() user: JwtUser, @Body() dto: { condition: string; choice: 'apply' | 'keep' }) {
    return this.nutrition.decideMedicalRec(user.sub, dto.condition, dto.choice);
  }

  @Get('preferences')
  prefs(@CurrentUser() user: JwtUser) {
    return this.nutrition.foodPref(user.sub);
  }

  @Patch('preferences')
  @UsePipes(new ZodValidationPipe(FoodPrefSchema))
  updatePrefs(@CurrentUser() user: JwtUser, @Body() dto: FoodPrefDto) {
    return this.nutrition.upsertFoodPref(user.sub, dto);
  }

  /** Preferred daily delivery time for fresh items ("HH:MM", 24h). */
  @Patch('delivery-time')
  @UsePipes(new ZodValidationPipe(z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24-hour') })))
  setDeliveryTime(@CurrentUser() user: JwtUser, @Body() body: { time?: string }) {
    return this.nutrition.setDeliveryTime(user.sub, String(body?.time ?? ''));
  }

  // ── Composite meal engine (Meal-Planning-Engine-Spec) ──
  /**
   * `scope=household` composes the plan the household actually cooks: the same
   * dishes, but with every member's allergies, exclusions and conditions applied.
   * It is the plan the family grocery list already shops from, so asking for it
   * here is what lets the family planner show the food the basket buys.
   * Anything else composes the citizen's own plan, unchanged.
   */
  @Get('plan/composed')
  composed(@CurrentUser() user: JwtUser, @Query('mode') mode?: string, @Query('scope') scope?: string) {
    return this.nutrition.composedPlan(
      user.sub,
      mode === 'optimal' ? 'optimal' : 'preferred',
      { household: scope === 'household' },
    );
  }

  /**
   * The question the kitchen is actually asked. `plan/composed` has always been
   * able to answer it; it was never a capability, so Mira could not.
   */
  @Mira({
    intent: "Name the meals on the citizen's plan for today",
    utterances: [
      'what am I eating', 'what am I eating today', 'what can I eat today',
      'tell me a meal I can eat today', 'suggest a meal', 'what should I eat',
      'whats for dinner', 'what should I cook', 'my meal plan', 'my meal plan today',
      'todays meals', 'my nutrition today', 'whats my nutrition', 'what is on my plan today',
      'khana kya hai', 'aaj kya khana hai',
      // NAMED MEALS REACHED NOTHING. "what should I have for breakfast
      // tomorrow" clarified rather than answering — the plan is exactly what
      // that question wants, and `daypart.ts` is what stops the clock
      // overriding the word they used.
      'what should I have for breakfast', 'what is for lunch',
      'what should I eat for dinner', 'whats for breakfast', 'whats for lunch',
    ],
    risk: 'R0',
  })
  @Get('plan/today')
  planToday(@CurrentUser() user: JwtUser) {
    return this.nutrition.planToday(user.sub);
  }

  @Get('meal-settings')
  mealSettings(@CurrentUser() user: JwtUser) {
    return this.nutrition.mealSettings(user.sub);
  }

  // Composite planner per-meal actions: Refresh (re-pick one meal) + Skip (drop
  // one meal, rebalance the day, update totals + grocery).
  @Post('plan/composed/refresh')
  @UsePipes(new ZodValidationPipe(z.object({ day: z.number().int().min(0).max(6), slot: z.string().min(1).max(3) })))
  refreshComposedMeal(@CurrentUser() user: JwtUser, @Body() dto: { day: number; slot: string }) {
    return this.nutrition.refreshComposedMeal(user.sub, dto.day, dto.slot);
  }

  /** GET /api/nutrition/targets/history — the targets that were in force, by day. */
  @Get('targets/history')
  targetHistory(@CurrentUser() user: JwtUser, @Query('days') days?: string) {
    const n = Number(days);
    return this.nutrition.targetHistory(user.sub, Number.isFinite(n) && n > 0 ? Math.floor(n) : 30);
  }

  @Post('plan/composed/skip')
  @UsePipes(new ZodValidationPipe(z.object({ day: z.number().int().min(0).max(6), slot: z.string().min(1).max(3), skipped: z.boolean() })))
  skipComposedMeal(@CurrentUser() user: JwtUser, @Body() dto: { day: number; slot: string; skipped: boolean }) {
    return this.nutrition.skipComposedMeal(user.sub, dto.day, dto.slot, dto.skipped);
  }

  // Per-line (single-dish) actions: Refresh one dish (reroll its role, like-for-like)
  // + Skip one dish (drop that role, rescale the plate).
  @Post('plan/composed/refresh-item')
  @UsePipes(new ZodValidationPipe(z.object({ day: z.number().int().min(0).max(6), slot: z.string().min(1).max(3), role: z.string().min(1).max(20) })))
  refreshComposedComponent(@CurrentUser() user: JwtUser, @Body() dto: { day: number; slot: string; role: string }) {
    return this.nutrition.refreshComposedComponent(user.sub, dto.day, dto.slot, dto.role);
  }

  @Post('plan/composed/skip-item')
  @UsePipes(new ZodValidationPipe(z.object({ day: z.number().int().min(0).max(6), slot: z.string().min(1).max(3), role: z.string().min(1).max(20), skipped: z.boolean() })))
  skipComposedComponent(@CurrentUser() user: JwtUser, @Body() dto: { day: number; slot: string; role: string; skipped: boolean }) {
    return this.nutrition.skipComposedComponent(user.sub, dto.day, dto.slot, dto.role, dto.skipped);
  }

  // Start a fresh 3-week plan (re-anchor to today, reseed, clear overrides).
  /** Choose the dish for a slot yourself — the "build your own plan" door on
   *  the plan the app actually renders. Allergens refuse; a diet mismatch is
   *  stored and warned about. */
  @Post('plan/composed/pin')
  @UsePipes(new ZodValidationPipe(z.object({
    day: z.number().int().min(0).max(60),
    slot: z.enum(['b', 'l', 's', 'd', 'es']),
    recipeId: z.string().min(1).max(120),
  })))
  pinComposed(@CurrentUser() user: JwtUser, @Body() dto: { day: number; slot: string; recipeId: string }) {
    return this.nutrition.pinComposedMeal(user.sub, dto.day, dto.slot, dto.recipeId);
  }

  /**
   * Lock a day. Its meals stop moving, and its shopping joins the grocery list
   * — the moment a plan becomes a shopping trip.
   */
  /* ── the day a citizen builds themselves ─────────────────────────────────
     "Create Your Own Meal Plan" used to add dishes to a grocery CART: you chose
     food and got a shopping list, never a plan. These four build the plan. */

  /** GET /api/nutrition/plan/own — every day they have filled, and the day the
   *  next dish will join. */
  @Get('plan/own')
  ownPlan(@CurrentUser() user: JwtUser) {
    return this.nutrition.ownPlan(user.sub);
  }

  /** POST /api/nutrition/plan/own/add — put a dish on the day being built. The
   *  day is decided by the server, not the caller: it is the first unlocked day
   *  from today, and letting a client name it would let two tabs disagree. */
  @Post('plan/own/add')
  @UsePipes(new ZodValidationPipe(z.object({ recipeId: z.string().min(1).max(120) })))
  addToOwnPlan(@CurrentUser() user: JwtUser, @Body() dto: { recipeId: string }) {
    return this.nutrition.addToOwnPlan(user.sub, dto.recipeId);
  }

  /** POST /api/nutrition/plan/own/remove — take a dish back off an unsettled day. */
  @Post('plan/own/remove')
  @UsePipes(new ZodValidationPipe(z.object({
    day: z.number().int().min(0).max(60),
    recipeId: z.string().min(1).max(120),
  })))
  removeFromOwnPlan(@CurrentUser() user: JwtUser, @Body() dto: { day: number; recipeId: string }) {
    return this.nutrition.removeFromOwnPlan(user.sub, dto.day, dto.recipeId);
  }

  /** POST /api/nutrition/plan/own/lock — settle a built day. Its ingredients
   *  join the grocery list and the next dish starts the following day. */
  @Post('plan/own/lock')
  @UsePipes(new ZodValidationPipe(z.object({ day: z.number().int().min(0).max(60) })))
  lockOwnDay(@CurrentUser() user: JwtUser, @Body() dto: { day: number }) {
    return this.nutrition.lockOwnDay(user.sub, dto.day);
  }

  /** POST /api/nutrition/plan/own/unlock — take a settled day back. */
  @Post('plan/own/unlock')
  @UsePipes(new ZodValidationPipe(z.object({ day: z.number().int().min(0).max(60) })))
  unlockOwnDay(@CurrentUser() user: JwtUser, @Body() dto: { day: number }) {
    return this.nutrition.unlockOwnDay(user.sub, dto.day);
  }

  @Post('plan/composed/lock')
  @UsePipes(new ZodValidationPipe(z.object({
    day: z.number().int().min(0).max(60),
    mode: z.enum(['individual', 'family']).optional(),
    // Which plan model was SHOWING when the citizen pressed lock — the menu
    // they read and accepted. The basket shops that menu for this day.
    planMode: z.enum(['preferred', 'optimal']).optional(),
  })))
  lockComposedDay(@CurrentUser() user: JwtUser, @Body() dto: { day: number; mode?: 'individual' | 'family'; planMode?: 'preferred' | 'optimal' }) {
    return this.nutrition.lockComposedDay(user.sub, dto.day, dto.mode ?? 'individual', dto.planMode ?? 'preferred');
  }

  @Post('plan/composed/unlock')
  @UsePipes(new ZodValidationPipe(z.object({ day: z.number().int().min(0).max(60) })))
  unlockComposedDay(@CurrentUser() user: JwtUser, @Body() dto: { day: number }) {
    return this.nutrition.unlockComposedDay(user.sub, dto.day);
  }

  @Post('plan/composed/unpin')
  @UsePipes(new ZodValidationPipe(z.object({
    day: z.number().int().min(0).max(60),
    slot: z.enum(['b', 'l', 's', 'd', 'es']),
  })))
  unpinComposed(@CurrentUser() user: JwtUser, @Body() dto: { day: number; slot: string }) {
    return this.nutrition.unpinComposedMeal(user.sub, dto.day, dto.slot);
  }

  @Post('plan/composed/renew')
  renewComposedPlan(@CurrentUser() user: JwtUser) {
    return this.nutrition.renewComposedPlan(user.sub);
  }

  @Post('plan/composed/restore')
  restoreComposedSkips(@CurrentUser() user: JwtUser) {
    return this.nutrition.restoreComposedSkips(user.sub);
  }

  // Recipe Library — searchable/paginated recipe database (Netflix-style).
  @Get('recipes/library')
  recipeLibrary(@CurrentUser() user: JwtUser, @Query() q: Record<string, string>) {
    return this.nutrition.recipeLibrary({
      // The library shows the world corpus plus this citizen's own dishes.
      userId: user.sub,
      search: q.search, cuisine: q.cuisine, mealType: q.mealType, diet: q.diet, sort: q.sort,
      // "I have paneer and spinach" — every named ingredient must be present,
      // which is a different question from the single free-text search above.
      ingredients: (q.ingredients ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8),
      page: q.page ? parseInt(q.page, 10) : 1, pageSize: q.pageSize ? parseInt(q.pageSize, 10) : 24,
    });
  }

  @Patch('meal-settings')
  @UsePipes(new ZodValidationPipe(z.object({
    cuisineBySlot: z.record(z.string(), z.record(z.string(), z.number())).optional(),
    cuisineLocks: z.record(z.string(), z.boolean()).optional(),
    fasting: z.object({
      enabled: z.boolean().optional(),
      protocol: z.string().optional(),
      window: z.object({ start: z.string(), end: z.string() }).optional(),
      mealTimes: z.record(z.string(), z.string()).optional(),
    }).optional(),
    includePantry: z.boolean().optional(),
  })))
  updateMealSettings(@CurrentUser() user: JwtUser, @Body() dto: Record<string, unknown>) {
    return this.nutrition.setMealSettings(user.sub, dto);
  }

  // Nutrition history (spec §19) — permanent, versioned weekly plan record.
  // Specific 'history' path declared before the parameterised 'plan/:key' routes.
  // Behind a removed tab: the Nutrition History tab was removed by the review (p26).
  @Deprecated({
    since: '2026-07-30', sunset: '2026-08-30',
    replacement: '/api/nutrition/plan',
  })
  @Get('history')
  history(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode) {
    return this.nutrition.nutritionHistory(user.sub, mode);
  }

  // Household members (Nutrition Hub only) — real invited users + the owner.
  @Get('family/members')
  familyMembers(@CurrentUser() user: JwtUser) {
    return this.nutrition.familyMembers(user.sub);
  }

  // Find a citizen to invite, by @username. Username only — see the service.
  @Get('family/search')
  searchHouseholdUser(@CurrentUser() user: JwtUser, @Query('q') q: string) {
    return this.nutrition.searchHouseholdUser(user.sub, q ?? '');
  }

  // Send a Household invite (owner only) — private to Nutrition Hub.
  @Post('family/invite')
  @UsePipes(new ZodValidationPipe(z.object({ userRef: z.string().min(1).max(80), role: z.string().max(40).optional() })))
  inviteHousehold(@CurrentUser() user: JwtUser, @Body() dto: { userRef?: string; role?: string }) {
    return this.nutrition.inviteHousehold(user.sub, dto?.userRef ?? '', dto?.role);
  }

  // Invitations awaiting THIS user's response (in-app notifications).
  @Get('family/invites')
  householdInvites(@CurrentUser() user: JwtUser) {
    return this.nutrition.householdInvites(user.sub);
  }

  // Accept / decline a household invitation (invitee only).
  @Post('family/invites/:id/respond')
  @UsePipes(new ZodValidationPipe(z.object({ accept: z.boolean() })))
  respondHouseholdInvite(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: { accept?: boolean }) {
    return this.nutrition.respondHouseholdInvite(user.sub, id, Boolean(dto?.accept));
  }

  // Edit a member profile (the owner's own; real members edit their own).
  @Patch('family/members/:id')
  @UsePipes(new ZodValidationPipe(FamilyMemberPatchSchema))
  updateFamilyMember(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.nutrition.updateFamilyMember(user.sub, id, dto);
  }

  // Remove a member — ends the Household Connection (never a social one).
  @Delete('family/members/:id')
  removeFamilyMember(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.removeFamilyMember(user.sub, id);
  }

  // Per-member portions for a day of the shared family plan (Family Stage 2).
  @Get('family/portions/:idx')
  familyPortions(@CurrentUser() user: JwtUser, @Param('idx', ParseIntPipe) idx: number) {
    return this.nutrition.familyPortions(user.sub, idx);
  }

  // Combined family grocery list — merges every member's portions + swaps (Stage 4).
  @Post('family/cart')
  buildFamilyCart(@CurrentUser() user: JwtUser) {
    return this.nutrition.buildFamilyCart(user.sub);
  }

  // Family dashboard — per-member nutrition validation + roll-up (Stage 5).
  @Get('family/dashboard')
  familyDashboard(@CurrentUser() user: JwtUser) {
    return this.nutrition.familyDashboard(user.sub, 0);
  }

  // Family Profile — household aggregate (counts, diets, conditions, summary).
  @Get('family/profile')
  familyProfile(@CurrentUser() user: JwtUser) {
    return this.nutrition.familyProfile(user.sub, 0);
  }

  // Family Health command centre (Medical Hub → Family Profiles) — permission-gated.
  @Get('family/health')
  familyHealth(@CurrentUser() user: JwtUser) {
    return this.nutrition.familyHealth(user.sub);
  }

  // Family Meal Planning mode — the household setting (owner) + this user's
  // planner context (owner/member/solo + whether the shared plan is active).
  @Get('family/meal-planning')
  async familyMealPlanning(@CurrentUser() user: JwtUser) {
    const ctx = await this.nutrition.familyContext(user.sub);
    return ctx;
  }

  @Patch('family/meal-planning')
  @UsePipes(new ZodValidationPipe(z.object({ on: z.boolean() })))
  setFamilyMealPlanning(@CurrentUser() user: JwtUser, @Body() dto: { on?: boolean }) {
    return this.nutrition.setFamilyMealPlanning(user.sub, Boolean(dto?.on));
  }

  // Privacy — what I share with households I belong to (medical private by default).
  @Get('family/sharing')
  getSharing(@CurrentUser() user: JwtUser) {
    return this.nutrition.getHouseholdSharing(user.sub);
  }

  @Patch('family/sharing')
  @UsePipes(new ZodValidationPipe(HouseholdSharingSchema))
  setSharing(@CurrentUser() user: JwtUser, @Body() dto: Record<string, boolean>) {
    return this.nutrition.setHouseholdSharing(user.sub, dto);
  }

  // Shared pantry (one per household) — grouped by aisle.
  @Get('family/pantry')
  pantry(@CurrentUser() user: JwtUser) {
    return this.nutrition.pantryList(user.sub);
  }

  @Post('family/pantry')
  @UsePipes(new ZodValidationPipe(z.object({ name: z.string().min(1).max(80), grams: z.number().int().min(0).max(1_000_000).optional() })))
  addPantry(@CurrentUser() user: JwtUser, @Body() dto: { name?: string; grams?: number }) {
    return this.nutrition.addPantryItem(user.sub, dto?.name ?? '', dto?.grams);
  }

  /** Cooking a meal draws its ingredients down from the pantry (idempotent). */
  @Post('pantry/cooked')
  @UsePipes(new ZodValidationPipe(z.object({ mealKey: z.string().min(1).max(64), label: z.string().max(140).optional(), people: z.number().int().min(1).max(30).optional() })))
  markCooked(@CurrentUser() user: JwtUser, @Body() body: { mealKey?: string; label?: string; people?: number }) {
    return this.nutrition.markMealCooked(user.sub, {
      mealKey: String(body?.mealKey ?? ''),
      label: body?.label ? String(body.label) : undefined,
      people: Number(body?.people) || 1,
    });
  }

  /** Advance-prep alerts: what must be started early (soak/ferment/marinate). */
  /* "what my nutrition today" reached the ASTROLOGY day brief in production
     (the router's substring bug did half of it; these utterances not
     existing did the rest). "Nutrition today" and "meal plan" are how
     citizens actually ask for today's food, so the kitchen now owns the
     words. */
  /*
     THE WORDS GO BACK TO THE HANDLER THAT CAN ANSWER THEM. This decorator
     used to own 'what am I eating', 'my meal plan', 'whats for dinner' and
     'todays meals' — none of which this route answers. It reports soak,
     ferment and marinate deadlines, and its empty state is "Nothing needs
     starting yet", which is the sentence two different meal questions came
     back with in production. Prep keeps the prep words. `plan/today`
     owns the meal words, and answers them.
  */
  @Mira({
    intent: 'Say what the citizen needs to start early — soaking, marinating, fermenting',
    utterances: ['anything to prep', 'do I need to start cooking', 'anything to soak', 'anything to marinate', 'what needs soaking', 'do I need to start anything now', 'any prep for tomorrow'],
    risk: 'R0',
  })
  @Get('prep-alerts')
  prepAlerts(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode) {
    return this.nutrition.prepAlerts(user.sub, mode ?? 'individual');
  }

  /** Force an end-of-day settlement pass (normally automatic on pantry read). */
  @Post('pantry/settle')
  settlePantry(@CurrentUser() user: JwtUser) {
    return this.nutrition.settleElapsedDays(user.sub);
  }

  /** Recent pantry draw-downs. */
  @Get('pantry/history')
  pantryHistory(@CurrentUser() user: JwtUser) {
    return this.nutrition.pantryHistory(user.sub);
  }

  @Post('family/pantry/stock')
  stockPantry(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode) {
    return this.nutrition.stockPantryFromGrocery(user.sub, mode ?? 'family');
  }

  @Patch('family/pantry/:id')
  @UsePipes(new ZodValidationPipe(z.object({ grams: z.number().int().min(0).max(1_000_000) })))
  updatePantry(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: { grams?: number }) {
    return this.nutrition.updatePantryItem(user.sub, id, Number(dto?.grams ?? 0));
  }

  @Delete('family/pantry/:id')
  removePantry(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.removePantryItem(user.sub, id);
  }

  // Supermarket-style grocery list (Grocery Planner redesign). mode: individual|family.
  /** POST /api/nutrition/grocery/check — tick or untick one line, and mean it. */
  @Post('grocery/check')
  @UsePipes(new ZodValidationPipe(z.object({ key: z.string().min(1).max(120), checked: z.boolean() })))
  groceryCheck(@CurrentUser() user: JwtUser, @Body() dto: { key: string; checked: boolean }) {
    return this.nutrition.setGroceryChecked(user.sub, dto.key, dto.checked);
  }

  /** POST /api/nutrition/grocery/item — add something the plan does not know about. */
  @Post('grocery/item')
  @UsePipes(new ZodValidationPipe(z.object({ label: z.string().min(1).max(80) })))
  groceryAdd(@CurrentUser() user: JwtUser, @Body() dto: { label: string }) {
    return this.nutrition.addGroceryItem(user.sub, dto.label);
  }

  /** POST /api/nutrition/grocery/clear-checked — done shopping. */
  @Post('grocery/clear-checked')
  groceryClearChecked(@CurrentUser() user: JwtUser) {
    return this.nutrition.clearCheckedGrocery(user.sub);
  }

  @Get('grocery/plan')
  groceryPlan(
    @CurrentUser() user: JwtUser,
    @Query('mode') mode?: PlanMode,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('people') people?: string,
  ) {
    // days: 1 | 2 | 5 | 7 (any 1–28); startDate: YYYY-MM-DD, today or later.
    // people: how many the individual list cooks for (1–12; service clamps).
    const n = Number(days);
    const p = Number(people);
    return this.nutrition.groceryPlan(user.sub, mode ?? 'individual', Number.isFinite(n) && n > 0 ? n : 7, startDate, Number.isFinite(p) && p > 0 ? p : undefined);
  }

  @Get('history/:id')
  historyDetail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.nutritionHistoryDetail(user.sub, id);
  }

  // ─── My Health Profile calorie log (persists per day) ───
  @Get('health/log')
  healthLog(@CurrentUser() user: JwtUser, @Query('dates') dates?: string) {
    return this.nutrition.healthLog(user.sub, (dates ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  }

  @Post('health/log')
  @UsePipes(new ZodValidationPipe(CalorieSchema))
  addCalorie(@CurrentUser() user: JwtUser, @Body() dto: CalorieDto) {
    return this.nutrition.addCalorie(user.sub, dto);
  }

  @Delete('health/log/:id')
  removeCalorie(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.removeCalorie(user.sub, id);
  }

  @Get('recipes')
  recipes(@CurrentUser() user: JwtUser, @Query('diet') diet?: Diet) {
    return this.nutrition.recipes(diet, user.sub);
  }

  // ── a citizen's own recipes ──────────────────────────────────────────
  // Declared before `recipes/:id` so "own" is never read as an id.

  @Get('recipes/own')
  myRecipes(@CurrentUser() user: JwtUser) {
    return this.nutrition.myRecipes(user.sub);
  }

  @Post('recipes/own')
  @UsePipes(new ZodValidationPipe(OwnRecipeSchema))
  createOwnRecipe(@CurrentUser() user: JwtUser, @Body() dto: OwnRecipeDto) {
    return this.nutrition.createOwnRecipe(user.sub, dto);
  }

  @Patch('recipes/own/:id')
  @UsePipes(new ZodValidationPipe(OwnRecipeSchema))
  updateOwnRecipe(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: OwnRecipeDto) {
    return this.nutrition.updateOwnRecipe(user.sub, id, dto);
  }

  @Delete('recipes/own/:id')
  deleteOwnRecipe(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.deleteOwnRecipe(user.sub, id);
  }

  // GET /api/nutrition/recipes/search?ingredients=paneer,spinach&diet=veg
  @Get('recipes/search')
  searchRecipes(@CurrentUser() user: JwtUser, @Query('ingredients') ingredients?: string, @Query('diet') diet?: Diet) {
    const terms = (ingredients ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.nutrition.searchByIngredients(user.sub, terms, diet);
  }

  // GET /api/nutrition/saved — the user's saved/favourited recipes (cards).
  @Get('saved')
  savedRecipes(@CurrentUser() user: JwtUser) {
    return this.nutrition.savedRecipes(user.sub);
  }

  // GET /api/nutrition/recipes/:id/variants?type=higher_protein — real alternatives.
  @Get('recipes/:id/variants')
  recipeVariants(@Param('id') id: string, @Query('type') type = 'similar') {
    return this.nutrition.recipeVariants(id, type);
  }

  @Get('recipes/:id')
  @Throttle(MODEL_LIMIT)
  recipe(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.recipe(id, user.sub);
  }

  // POST /api/nutrition/recipes/:id/save — toggle a favourite.
  @Post('recipes/:id/save')
  @UsePipes(new ZodValidationPipe(z.object({ saved: z.boolean() })))
  saveRecipe(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: { saved: boolean }) {
    return this.nutrition.setSavedRecipe(user.sub, id, body.saved);
  }

  @Get('cart')
  cart(@CurrentUser() user: JwtUser) {
    return this.nutrition.getCart(user.sub);
  }

  @Get('wallet')
  wallet(@CurrentUser() user: JwtUser) {
    return this.nutrition.wallet(user.sub);
  }

  @Get('blood')
  blood(@CurrentUser() user: JwtUser) {
    return this.nutrition.bloodPanel(user.sub);
  }

  @Post('blood')
  @UsePipes(new ZodValidationPipe(BloodInputSchema))
  saveBlood(@CurrentUser() user: JwtUser, @Body() dto: BloodInputDto) {
    return this.nutrition.saveBlood(user.sub, dto);
  }

  // Behind a removed tab: supplements moved to the Fitness hub (p14).
  @Deprecated({
    since: '2026-07-30', sunset: '2026-08-30',
    replacement: '/api/fitness/supplements',
  })
  @Get('supplements')
  supplements(@CurrentUser() user: JwtUser) {
    return this.nutrition.supplements(user.sub);
  }

  // Behind a removed tab: Expert Care was removed; consults are booked with a clinician (p26).
  @Deprecated({
    since: '2026-07-30', sunset: '2026-08-30',
    replacement: '/api/medical/consults',
  })
  @Get('dietitians')
  dietitians() {
    return this.nutrition.dietitians();
  }

  // Behind a removed tab: Expert Care was removed; consults are booked with a clinician (p26).
  @Deprecated({
    since: '2026-07-30', sunset: '2026-08-30',
    replacement: '/api/medical/consults',
  })
  @Post('dietitians/:id/book')
  book(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.bookDietitian(user.sub, id);
  }

  @Post('cart')
  @UsePipes(new ZodValidationPipe(AddToCartSchema))
  addToCart(@CurrentUser() user: JwtUser, @Body() dto: AddToCartDto) {
    return this.nutrition.buildCart(user.sub, { planKey: dto.planKey, recipeIds: dto.recipeIds, people: dto.people, mode: dto.mode });
  }
}

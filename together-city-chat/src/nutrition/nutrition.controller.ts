import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards, UsePipes,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { NutritionService } from './nutrition.service';
import {
  AddToCartSchema, type AddToCartDto,
  BloodInputSchema, type BloodInputDto,
  type Diet, FoodPrefSchema, type FoodPrefDto,
  type PlanMode, RegenerateSchema, type RegenerateDto,
  SidesSchema, type SidesDto, type Slot, SwapSchema, type SwapDto,
  SkipSchema, type SkipDto, CalorieSchema, type CalorieDto,
} from './dto/nutrition.dto';

@Controller('nutrition')
@UseGuards(JwtAuthGuard)
export class NutritionController {
  constructor(private readonly nutrition: NutritionService) {}

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

  // ── Composite meal engine (Meal-Planning-Engine-Spec) ──
  @Get('plan/composed')
  composed(@CurrentUser() user: JwtUser, @Query('mode') mode?: string) {
    return this.nutrition.composedPlan(user.sub, mode === 'optimal' ? 'optimal' : 'preferred');
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

  @Post('plan/composed/skip')
  @UsePipes(new ZodValidationPipe(z.object({ day: z.number().int().min(0).max(6), slot: z.string().min(1).max(3), skipped: z.boolean() })))
  skipComposedMeal(@CurrentUser() user: JwtUser, @Body() dto: { day: number; slot: string; skipped: boolean }) {
    return this.nutrition.skipComposedMeal(user.sub, dto.day, dto.slot, dto.skipped);
  }

  @Post('plan/composed/restore')
  restoreComposedSkips(@CurrentUser() user: JwtUser) {
    return this.nutrition.restoreComposedSkips(user.sub);
  }

  // Recipe Library — searchable/paginated recipe database (Netflix-style).
  @Get('recipes/library')
  recipeLibrary(@Query() q: Record<string, string>) {
    return this.nutrition.recipeLibrary({
      search: q.search, cuisine: q.cuisine, mealType: q.mealType, diet: q.diet, sort: q.sort,
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

  // Specific plan routes first, then parameterised ones.
  @Get('plan/weekly')
  weekly(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode, @Query('readOnly') readOnly?: string) {
    // readOnly=1 → Daily Meal Planner view: return the saved plan, never generate.
    return this.nutrition.weeklyPlan(user.sub, mode ?? 'individual', readOnly === '1' || readOnly === 'true');
  }

  @Post('plan/weekly/regenerate')
  @UsePipes(new ZodValidationPipe(RegenerateSchema))
  regenerate(@CurrentUser() user: JwtUser, @Body() dto: RegenerateDto) {
    return this.nutrition.regenerate(user.sub, dto.mode ?? 'individual');
  }

  // Every saved week (the calendar/timeline).
  @Get('plan/weeks')
  weeks(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode) {
    return this.nutrition.weeks(user.sub, mode ?? 'individual');
  }

  // Generate a brand-new week without touching existing weeks.
  @Post('plan/weekly/new')
  newWeek(@CurrentUser() user: JwtUser, @Body() dto: { mode?: PlanMode; weekStart?: string }) {
    return this.nutrition.newWeek(user.sub, dto?.mode ?? 'individual', dto?.weekStart);
  }

  // Duplicate a saved week's meals into a new (empty) week.
  @Post('plan/weekly/duplicate')
  duplicateWeek(@CurrentUser() user: JwtUser, @Body() dto: { mode?: PlanMode; sourceKey: string; weekStart?: string }) {
    return this.nutrition.duplicateWeek(user.sub, dto?.mode ?? 'individual', dto?.sourceKey, dto?.weekStart);
  }

  // Load one saved week by key (revisit/edit from the timeline). Must come after
  // the specific plan/weekly/* routes and before the parameterised plan/:key/*.
  @Get('plan/week/:key')
  weekByKey(@CurrentUser() user: JwtUser, @Param('key') key: string) {
    return this.nutrition.weekByKey(user.sub, key);
  }

  // Nutrition history (spec §19) — permanent, versioned weekly plan record.
  // Specific 'history' path declared before the parameterised 'plan/:key' routes.
  @Get('history')
  history(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode) {
    return this.nutrition.nutritionHistory(user.sub, mode);
  }

  // Household members (Nutrition Hub only) — real invited users + the owner.
  @Get('family/members')
  familyMembers(@CurrentUser() user: JwtUser) {
    return this.nutrition.familyMembers(user.sub);
  }

  // Find a citizen to invite, by Together City user ID or @username.
  @Get('family/search')
  searchHouseholdUser(@CurrentUser() user: JwtUser, @Query('q') q: string) {
    return this.nutrition.searchHouseholdUser(user.sub, q ?? '');
  }

  // Send a Household invite (owner only) — private to Nutrition Hub.
  @Post('family/invite')
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
  respondHouseholdInvite(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: { accept?: boolean }) {
    return this.nutrition.respondHouseholdInvite(user.sub, id, Boolean(dto?.accept));
  }

  // Edit a member profile (the owner's own; real members edit their own).
  @Patch('family/members/:id')
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
  setFamilyMealPlanning(@CurrentUser() user: JwtUser, @Body() dto: { on?: boolean }) {
    return this.nutrition.setFamilyMealPlanning(user.sub, Boolean(dto?.on));
  }

  // Privacy — what I share with households I belong to (medical private by default).
  @Get('family/sharing')
  getSharing(@CurrentUser() user: JwtUser) {
    return this.nutrition.getHouseholdSharing(user.sub);
  }

  @Patch('family/sharing')
  setSharing(@CurrentUser() user: JwtUser, @Body() dto: Record<string, boolean>) {
    return this.nutrition.setHouseholdSharing(user.sub, dto);
  }

  // Shared pantry (one per household) — grouped by aisle.
  @Get('family/pantry')
  pantry(@CurrentUser() user: JwtUser) {
    return this.nutrition.pantryList(user.sub);
  }

  @Post('family/pantry')
  addPantry(@CurrentUser() user: JwtUser, @Body() dto: { name?: string; grams?: number }) {
    return this.nutrition.addPantryItem(user.sub, dto?.name ?? '', dto?.grams);
  }

  @Post('family/pantry/stock')
  stockPantry(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode) {
    return this.nutrition.stockPantryFromGrocery(user.sub, mode ?? 'family');
  }

  @Patch('family/pantry/:id')
  updatePantry(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: { grams?: number }) {
    return this.nutrition.updatePantryItem(user.sub, id, Number(dto?.grams ?? 0));
  }

  @Delete('family/pantry/:id')
  removePantry(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.removePantryItem(user.sub, id);
  }

  // Supermarket-style grocery list (Grocery Planner redesign). mode: individual|family.
  @Get('grocery/plan')
  groceryPlan(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode) {
    return this.nutrition.groceryPlan(user.sub, mode ?? 'individual');
  }

  @Get('history/:id')
  historyDetail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.nutritionHistoryDetail(user.sub, id);
  }

  /** Weekly Nutrition Progress — per-day, cumulative and weekly totals + scores. */
  @Get('plan/:key/week-summary')
  weekSummary(@CurrentUser() user: JwtUser, @Param('key') key: string) {
    return this.nutrition.weekSummary(user.sub, key);
  }

  @Get('plan/:key/day/:idx/summary')
  daySummary(@CurrentUser() user: JwtUser, @Param('key') key: string, @Param('idx', ParseIntPipe) idx: number) {
    return this.nutrition.daySummary(user.sub, key, idx);
  }

  /** Auto-repair: swap dishes + re-solve portions so the saved day meets its
   *  tolerance bands — the app fixes the plan, never the user. */
  @Post('plan/:key/day/:idx/rebalance')
  repairDay(@CurrentUser() user: JwtUser, @Param('key') key: string, @Param('idx', ParseIntPipe) idx: number) {
    return this.nutrition.repairDay(user.sub, key, idx);
  }

  @Post('plan/:key/day/:idx/swap')
  @UsePipes(new ZodValidationPipe(SwapSchema))
  swap(@CurrentUser() user: JwtUser, @Param('key') key: string, @Param('idx', ParseIntPipe) idx: number, @Body() dto: SwapDto) {
    return this.nutrition.swap(user.sub, key, idx, dto.slot as Slot, dto.restoreRecipeId);
  }

  @Post('plan/:key/day/:idx/skip')
  @UsePipes(new ZodValidationPipe(SkipSchema))
  skip(@CurrentUser() user: JwtUser, @Param('key') key: string, @Param('idx', ParseIntPipe) idx: number, @Body() dto: SkipDto) {
    return this.nutrition.setSkip(user.sub, key, idx, dto.slot as Slot, dto.skipped);
  }

  @Patch('plan/:key/day/:idx/sides')
  @UsePipes(new ZodValidationPipe(SidesSchema))
  sides(@CurrentUser() user: JwtUser, @Param('key') key: string, @Param('idx', ParseIntPipe) idx: number, @Body() dto: SidesDto) {
    return this.nutrition.setSides(user.sub, key, idx, dto.slot as Slot, dto.sides);
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
  recipes(@Query('diet') diet?: Diet) {
    return this.nutrition.recipes(diet);
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

  @Get('supplements')
  supplements(@CurrentUser() user: JwtUser) {
    return this.nutrition.supplements(user.sub);
  }

  @Get('dietitians')
  dietitians() {
    return this.nutrition.dietitians();
  }

  @Post('dietitians/:id/book')
  book(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.bookDietitian(user.sub, id);
  }

  @Get('orders')
  orders(@CurrentUser() user: JwtUser) {
    return this.nutrition.orders(user.sub);
  }

  // ── Quick Commerce API — find the grocery list across online stores ──

  /** Compare the whole list across Blinkit/Zepto/Instamart/BigBasket/JioMart/TC Express. */
  @Get('qc/compare')
  qcCompare(
    @CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode,
    @Query('lat') lat?: string, @Query('lon') lon?: string,
  ) {
    const f = (v?: string) => { const n = parseFloat(v ?? ''); return isFinite(n) ? n : undefined; };
    return this.nutrition.qcCompare(user.sub, mode ?? 'individual', f(lat), f(lon));
  }

  /** Find one product across all the stores. */
  @Get('qc/search')
  qcSearch(@Query('q') q: string, @Query('lat') lat?: string, @Query('lon') lon?: string) {
    const f = (v?: string) => { const n = parseFloat(v ?? ''); return isFinite(n) ? n : undefined; };
    return this.nutrition.qcSearch(q ?? '', f(lat), f(lon));
  }

  /** Order the list through the chosen store (express delivery + live tracking). */
  @Post('qc/order')
  @UsePipes(new ZodValidationPipe(z.object({
    provider: z.string().min(2).max(30),
    mode: z.enum(['individual', 'family']).optional(),
    method: z.enum(['wallet', 'card']).optional(),
  })))
  qcOrder(@CurrentUser() user: JwtUser, @Body() body: { provider: string; mode?: PlanMode; method?: 'wallet' | 'card' }) {
    return this.nutrition.qcOrder(user.sub, body.provider, body.mode ?? 'individual', body.method);
  }

  /** Live tracking (poll-friendly — advances purely with time). */
  @Get('qc/orders/:id/track')
  qcTrack(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.qcTrack(user.sub, id);
  }

  @Post('orders')
  placeOrder(@CurrentUser() user: JwtUser, @Body() body: { method?: 'wallet' | 'card' }) {
    return this.nutrition.placeOrder(user.sub, body?.method);
  }

  @Post('orders/:orderId/deliveries/:deliveryId/cancel')
  cancelDelivery(
    @CurrentUser() user: JwtUser,
    @Param('orderId') orderId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.nutrition.cancelDelivery(user.sub, orderId, deliveryId);
  }

  @Post('cart')
  @UsePipes(new ZodValidationPipe(AddToCartSchema))
  addToCart(@CurrentUser() user: JwtUser, @Body() dto: AddToCartDto) {
    return this.nutrition.buildCart(user.sub, { planKey: dto.planKey, recipeIds: dto.recipeIds, people: dto.people, mode: dto.mode });
  }
}

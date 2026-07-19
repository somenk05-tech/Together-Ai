import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards, UsePipes,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
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

  @Get('preferences')
  prefs(@CurrentUser() user: JwtUser) {
    return this.nutrition.foodPref(user.sub);
  }

  @Patch('preferences')
  @UsePipes(new ZodValidationPipe(FoodPrefSchema))
  updatePrefs(@CurrentUser() user: JwtUser, @Body() dto: FoodPrefDto) {
    return this.nutrition.upsertFoodPref(user.sub, dto);
  }

  // Specific plan routes first, then parameterised ones.
  @Get('plan/weekly')
  weekly(@CurrentUser() user: JwtUser, @Query('mode') mode?: PlanMode) {
    return this.nutrition.weeklyPlan(user.sub, mode ?? 'individual');
  }

  @Post('plan/weekly/regenerate')
  @UsePipes(new ZodValidationPipe(RegenerateSchema))
  regenerate(@CurrentUser() user: JwtUser, @Body() dto: RegenerateDto) {
    return this.nutrition.regenerate(user.sub, dto.mode ?? 'individual');
  }

  @Get('plan/:key/day/:idx/summary')
  daySummary(@Param('key') key: string, @Param('idx', ParseIntPipe) idx: number) {
    return this.nutrition.daySummary(key, idx);
  }

  @Post('plan/:key/day/:idx/swap')
  @UsePipes(new ZodValidationPipe(SwapSchema))
  swap(@Param('key') key: string, @Param('idx', ParseIntPipe) idx: number, @Body() dto: SwapDto) {
    return this.nutrition.swap(key, idx, dto.slot as Slot);
  }

  @Post('plan/:key/day/:idx/skip')
  @UsePipes(new ZodValidationPipe(SkipSchema))
  skip(@Param('key') key: string, @Param('idx', ParseIntPipe) idx: number, @Body() dto: SkipDto) {
    return this.nutrition.setSkip(key, idx, dto.slot as Slot, dto.skipped);
  }

  @Patch('plan/:key/day/:idx/sides')
  @UsePipes(new ZodValidationPipe(SidesSchema))
  sides(@Param('key') key: string, @Param('idx', ParseIntPipe) idx: number, @Body() dto: SidesDto) {
    return this.nutrition.setSides(key, idx, dto.slot as Slot, dto.sides);
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

  @Get('recipes/:id')
  recipe(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.nutrition.recipe(id, user.sub);
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

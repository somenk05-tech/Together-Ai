import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards, UsePipes,
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

  @Patch('plan/:key/day/:idx/sides')
  @UsePipes(new ZodValidationPipe(SidesSchema))
  sides(@Param('key') key: string, @Param('idx', ParseIntPipe) idx: number, @Body() dto: SidesDto) {
    return this.nutrition.setSides(key, idx, dto.slot as Slot, dto.sides);
  }

  @Get('recipes')
  recipes(@Query('diet') diet?: Diet) {
    return this.nutrition.recipes(diet);
  }

  @Get('recipes/:id')
  recipe(@Param('id') id: string) {
    return this.nutrition.recipe(id);
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
    return this.nutrition.addPlanToCart(user.sub, dto.planKey ?? '');
  }
}

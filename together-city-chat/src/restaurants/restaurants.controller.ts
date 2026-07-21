import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { RestaurantsService } from './restaurants.service';
import {
  PlaceOrderSchema, type PlaceOrderDto,
  ReserveTableSchema, type ReserveTableDto,
  RestaurantQuerySchema, type RestaurantQueryDto,
  DiscoverSchema, type DiscoverDto,
  TopSchema, type TopDto,
  CollectionsSchema, type CollectionsDto,
  MealMatchSchema, type MealMatchDto,
} from './dto/restaurants.dto';

@Controller('restaurants')
@UseGuards(JwtAuthGuard)
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get('cuisines')
  cuisines() {
    return this.restaurants.cuisines();
  }

  @Get()
  @UsePipes(new ZodValidationPipe(RestaurantQuerySchema))
  browse(@CurrentUser() user: JwtUser, @Query() query: RestaurantQueryDto) {
    return this.restaurants.browse(user.sub, query);
  }

  @Get('orders')
  orders(@CurrentUser() user: JwtUser) {
    return this.restaurants.myOrders(user.sub);
  }

  @Get('reservations')
  reservations(@CurrentUser() user: JwtUser) {
    return this.restaurants.myReservations(user.sub);
  }

  @Get('discover')
  @UsePipes(new ZodValidationPipe(DiscoverSchema))
  discover(@CurrentUser() user: JwtUser, @Query() query: DiscoverDto) {
    return this.restaurants.discover(user.sub, query);
  }

  // Top 25 food & café destinations for a locality, ranked by the TC Score.
  @Get('top')
  @UsePipes(new ZodValidationPipe(TopSchema))
  top(@CurrentUser() user: JwtUser, @Query() query: TopDto) {
    return this.restaurants.topByLocality(user.sub, query);
  }

  // Curated discovery collections (Top 25, Cafés, Best Coffee, Trending, …).
  @Get('collections')
  @UsePipes(new ZodValidationPipe(CollectionsSchema))
  collections(@CurrentUser() user: JwtUser, @Query() query: CollectionsDto) {
    return this.restaurants.collections(user.sub, query);
  }

  // Search the full catalogue (browse only shows the curated Top 25).
  @Get('search')
  search(@CurrentUser() user: JwtUser, @Query('q') q: string) {
    return this.restaurants.search(user.sub, q ?? '');
  }

  // Decision engine — rank nearby DISHES against today's planned meal target.
  @Get('meal-match')
  @UsePipes(new ZodValidationPipe(MealMatchSchema))
  mealMatch(@CurrentUser() user: JwtUser, @Query() query: MealMatchDto) {
    return this.restaurants.mealMatch(user.sub, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.restaurants.detail(user.sub, id);
  }

  // AI editorial "what to expect" overview (loaded lazily by the profile page).
  @Get(':id/overview')
  overview(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.restaurants.overview(user.sub, id);
  }

  @Post(':id/order')
  @UsePipes(new ZodValidationPipe(PlaceOrderSchema))
  order(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PlaceOrderDto) {
    return this.restaurants.placeOrder(user.sub, id, dto);
  }

  @Post(':id/reserve')
  @UsePipes(new ZodValidationPipe(ReserveTableSchema))
  reserve(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ReserveTableDto) {
    return this.restaurants.reserve(user.sub, id, dto);
  }
}

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

  @Get(':id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.restaurants.detail(user.sub, id);
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

import { Body, Controller, Get, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { BeautyService } from './beauty.service';
import {
  SaveBeautyProfileSchema, type SaveBeautyProfileDto,
  PlaceBeautyOrderSchema, type PlaceBeautyOrderDto,
} from './dto/beauty.dto';

@Controller('beauty')
@UseGuards(JwtAuthGuard)
export class BeautyController {
  constructor(private readonly beauty: BeautyService) {}

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.beauty.getProfile(user.sub);
  }

  @Put('profile')
  @UsePipes(new ZodValidationPipe(SaveBeautyProfileSchema))
  saveProfile(@CurrentUser() user: JwtUser, @Body() dto: SaveBeautyProfileDto) {
    return this.beauty.saveProfile(user.sub, dto);
  }

  @Get('insights')
  insights(@CurrentUser() user: JwtUser) {
    return this.beauty.insights(user.sub);
  }

  @Get('products')
  products(@CurrentUser() user: JwtUser) {
    return this.beauty.products(user.sub);
  }

  @Get('orders')
  orders(@CurrentUser() user: JwtUser) {
    return this.beauty.orders(user.sub);
  }

  @Post('orders')
  @UsePipes(new ZodValidationPipe(PlaceBeautyOrderSchema))
  placeOrder(@CurrentUser() user: JwtUser, @Body() dto: PlaceBeautyOrderDto) {
    return this.beauty.placeOrder(user.sub, dto);
  }
}

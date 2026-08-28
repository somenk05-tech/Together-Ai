import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { LocalServicesService } from './local-services.service';
import { ServiceOrdersService } from './orders.service';
import { Throttle } from '@nestjs/throttler';
import {
  AcceptOrderSchema, type AcceptOrderDto,
  AdvanceOrderSchema, type AdvanceOrderDto,
  CancelOrderSchema, type CancelOrderDto,
  PatchMenuItemSchema, type PatchMenuItemDto,
  PlaceOrderSchema, type PlaceOrderDto,
  QuoteOrderSchema, type QuoteOrderDto,
  RecommendSchema, type RecommendDto,
  RejectOrderSchema, type RejectOrderDto,
} from './dto/orders.dto';
import { MODEL_LIMIT } from '../shared/throttles';

/**
 * ORDERING, UNDER THE SAME ROOF AS THE MENU IT ORDERS FROM.
 *
 * A second controller on the same 'services' prefix, REGISTERED BEFORE the
 * main one in the module — 'orders' must never be read as a listing id by
 * `GET :id`, which is the same collision 'mine' and 'regulars' already dodge
 * by declaration order.
 *
 * The verbs are deliberately owner-side and citizen-side by route, not by
 * flag: accept/reject/advance belong to the kitchen, cancel to the citizen,
 * and each is checked against the caller's actual side — a route that took a
 * "side" parameter would be a route that believed it.
 */
@Controller('services')
@UseGuards(JwtAuthGuard)
export class ServiceOrdersController {
  constructor(
    private readonly orders: ServiceOrdersService,
    private readonly services: LocalServicesService,
  ) {}

  /** Every order the caller has placed, newest first. */
  @Get('orders/mine')
  mine(@CurrentUser() user: JwtUser) { return this.orders.mine(user.sub); }

  /** The kitchen's board: open orders first, recent history behind them. */
  @Get('orders/business/:listingId')
  board(@CurrentUser() user: JwtUser, @Param('listingId') listingId: string) {
    return this.orders.forBusiness(user.sub, listingId);
  }

  @Get('orders/:orderId')
  one(@CurrentUser() user: JwtUser, @Param('orderId') orderId: string) {
    return this.orders.one(user.sub, orderId);
  }

  @Post('orders/:orderId/accept')
  @UsePipes(new ZodValidationPipe(AcceptOrderSchema))
  accept(@CurrentUser() user: JwtUser, @Param('orderId') orderId: string, @Body() dto: AcceptOrderDto) {
    return this.orders.accept(user.sub, orderId, dto);
  }

  @Post('orders/:orderId/reject')
  @UsePipes(new ZodValidationPipe(RejectOrderSchema))
  reject(@CurrentUser() user: JwtUser, @Param('orderId') orderId: string, @Body() dto: RejectOrderDto) {
    return this.orders.reject(user.sub, orderId, dto);
  }

  @Post('orders/:orderId/advance')
  @UsePipes(new ZodValidationPipe(AdvanceOrderSchema))
  advance(@CurrentUser() user: JwtUser, @Param('orderId') orderId: string, @Body() dto: AdvanceOrderDto) {
    return this.orders.advance(user.sub, orderId, dto.to);
  }

  @Post('orders/:orderId/cancel')
  @UsePipes(new ZodValidationPipe(CancelOrderSchema))
  cancel(@CurrentUser() user: JwtUser, @Param('orderId') orderId: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancel(user.sub, orderId, dto);
  }

  /** What this cart costs, priced by the server — the number on the button. */
  @Post(':id/order/quote')
  @UsePipes(new ZodValidationPipe(QuoteOrderSchema))
  quote(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: QuoteOrderDto) {
    return this.orders.quote(user.sub, id, dto);
  }

  /**
   * The one route here that moves a citizen's money. `Idempotency-Key` is the
   * standard header, same as the till's pay and the wallet's top-up.
   */
  @Post(':id/order')
  @UsePipes(new ZodValidationPipe(PlaceOrderSchema))
  place(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: PlaceOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.place(user.sub, id, dto, idempotencyKey);
  }

  /** "Veg, not too spicy, ₹800 for two" → picks from the LIVE menu only. */
  @Post(':id/menu/recommend')
  @Throttle(MODEL_LIMIT)
  @UsePipes(new ZodValidationPipe(RecommendSchema))
  recommend(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: RecommendDto) {
    return this.orders.recommend(user.sub, id, dto);
  }

  /** The command centre's one-tap edit on one menu line. */
  @Patch(':id/menu/:itemId')
  @UsePipes(new ZodValidationPipe(PatchMenuItemSchema))
  patchMenuItem(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: PatchMenuItemDto,
  ) {
    return this.services.patchMenuItem(user.sub, id, itemId, dto);
  }
}

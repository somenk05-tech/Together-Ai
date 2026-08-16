import {
  Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards, UsePipes,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { SettlementService } from './settlement.service';
import {
  CancelInvoiceSchema, type CancelInvoiceDto,
  CreateInvoiceSchema, type CreateInvoiceDto,
  PayInvoiceSchema, type PayInvoiceDto,
  PayoutAccountSchema, type PayoutAccountDto,
  RefundInvoiceSchema, type RefundInvoiceDto,
  UpdateInvoiceSchema, type UpdateInvoiceDto,
} from './dto/commerce.dto';

/**
 * THE TILL.
 *
 * Two audiences on one prefix, and the split in the paths is the split in the
 * product: `/pay/invoices/*` is what a citizen holds, `/pay/business/*` is what
 * a business runs. Nothing under `/pay/business` answers without owning the
 * listing named in it, and nothing under `/pay/invoices` answers without being
 * addressed to the caller.
 *
 * ROUTE ORDER MATTERS HERE, the same way it does next door. Every static
 * segment is declared before the `:id` that would otherwise swallow it.
 */
@Controller('pay')
@UseGuards(JwtAuthGuard)
export class CommerceController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly settlement: SettlementService,
  ) {}

  // ── the citizen ───────────────────────────────────────────────────────────

  @Get('invoices')
  myInvoices(@CurrentUser() user: JwtUser) {
    return this.invoices.myInvoices(user.sub);
  }

  @Get('invoices/:id')
  invoice(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.invoices.detail(user.sub, id);
  }

  /** What the pay sheet draws: the split, the balance, whether a card is needed. */
  @Get('invoices/:id/quote')
  quote(@CurrentUser() user: JwtUser, @Param('id') id: string, @Query('wallet') wallet?: string) {
    return this.payments.quote(user.sub, id, wallet !== 'off');
  }

  /**
   * The one route that moves a citizen's money.
   *
   * `Idempotency-Key` is the standard header, so a client retrying a request it
   * is not sure landed says so the way every payment API expects to be told —
   * and the same way `POST /financial/wallet/top-up` is already told.
   */
  @Post('invoices/:id/pay')
  @UsePipes(new ZodValidationPipe(PayInvoiceSchema))
  pay(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: PayInvoiceDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.payments.pay(user.sub, id, dto, idempotencyKey);
  }

  // ── the business ──────────────────────────────────────────────────────────

  /** The neighbours this business may bill. See `billableCustomers`. */
  @Get('business/:listingId/customers')
  customers(@CurrentUser() user: JwtUser, @Param('listingId') listingId: string) {
    return this.invoices.billableCustomers(user.sub, listingId);
  }

  @Get('business/:listingId/invoices')
  businessInvoices(
    @CurrentUser() user: JwtUser,
    @Param('listingId') listingId: string,
    @Query('status') status?: string,
  ) {
    return this.invoices.businessInvoices(user.sub, listingId, status);
  }

  @Post('business/:listingId/invoices')
  @UsePipes(new ZodValidationPipe(CreateInvoiceSchema))
  create(
    @CurrentUser() user: JwtUser,
    @Param('listingId') listingId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoices.create(user.sub, listingId, dto);
  }

  /** Payments & Payouts — balance, today, pending, the payout list, the account. */
  @Get('business/:listingId/payments')
  dashboard(@CurrentUser() user: JwtUser, @Param('listingId') listingId: string) {
    return this.settlement.dashboard(user.sub, listingId);
  }

  @Get('business/:listingId/account')
  account(@CurrentUser() user: JwtUser, @Param('listingId') listingId: string) {
    return this.settlement.onboarding(user.sub, listingId);
  }

  @Post('business/:listingId/account')
  @UsePipes(new ZodValidationPipe(PayoutAccountSchema))
  saveAccount(
    @CurrentUser() user: JwtUser,
    @Param('listingId') listingId: string,
    @Body() dto: PayoutAccountDto,
  ) {
    return this.settlement.saveAccount(user.sub, listingId, dto);
  }

  /** One payout with its arithmetic shown. Declared before `payouts/:id` would
   *  be needed — there is no list route here because the dashboard carries it. */
  @Get('business/payouts/:id')
  payout(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.settlement.payout(user.sub, id);
  }

  @Patch('business/invoices/:id')
  @UsePipes(new ZodValidationPipe(UpdateInvoiceSchema))
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(user.sub, id, dto);
  }

  @Post('business/invoices/:id/send')
  send(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.invoices.send(user.sub, id);
  }

  @Post('business/invoices/:id/cancel')
  @UsePipes(new ZodValidationPipe(CancelInvoiceSchema))
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: CancelInvoiceDto) {
    return this.invoices.cancel(user.sub, id, dto.reason);
  }

  @Post('business/invoices/:id/refund')
  @UsePipes(new ZodValidationPipe(RefundInvoiceSchema))
  refund(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: RefundInvoiceDto) {
    return this.payments.refund(user.sub, id, dto.amountInr, dto.reason);
  }

  @Delete('business/invoices/:id')
  removeDraft(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.invoices.removeDraft(user.sub, id);
  }
}

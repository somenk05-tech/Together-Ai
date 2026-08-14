import { Body, Headers, Controller, Delete, Get, Param, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { FinancialService } from './financial.service';
import { Mira } from '../mira/mira.decorator';
import {
  TopUpSchema, type TopUpDto, SetBudgetSchema, type SetBudgetDto, PaySchema, type PayDto,
  LinkCardSchema, type LinkCardDto, AddSpendLogSchema, type AddSpendLogDto,
} from './dto/financial.dto';

@Controller('financial')
@UseGuards(JwtAuthGuard)
export class FinancialController {
  constructor(private readonly financial: FinancialService) {}

  @Mira({
    intent: 'Tell the citizen their wallet balance',
    utterances: ["what's my balance", 'how much do I have', 'wallet balance'],
    risk: 'R0',
  })
  @Get('wallet')
  wallet(@CurrentUser() user: JwtUser) {
    return this.financial.wallet(user.sub);
  }

  @Post('wallet/top-up')
  @UsePipes(new ZodValidationPipe(TopUpSchema))
  topUp(
    @CurrentUser() user: JwtUser,
    @Body() dto: TopUpDto,
    // The standard header, so a client retrying a request it is not sure landed
    // says so the way every payment API expects to be told.
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.financial.topUp(user.sub, dto.amountInr, idempotencyKey);
  }

  @Post('pay')
  @UsePipes(new ZodValidationPipe(PaySchema))
  pay(@CurrentUser() user: JwtUser, @Body() dto: PayDto) {
    return this.financial.charge(user.sub, dto);
  }

  @Get('card')
  getCard(@CurrentUser() user: JwtUser) {
    return this.financial.getCard(user.sub);
  }

  @Post('card')
  @UsePipes(new ZodValidationPipe(LinkCardSchema))
  linkCard(@CurrentUser() user: JwtUser, @Body() dto: LinkCardDto) {
    return this.financial.linkCard(user.sub, dto);
  }

  @Delete('card')
  removeCard(@CurrentUser() user: JwtUser) {
    return this.financial.removeCard(user.sub);
  }

  @Mira({
    intent: 'List the citizen’s recent transactions',
    utterances: ['what did I spend', 'recent transactions', 'what have I paid for'],
    risk: 'R0',
  })
  @Get('transactions')
  transactions(@CurrentUser() user: JwtUser) {
    return this.financial.transactions(user.sub);
  }

  @Get('spending')
  spending(@CurrentUser() user: JwtUser) {
    return this.financial.spending(user.sub);
  }

  @Get('services')
  services() {
    return this.financial.services();
  }

  @Get('budgets')
  budgets(@CurrentUser() user: JwtUser) {
    return this.financial.budgets(user.sub);
  }

  @Put('budgets')
  @UsePipes(new ZodValidationPipe(SetBudgetSchema))
  setBudget(@CurrentUser() user: JwtUser, @Body() dto: SetBudgetDto) {
    return this.financial.setBudget(user.sub, dto);
  }

  /**
   * The citizen's own spending log. Both writes answer with the WHOLE list
   * rather than the row they touched — the page shows a list, and a client that
   * has to patch its own copy after every write is a client with a second idea
   * about what the log contains.
   */
  @Get('log')
  spendLog(@CurrentUser() user: JwtUser) {
    return this.financial.spendLog(user.sub);
  }

  @Post('log')
  @UsePipes(new ZodValidationPipe(AddSpendLogSchema))
  addSpendLog(@CurrentUser() user: JwtUser, @Body() dto: AddSpendLogDto) {
    return this.financial.addSpendLog(user.sub, dto);
  }

  @Delete('log/:id')
  removeSpendLog(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.financial.removeSpendLog(user.sub, id);
  }
}

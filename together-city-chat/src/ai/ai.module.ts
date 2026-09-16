import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiSuggestionsService } from './ai-suggestions.service';
import { AiSuggestionsController } from './ai-suggestions.controller';
import { ModelBudgetService } from './model-budget.service';
import { AiLedgerService } from './ai-ledger.service';

/** Global so any hub (nutrition, dating, beauty, fitness) can inject AiService. */
@Global()
@Module({
  controllers: [AiSuggestionsController],
  providers: [AiService, AiSuggestionsService, ModelBudgetService, AiLedgerService],
  exports: [AiService, ModelBudgetService, AiLedgerService],
})
export class AiModule {}

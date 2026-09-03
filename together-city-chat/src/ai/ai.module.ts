import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiSuggestionsService } from './ai-suggestions.service';
import { AiSuggestionsController } from './ai-suggestions.controller';
import { ModelBudgetService } from './model-budget.service';

/** Global so any hub (nutrition, dating, beauty, fitness) can inject AiService. */
@Global()
@Module({
  controllers: [AiSuggestionsController],
  providers: [AiService, AiSuggestionsService, ModelBudgetService],
  exports: [AiService, ModelBudgetService],
})
export class AiModule {}

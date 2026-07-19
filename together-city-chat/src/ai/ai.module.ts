import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiSuggestionsService } from './ai-suggestions.service';
import { AiSuggestionsController } from './ai-suggestions.controller';

/** Global so any hub (nutrition, dating, beauty, fitness) can inject AiService. */
@Global()
@Module({
  controllers: [AiSuggestionsController],
  providers: [AiService, AiSuggestionsService],
  exports: [AiService],
})
export class AiModule {}

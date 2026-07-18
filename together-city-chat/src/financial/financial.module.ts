import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';

@Module({
  imports: [PrismaModule],
  controllers: [FinancialController],
  providers: [FinancialService],
  exports: [FinancialService],
})
export class FinancialModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { DaybookController } from './daybook.controller';
import { DaybookService } from './daybook.service';

@Module({
  imports: [PrismaModule],
  controllers: [DaybookController],
  providers: [DaybookService],
  exports: [DaybookService],
})
export class DaybookModule {}

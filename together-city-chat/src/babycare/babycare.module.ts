import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { BabyCareController } from './babycare.controller';
import { BabyCareService } from './babycare.service';

@Module({
  imports: [PrismaModule],
  controllers: [BabyCareController],
  providers: [BabyCareService],
  exports: [BabyCareService],
})
export class BabyCareModule {}

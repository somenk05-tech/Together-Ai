import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ThoughtsController } from './thoughts.controller';
import { ThoughtsService } from './thoughts.service';

@Module({
  imports: [PrismaModule],
  controllers: [ThoughtsController],
  providers: [ThoughtsService],
  exports: [ThoughtsService],
})
export class ThoughtsModule {}

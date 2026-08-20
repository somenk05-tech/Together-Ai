import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [PetsController],
  providers: [PetsService],
  exports: [PetsService],
})
export class PetsModule {}

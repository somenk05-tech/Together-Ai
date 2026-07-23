import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { MedicalModule } from '../medical/medical.module';
import { FitnessController } from './fitness.controller';
import { FitnessService } from './fitness.service';

@Module({
  // MedicalModule provides the consent-gated biomarker reader.
  imports: [PrismaModule, ProfileModule, MedicalModule],
  controllers: [FitnessController],
  providers: [FitnessService],
})
export class FitnessModule {}

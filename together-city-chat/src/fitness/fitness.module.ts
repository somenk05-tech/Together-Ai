import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { MedicalModule } from '../medical/medical.module';
import { NutritionModule } from '../nutrition/nutrition.module';
import { FitnessController } from './fitness.controller';
import { FitnessService } from './fitness.service';

@Module({
  // MedicalModule provides the consent-gated biomarker reader. NutritionModule
  // provides the one protein prescription — this hub asks for it rather than
  // keeping a second copy of a clinical rule. The edge only goes this way;
  // Nutrition does not import Fitness, so there is no cycle to break.
  imports: [PrismaModule, ProfileModule, MedicalModule, NutritionModule],
  controllers: [FitnessController],
  providers: [FitnessService],
  /** Mira reads the citizen's plan and their log. */
  exports: [FitnessService],
})
export class FitnessModule {}

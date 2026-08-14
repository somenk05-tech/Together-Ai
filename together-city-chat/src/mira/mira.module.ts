import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { FinancialModule } from '../financial/financial.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { DriveModule } from '../drive/drive.module';
import { AstrologyModule } from '../astrology/astrology.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { NutritionModule } from '../nutrition/nutrition.module';
import { MedicalModule } from '../medical/medical.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProfileModule } from '../profile/profile.module';
import { FitnessModule } from '../fitness/fitness.module';
import { BeautyModule } from '../beauty/beauty.module';
import { EntertainmentModule } from '../entertainment/entertainment.module';
import { TravelModule } from '../travel/travel.module';
import { ThoughtsModule } from '../thoughts/thoughts.module';
import { MiraController } from './mira.controller';
import { MiraService } from './mira.service';
import { MiraRegistry } from './mira.registry';
import { MiraLedger } from './ledger';

/**
 * Mira imports the hubs she reads from; she owns no data of her own.
 *
 * That is the "chrome, not a hub" claim made structurally: if this module ever
 * needs a Prisma model to answer a question, something has been built in the
 * wrong place. Sixteen imports and still no model of her own is the claim
 * holding under load rather than the claim being easy.
 *
 * ── THE EDGE ONLY GOES ONE WAY ────────────────────────────────────────────
 *
 * Nothing imports MiraModule. She is a leaf, deliberately, and that is what
 * makes importing half the application safe rather than a cycle waiting to
 * happen. If a hub ever needs something FROM her, the answer is not to add the
 * back-edge — it is that the thing belongs in `shared/`.
 *
 * ── AND WHAT IS DELIBERATELY NOT IMPORTED ─────────────────────────────────
 *
 * Chat, dating, social, jobs and real estate. Not an oversight: those are the
 * hubs where a read is about SOMEBODY ELSE. `dating-isolation.spec.ts` exists
 * because that boundary has been crossed before, and Mira reading the dating
 * pool "helpfully" is the exact failure it was written for. When she is given
 * one of those it will be one route at a time, with the argument written down.
 */
@Module({
  imports: [
    DiscoveryModule,
    FinancialModule,
    RestaurantsModule,
    DriveModule,
    AstrologyModule,
    PrescriptionsModule,
    NutritionModule,
    MedicalModule,
    MailModule,
    NotificationsModule,
    ProfileModule,
    FitnessModule,
    BeautyModule,
    EntertainmentModule,
    TravelModule,
    ThoughtsModule,
  ],
  controllers: [MiraController],
  providers: [MiraRegistry, MiraLedger, MiraService],
  exports: [MiraService, MiraRegistry],
})
export class MiraModule {}

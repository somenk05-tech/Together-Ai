import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ClockModule } from '../shared/clock/clock.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MedicinesController, PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { ManualEntryExtractor, PrescriptionExtractor } from './prescription-extractor';

@Module({
  imports: [PrismaModule, ClockModule, NotificationsModule],
  controllers: [PrescriptionsController, MedicinesController],
  providers: [
    PrescriptionsService,
    // Swap this for a real OCR provider by binding the same token. Nothing
    // outside this line needs to change — including the review flow, which
    // exists precisely because no reader is ever fully trusted.
    { provide: PrescriptionExtractor, useClass: ManualEntryExtractor },
  ],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}

import { PostMediaGuard } from '../social/post-media-guard';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { CommerceModule } from '../commerce/commerce.module';
import { FinancialModule } from '../financial/financial.module';
import { LocalServicesController } from './local-services.controller';
import { LocalServicesService } from './local-services.service';
import { ServiceOrdersController } from './orders.controller';
import { ServiceOrdersService } from './orders.service';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  // Commerce is the till and Financial is the wallet; ordering is a CALLER of
  // both, never a second copy of either.
  /* MediaModule for StorageProvider: deleting a listing has to take its
     logo, menu scan, gallery, menu-item photographs and verification
     documents out of the bucket — see purgeListingObjects. */
  imports: [PrismaModule, NotificationsModule, AiModule, CommerceModule, FinancialModule, MediaModule],
  // ServiceOrdersController sits BEFORE LocalServicesController so its literal
  // 'orders/…' paths are matched before ':id' can eat them — the same
  // declaration-order rule 'mine' and 'regulars' already rely on inside the
  // main controller.
  controllers: [VerificationController, ServiceOrdersController, LocalServicesController],
  providers: [LocalServicesService, ServiceOrdersService, VerificationService, PostMediaGuard],
  // The console decides on submissions, and the decision lives where the
  // permission check and the audit row are.
  exports: [VerificationService],
})
export class LocalServicesModule {}

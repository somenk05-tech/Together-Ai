import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AdminAccessService } from './admin-access.service';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

/**
 * The console: who may act, what was done, and — so far — one screen.
 *
 * The substrate came first on purpose. Screens are added one at a time; the
 * two things that cannot be added later are the permission check and the audit
 * trail, so every screen is built on top of them rather than beside them.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminAccessService, AdminService],
  exports: [AdminAccessService],
})
export class AdminConsoleModule {}

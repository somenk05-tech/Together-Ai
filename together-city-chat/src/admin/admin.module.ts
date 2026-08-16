import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { LocalServicesModule } from '../local-services/local-services.module';
import { AdminAccessService } from './admin-access.service';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ConsoleBootstrapService } from './console-bootstrap';

/**
 * The console: who may act, what was done, and — so far — one screen.
 *
 * The substrate came first on purpose. Screens are added one at a time; the
 * two things that cannot be added later are the permission check and the audit
 * trail, so every screen is built on top of them rather than beside them.
 *
 * ConsoleBootstrapService is what makes any of it reachable: the grants table
 * starts empty and only a route requiring `admin.grant` can write to it, so
 * without a boot-time first admin the console is a locked room with the key
 * inside. See that file for why an environment variable is the right key.
 */
@Module({
  imports: [PrismaModule, LocalServicesModule],
  controllers: [AdminController],
  providers: [AdminAccessService, AdminService, ConsoleBootstrapService],
  exports: [AdminAccessService],
})
export class AdminConsoleModule {}

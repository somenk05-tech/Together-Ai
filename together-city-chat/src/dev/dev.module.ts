import { Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AdminConsoleModule } from '../admin/admin.module';
import { DevController } from './dev.controller';
import { VisibilityController } from './visibility.controller';
import { DevService } from './dev.service';
import { DevPasswordGuard } from './dev-password.guard';
import { FeatureFlagGuard } from './feature-flag.guard';
import { RoomRoutesRegistry } from './room-routes.registry';

/**
 * The developer page, and the kill switches it operates.
 *
 * FeatureFlagGuard is registered as an APP_GUARD from here rather than from
 * app.module, so the guard, the flag catalogue it reads and the screen that
 * flips it are one unit. A global guard declared three files away from the list
 * it consults is a global guard somebody removes a flag from without noticing
 * what still gates on it.
 *
 * The same instance is both the guard and the reader: DevService asks it for a
 * snapshot and tells it to invalidate after a flip, so there is exactly one
 * cache and no way for the page to disagree with the gate about what is on.
 */
@Module({
  // DiscoveryModule is for RoomRoutesRegistry, which walks the live
  // controllers so /dev can say what a room's kill switch refuses rather than
  // keeping a list that drifts.
  imports: [PrismaModule, AdminConsoleModule, DiscoveryModule],
  // VisibilityController is PUBLIC and lives here anyway: it reads the same
  // FeatureFlagGuard instance, and a door-state reader three modules away
  // from the list it reports is one somebody edits without seeing the other.
  controllers: [DevController, VisibilityController],
  providers: [
    DevService,
    DevPasswordGuard,
    FeatureFlagGuard,
    RoomRoutesRegistry,
    { provide: APP_GUARD, useExisting: FeatureFlagGuard },
  ],
})
export class DevModule {}

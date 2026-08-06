import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RedisService } from './shared/redis/redis.service';
import { RedisThrottlerStorage } from './shared/redis/throttler-redis.storage';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { NoStoreInterceptor } from './shared/interceptors/no-store.interceptor';
import { DeprecationInterceptor } from './shared/interceptors/deprecation.interceptor';
import configuration from './shared/config/configuration';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { EventsModule } from './shared/events/events.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AdminModule } from './auth/admin.module';
import { AdminConsoleModule } from './admin/admin.module';
import { ClockModule } from './shared/clock/clock.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { ConnectionsModule } from './connections/connections.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { ChatModule } from './chat/chat.module';
import { MediaModule } from './media/media.module';
import { DriveModule } from './drive/drive.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfileModule } from './profile/profile.module';
import { LookupsModule } from './lookups/lookups.module';
import { NutritionModule } from './nutrition/nutrition.module';
import { SocialModule } from './social/social.module';
import { DatingModule } from './dating/dating.module';
import { MedicalModule } from './medical/medical.module';
import { BeautyModule } from './beauty/beauty.module';
import { FitnessModule } from './fitness/fitness.module';
import { FinancialModule } from './financial/financial.module';
import { JobsModule } from './jobs/jobs.module';
import { RealEstateModule } from './realestate/realestate.module';
import { LocalServicesModule } from './local-services/local-services.module';
import { EntertainmentModule } from './entertainment/entertainment.module';
import { TravelModule } from './travel/travel.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { MailModule } from './mail/mail.module';
import { CityModule } from './city/city.module';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';
import { AstrologyModule } from './astrology/astrology.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ThoughtsModule } from './thoughts/thoughts.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { CallsModule } from './calls/calls.module';
import { AvatarsModule } from './avatars/avatars.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // The counter lives in Redis, not in this process. forRootAsync because the
    // storage needs RedisService, and RedisModule is @Global but still has to be
    // resolved before the factory runs. See throttler-redis.storage.ts for what
    // the in-process default was actually limiting.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    HealthModule,
    AstrologyModule,
    PrismaModule,
    RedisModule,
    EventsModule,
    AiModule,
    AuthModule,
    AdminModule,
    AdminConsoleModule,
    ClockModule,
    TasksModule,
    UsersModule,
    ConnectionsModule,
    ConversationsModule,
    MessagesModule,
    NotificationsModule,
    MediaModule,
    DriveModule,
    ChatModule,
    ProfileModule,
    LookupsModule,
    NutritionModule,
    SocialModule,
    DatingModule,
    MedicalModule,
    BeautyModule,
    FitnessModule,
    FinancialModule,
    JobsModule,
    RealEstateModule,
    LocalServicesModule,
    EntertainmentModule,
    TravelModule,
    RestaurantsModule,
    MailModule,
    CityModule,
    PrivacyModule,
    ThoughtsModule,
    PrescriptionsModule,
    CallsModule,
    AvatarsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Authentication is the default for the whole API. Previously JwtAuthGuard
    // was declared per controller, so a controller that forgot it was silently
    // public — the wrong way round for a guard. Routes that genuinely need to
    // be reachable without a token carry @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // No authenticated response is ever cacheable by a browser, proxy or CDN.
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_INTERCEPTOR, useClass: DeprecationInterceptor },
  ],
})
export class AppModule {}

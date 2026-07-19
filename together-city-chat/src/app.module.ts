import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './shared/config/configuration';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { EventsModule } from './shared/events/events.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConnectionsModule } from './connections/connections.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { ChatModule } from './chat/chat.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfileModule } from './profile/profile.module';
import { NutritionModule } from './nutrition/nutrition.module';
import { SocialModule } from './social/social.module';
import { DatingModule } from './dating/dating.module';
import { MedicalModule } from './medical/medical.module';
import { BeautyModule } from './beauty/beauty.module';
import { FitnessModule } from './fitness/fitness.module';
import { FinancialModule } from './financial/financial.module';
import { JobsModule } from './jobs/jobs.module';
import { RealEstateModule } from './realestate/realestate.module';
import { EntertainmentModule } from './entertainment/entertainment.module';
import { TravelModule } from './travel/travel.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { MailModule } from './mail/mail.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    EventsModule,
    AiModule,
    AuthModule,
    UsersModule,
    ConnectionsModule,
    ConversationsModule,
    MessagesModule,
    NotificationsModule,
    MediaModule,
    ChatModule,
    ProfileModule,
    NutritionModule,
    SocialModule,
    DatingModule,
    MedicalModule,
    BeautyModule,
    FitnessModule,
    FinancialModule,
    JobsModule,
    RealEstateModule,
    EntertainmentModule,
    TravelModule,
    RestaurantsModule,
    MailModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { SocialController } from './social.controller';
import { SocialGateway } from './social.gateway';
import { SocialService } from './social.service';

@Module({
  imports: [PrismaModule],
  controllers: [SocialController],
  providers: [SocialService, SocialGateway],
})
export class SocialModule {}

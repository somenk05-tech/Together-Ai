import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { MailController } from './mail.controller';
import { MailInboundController } from './mail-inbound.controller';
import { MailService } from './mail.service';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [MailController, MailInboundController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

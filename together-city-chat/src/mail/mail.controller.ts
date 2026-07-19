import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MailService } from './mail.service';
import { FlagSchema, type FlagDto, FolderQuerySchema, type FolderQueryDto, SendMailSchema, type SendMailDto } from './dto/mail.dto';

@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('account')
  account(@CurrentUser() user: JwtUser) {
    return this.mail.account(user.sub);
  }

  @Get('directory')
  directory(@CurrentUser() user: JwtUser) {
    return this.mail.directory(user.sub);
  }

  @Get('outbox')
  outbox(@CurrentUser() user: JwtUser) {
    return this.mail.outbox(user.sub);
  }

  @Post('primary')
  setPrimary(@CurrentUser() user: JwtUser, @Body() body: { email?: string; phone?: string }) {
    return this.mail.setPrimary(user.sub, { email: body?.email, phone: body?.phone });
  }

  @Get()
  @UsePipes(new ZodValidationPipe(FolderQuerySchema))
  list(@CurrentUser() user: JwtUser, @Query() q: FolderQueryDto) {
    return this.mail.list(user.sub, q);
  }

  @Get('thread/:threadId')
  thread(@CurrentUser() user: JwtUser, @Param('threadId') threadId: string) {
    return this.mail.thread(user.sub, threadId);
  }

  @Post('send')
  @UsePipes(new ZodValidationPipe(SendMailSchema))
  send(@CurrentUser() user: JwtUser, @Body() dto: SendMailDto) {
    return this.mail.send(user.sub, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mail.get(user.sub, id);
  }

  @Post(':id/flag')
  @UsePipes(new ZodValidationPipe(FlagSchema))
  flag(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: FlagDto) {
    return this.mail.flag(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mail.remove(user.sub, id);
  }
}

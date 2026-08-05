import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MailService } from './mail.service';
import { FlagSchema, type FlagDto, FolderQuerySchema, type FolderQueryDto, SendMailSchema, type SendMailDto, SaveDraftSchema, type SaveDraftDto } from './dto/mail.dto';

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
  @UsePipes(new ZodValidationPipe(z.object({
    email: z.string().email().max(254).optional(),
    phone: z.string().max(20).regex(/^[+0-9 ()-]*$/).optional(),
  }).strict()))
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

  /** Save (or update) what somebody is still writing. Idempotent by id. */
  @Post('draft')
  @UsePipes(new ZodValidationPipe(SaveDraftSchema))
  saveDraft(@CurrentUser() user: JwtUser, @Body() dto: SaveDraftDto) {
    return this.mail.saveDraft(user.sub, dto);
  }

  /** Throw a draft away. Deleted outright — Trash is for correspondence. */
  @Delete('draft/:id')
  discardDraft(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mail.discardDraft(user.sub, id);
  }

  @Post('send')
  @UsePipes(new ZodValidationPipe(SendMailSchema))
  send(@CurrentUser() user: JwtUser, @Body() dto: SendMailDto) {
    return this.mail.send(user.sub, dto);
  }

  /** Files attached to a thread (any participant may list them). */
  @Get('thread/:threadId/attachments')
  threadAttachments(@CurrentUser() user: JwtUser, @Param('threadId') threadId: string) {
    return this.mail.threadAttachments(user.sub, threadId);
  }

  /** Short-lived signed download URL for one attachment. */
  @Get('thread/:threadId/attachments/:fileId/url')
  attachmentUrl(@CurrentUser() user: JwtUser, @Param('threadId') threadId: string, @Param('fileId') fileId: string) {
    return this.mail.attachmentUrl(user.sub, threadId, fileId);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mail.get(user.sub, id);
  }

  /** POST /api/mail/:id/retry — send a rejected message again. */
  @Post(':id/retry')
  retry(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mail.retry(user.sub, id);
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

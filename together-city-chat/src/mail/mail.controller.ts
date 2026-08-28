import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MailService } from './mail.service';
import { Mira } from '../mira/mira.decorator';
import {
  FlagSchema, type FlagDto, FolderQuerySchema, type FolderQueryDto,
  SendMailSchema, type SendMailDto, SaveDraftSchema, type SaveDraftDto,
  CreateProjectSchema, type CreateProjectDto, UpdateProjectSchema, type UpdateProjectDto,
  FileThreadSchema, type FileThreadDto,
} from './dto/mail.dto';

@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Mira({
    intent: 'Tell the citizen how much mail is waiting',
    utterances: ['any new mail', 'unread mail', 'how many emails', 'do I have mail', 'my inbox'],
    risk: 'R0',
  })
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

  /* ── PROJECTS ──────────────────────────────────────────────────────────
     Declared above the `:id` routes on purpose: Nest matches in declaration
     order, and `GET /mail/projects` under `@Get(':id')` is a lookup for a
     message called "projects". */

  @Get('projects')
  projects(@CurrentUser() user: JwtUser) {
    return this.mail.projects(user.sub);
  }

  @Post('projects')
  @UsePipes(new ZodValidationPipe(CreateProjectSchema))
  createProject(@CurrentUser() user: JwtUser, @Body() dto: CreateProjectDto) {
    return this.mail.createProject(user.sub, dto);
  }

  @Post('projects/:id')
  @UsePipes(new ZodValidationPipe(UpdateProjectSchema))
  updateProject(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.mail.updateProject(user.sub, id, dto);
  }

  /** Close a room. The mail inside it returns to All Email — see the service. */
  @Delete('projects/:id')
  deleteProject(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mail.deleteProject(user.sub, id);
  }

  /**
   * Empty the Trash. Declared above the `:id` routes, or "trash" reads as a
   * message id — which is why it sits here and not beside the other deletes.
   *
   * It is the only way to get bytes back: everything else moves mail to Trash,
   * and Trash still counts against the quota.
   *
   * RESTORED 28 AUG, ON THE CONDITION ITS OWN NOTE SET. This route was parked
   * with the four lines written out in a comment and one instruction — that it
   * "belongs in the commit that lands `MailService.emptyTrash`, not before it",
   * because completing it early would have meant committing 473 lines of
   * somebody else's unfinished work, which is what caused the outage it was
   * parked during.
   *
   * `MailService.emptyTrash` landed in 25d3fc16 with eight passing tests in
   * `the-meter-has-a-way-down.spec.ts`. Nobody came back. So the meter has had
   * a tested way down and no door to it, and a citizen who filled their quota
   * had no way to get bytes back at all.
   *
   * The web app has a Trash page and no control that calls this; that half is
   * still to build. The API is no longer the thing blocking it.
   */
  @Delete('trash')
  emptyTrash(@CurrentUser() user: JwtUser) {
    return this.mail.emptyTrash(user.sub);
  }

  /** Move a whole conversation into a project, or out of one. */
  @Post('file')
  @UsePipes(new ZodValidationPipe(FileThreadSchema))
  fileThread(@CurrentUser() user: JwtUser, @Body() dto: FileThreadDto) {
    return this.mail.fileThread(user.sub, dto);
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

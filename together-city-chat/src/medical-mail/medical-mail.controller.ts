import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { Room } from '../dev/room.decorator';
import { DevPasswordGuard } from '../dev/dev-password.guard';
import { MODEL_LIMIT } from '../shared/throttles';
import { MedicalMailService } from './medical-mail.service';
import {
  FlagEmailSchema, type FlagEmailDto, ListEmailsSchema, type ListEmailsDto, MoveFromMailSchema, type MoveFromMailDto,
  ReclassifySchema, type ReclassifyDto, SenderRuleSchema, type SenderRuleDto, SettingsSchema, type SettingsDto,
} from './dto/medical-mail.dto';

/**
 * Medical Mail — every route is the signed-in citizen's own mailbox; the
 * service scopes every read and write by their id. The operator's counters
 * sit on their own controller below, behind the developer page's guard.
 */
@Controller('medical/mail')
@UseGuards(JwtAuthGuard)
export class MedicalMailController {
  constructor(private readonly mail: MedicalMailService) {}

  @Room('/medical/mail')
  @Get()
  home(@CurrentUser() user: JwtUser) { return this.mail.home(user.sub); }

  /** The rail badge: one number. Not a room route — the badge shows on every
   *  Medical Hub page, and a hidden room must not blank the rail. */
  @Get('badge')
  badge(@CurrentUser() user: JwtUser) { return this.mail.badge(user.sub); }

  @Room('/medical/mail')
  @Get('messages')
  list(@CurrentUser() user: JwtUser, @Query(new ZodValidationPipe(ListEmailsSchema)) q: ListEmailsDto) { return this.mail.list(user.sub, q); }

  @Room('/medical/mail')
  @Get('messages/:id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.mail.get(user.sub, id); }

  @Room('/medical/mail')
  @Patch('messages/:id')
  flag(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body(new ZodValidationPipe(FlagEmailSchema)) dto: FlagEmailDto) { return this.mail.flag(user.sub, id, dto); }

  @Room('/medical/mail')
  @Delete('messages/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string, @Query('forever') forever?: string) { return this.mail.remove(user.sub, id, forever === '1'); }

  @Room('/medical/mail')
  @Post('messages/:id/restore')
  restore(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.mail.restore(user.sub, id); }

  @Room('/medical/mail')
  @Post('trash/empty')
  emptyTrash(@CurrentUser() user: JwtUser) { return this.mail.emptyTrash(user.sub); }

  /** "Move to Medical / Personal", a category, "always this sender". */
  @Room('/medical/mail')
  @Throttle(MODEL_LIMIT)
  @Post('messages/:id/classify')
  reclassify(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body(new ZodValidationPipe(ReclassifySchema)) dto: ReclassifyDto) { return this.mail.reclassify(user.sub, id, dto); }

  @Room('/medical/mail')
  @Post('messages/:id/to-mail')
  toMail(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: { rememberSender?: 'medical' | 'personal' }) {
    return this.mail.moveToMail(user.sub, id, body?.rememberSender === 'medical' || body?.rememberSender === 'personal' ? body.rememberSender : undefined);
  }

  @Room('/medical/mail')
  @Throttle(MODEL_LIMIT)
  @Post('from-mail')
  fromMail(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(MoveFromMailSchema)) dto: MoveFromMailDto) { return this.mail.moveFromMail(user.sub, dto.mailMessageId, dto.rememberSender); }

  @Room('/medical/mail')
  @Post('hints/:mailMessageId/dismiss')
  dismissHint(@CurrentUser() user: JwtUser, @Param('mailMessageId') id: string, @Body() body: { rememberSender?: 'medical' | 'personal' }) {
    return this.mail.dismissHint(user.sub, id, body?.rememberSender === 'medical' || body?.rememberSender === 'personal' ? body.rememberSender : undefined);
  }

  @Room('/medical/mail')
  @Get('messages/:id/attachments/:attachmentId/url')
  attachmentUrl(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('attachmentId') a: string) { return this.mail.attachmentUrl(user.sub, id, a); }

  @Room('/medical/mail')
  @Throttle(MODEL_LIMIT)
  @Post('messages/:id/attachments/:attachmentId/save')
  saveAttachment(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('attachmentId') a: string) { return this.mail.saveAttachment(user.sub, id, a); }

  @Room('/medical/mail')
  @Throttle(MODEL_LIMIT)
  @Post('messages/:id/attachments/:attachmentId/analyze')
  analyze(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('attachmentId') a: string) { return this.mail.analyzeAttachment(user.sub, id, a); }

  @Room('/medical/mail')
  @Get('timeline')
  timeline(@CurrentUser() user: JwtUser) { return this.mail.timeline(user.sub); }

  @Room('/medical/mail')
  @Get('records/:recordId/provenance')
  provenance(@CurrentUser() user: JwtUser, @Param('recordId') id: string) { return this.mail.provenance(user.sub, id); }

  @Get('settings')
  settings(@CurrentUser() user: JwtUser) { return this.mail.settings(user.sub); }

  @Patch('settings')
  updateSettings(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(SettingsSchema)) dto: SettingsDto) { return this.mail.updateSettings(user.sub, dto); }

  @Post('rules')
  setRule(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(SenderRuleSchema)) dto: SenderRuleDto) { return this.mail.setRule(user.sub, dto); }

  @Delete('rules/:id')
  deleteRule(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.mail.deleteRule(user.sub, id); }
}

/** The founder's counters — the developer page's own lock, and nothing that
 *  is anybody's medical data comes out (see MedicalMailService.ops). */
@Controller('dev/medical-mail')
@UseGuards(JwtAuthGuard, DevPasswordGuard)
export class MedicalMailOpsController {
  constructor(private readonly mail: MedicalMailService) {}

  @Get()
  ops(@Query('days') days?: string) {
    const n = Number(days);
    return this.mail.ops(Number.isFinite(n) && n > 0 && n <= 90 ? n : 7);
  }
}

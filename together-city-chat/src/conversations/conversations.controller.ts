import { Body, Controller, Delete, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { ConversationsService } from './conversations.service';
import {
  CreateGroupDto,
  CreateGroupSchema,
  StartDirectDto,
  StartDirectSchema,
} from './dto/conversations.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  // POST /api/chat/start  → get-or-create a direct conversation
  @Post('start')
  @UsePipes(new ZodValidationPipe(StartDirectSchema))
  start(@CurrentUser() user: JwtUser, @Body() dto: StartDirectDto) {
    return this.conversations.startDirect(user.sub, dto.handle);
  }

  @Post('group')
  @UsePipes(new ZodValidationPipe(CreateGroupSchema))
  createGroup(@CurrentUser() user: JwtUser, @Body() dto: CreateGroupDto) {
    return this.conversations.createGroup(user.sub, dto);
  }

  // GET /api/chat/conversations
  @Get('conversations')
  list(@CurrentUser() user: JwtUser) {
    return this.conversations.listForUser(user.sub);
  }

  // POST /api/chat/:id/read  → clear unread for this conversation
  @Post(':id/read')
  markRead(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.markRead(user.sub, id);
  }

  /**
   * DELETE /api/chat/:id — remove this conversation from MY left panel.
   *
   * Per-participant by design: the other people in the thread keep it. A
   * non-participant gets 404 rather than 403, so conversation ids cannot be
   * probed for existence.
   */
  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.clearForUser(user.sub, id);
  }

  // POST /api/chat/:id/archive — hide from the panel, keep the history.
  @Post(':id/archive')
  archive(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.setArchived(user.sub, id, true);
  }

  // POST /api/chat/:id/unarchive
  @Post(':id/unarchive')
  unarchive(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.setArchived(user.sub, id, false);
  }

  // GET /api/chat/contacts — city directory for starting chats / groups
  @Get('contacts')
  contacts(@CurrentUser() user: JwtUser) {
    return this.conversations.contacts(user.sub);
  }
}

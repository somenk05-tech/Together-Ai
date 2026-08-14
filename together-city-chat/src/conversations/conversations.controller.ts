import { Body, Controller, Delete, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { ConversationsService } from './conversations.service';
import {
  AddMembersDto,
  AddMembersSchema,
  CreateGroupDto,
  CreateGroupSchema,
  RenameGroupDto,
  RenameGroupSchema,
  SetRoleDto,
  SetRoleSchema,
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

  // POST /api/chat/:id/unread — leave it unread on purpose.
  @Post(':id/unread')
  markUnread(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.markUnread(user.sub, id);
  }

  // GET /api/chat/:id/members — who is in this group, and what they are.
  @Get(':id/members')
  members(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.members(user.sub, id);
  }

  // POST /api/chat/:id/members — add people (admins only; each must be connected)
  @Post(':id/members')
  @UsePipes(new ZodValidationPipe(AddMembersSchema))
  addMembers(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: AddMembersDto) {
    return this.conversations.addMembers(user.sub, id, dto.memberIds);
  }

  // DELETE /api/chat/:id/members/:userId — remove somebody (never the owner)
  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.conversations.removeMember(user.sub, id, userId);
  }

  // POST /api/chat/:id/members/:userId/role — promote/demote (owner only)
  @Post(':id/members/:userId/role')
  @UsePipes(new ZodValidationPipe(SetRoleSchema))
  setRole(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('userId') userId: string, @Body() dto: SetRoleDto) {
    return this.conversations.setMemberRole(user.sub, id, userId, dto.role);
  }

  // POST /api/chat/:id/rename — a distinct path rather than PATCH :id, so the
  // one-id routes stay one shape and nothing depends on method to disambiguate.
  @Post(':id/rename')
  @UsePipes(new ZodValidationPipe(RenameGroupSchema))
  rename(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: RenameGroupDto) {
    return this.conversations.renameGroup(user.sub, id, dto.title);
  }

  // POST /api/chat/:id/leave — leave a group for good (the row is deleted)
  @Post(':id/leave')
  leave(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.leaveConversation(user.sub, id);
  }

  // GET /api/chat/contacts — city directory for starting chats / groups
  @Get('contacts')
  contacts(@CurrentUser() user: JwtUser) {
    return this.conversations.contacts(user.sub);
  }
}

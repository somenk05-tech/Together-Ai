import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MessagesService } from './messages.service';
import {
  DeleteMessageDto,
  DeleteMessageSchema,
  EditMessageDto,
  EditMessageSchema,
  ListMessagesDto,
  ListMessagesSchema,
  SearchMessagesDto,
  SearchMessagesSchema,
  SendMessageDto,
  SendMessageSchema,
  PinMessageDto,
  PinMessageSchema,
  ReactMessageDto,
  ReactMessageSchema,
  StarMessageDto,
  StarMessageSchema,
} from './dto/messages.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  // GET /api/chat/:id/messages?cursor=&limit=
  @Get('chat/:id/messages')
  list(
    @CurrentUser() user: JwtUser,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const dto: ListMessagesDto = ListMessagesSchema.parse({ conversationId, cursor, limit });
    return this.messages.list(user.sub, dto);
  }

  // POST /api/messages
  @Post('messages')
  @UsePipes(new ZodValidationPipe(SendMessageSchema))
  send(@CurrentUser() user: JwtUser, @Body() dto: SendMessageDto) {
    return this.messages.send(user.sub, dto);
  }

  // PUT /api/messages/:id
  @Put('messages/:id')
  @UsePipes(new ZodValidationPipe(EditMessageSchema))
  edit(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: EditMessageDto) {
    return this.messages.edit(user.sub, id, dto);
  }

  // DELETE /api/messages/:id
  @Delete('messages/:id')
  @UsePipes(new ZodValidationPipe(DeleteMessageSchema))
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: DeleteMessageDto) {
    return this.messages.remove(user.sub, id, dto);
  }

  // Read/delivered receipts travel over the socket (chat.gateway onRead /
  // onDelivered) — the REST duplicates nothing called were deleted 1 Aug.

  // GET /api/messages/search
  @Get('messages/search')
  search(@CurrentUser() user: JwtUser, @Query() query: Record<string, string>) {
    const dto: SearchMessagesDto = SearchMessagesSchema.parse(query);
    return this.messages.search(user.sub, dto);
  }

  // POST /api/messages/:id/star — keep it, or stop keeping it.
  @Post('messages/:id/star')
  @UsePipes(new ZodValidationPipe(StarMessageSchema))
  star(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: StarMessageDto) {
    return this.messages.setStarred(user.sub, id, dto.on);
  }

  // POST /api/messages/:id/react — one of the six, or null to clear yours.
  @Post('messages/:id/react')
  @UsePipes(new ZodValidationPipe(ReactMessageSchema))
  react(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ReactMessageDto) {
    return this.messages.setReaction(user.sub, id, dto.emoji);
  }

  // POST /api/messages/:id/pin — one pinned message per conversation.
  @Post('messages/:id/pin')
  @UsePipes(new ZodValidationPipe(PinMessageSchema))
  pin(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PinMessageDto) {
    return this.messages.setPinned(user.sub, id, dto.on);
  }

  // GET /api/chat/:id/pinned — what is pinned in this room, if anything.
  @Get('chat/:id/pinned')
  pinned(@CurrentUser() user: JwtUser, @Param('id') conversationId: string) {
    return this.messages.pinnedIn(user.sub, conversationId);
  }

  // GET /api/messages/:id/info — declared AFTER messages/search on purpose:
  // Nest matches in declaration order and a bare `:id` would otherwise swallow
  // the literal path. Sender-only; the service refuses anybody else.
  @Get('messages/:id/info')
  info(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.messages.info(user.sub, id);
  }
}

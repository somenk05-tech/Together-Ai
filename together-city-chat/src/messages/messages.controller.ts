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
  AckDto,
  AckSchema,
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

  // POST /api/messages/read
  @Post('messages/read')
  @UsePipes(new ZodValidationPipe(AckSchema))
  read(@CurrentUser() user: JwtUser, @Body() dto: AckDto) {
    return this.messages.markRead(user.sub, dto.messageIds);
  }

  // POST /api/messages/delivered
  @Post('messages/delivered')
  @UsePipes(new ZodValidationPipe(AckSchema))
  delivered(@CurrentUser() user: JwtUser, @Body() dto: AckDto) {
    return this.messages.markDelivered(user.sub, dto.messageIds);
  }

  // GET /api/messages/search
  @Get('messages/search')
  search(@CurrentUser() user: JwtUser, @Query() query: Record<string, string>) {
    const dto: SearchMessagesDto = SearchMessagesSchema.parse(query);
    return this.messages.search(user.sub, dto);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
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

/**
 * PER-ROUTE CEILINGS, KEYED ON THE ACCOUNT (fifth audit, 29 Aug).
 *
 * There were none. `grep Throttle src/messages src/conversations src/chat`
 * returned nothing, so sending, listing, searching and reacting all drew on
 * the one global 120/minute — which was also counted per IP address, so a
 * shared office network split it between everybody on it and a rotating
 * address had no ceiling at all. The dating hub has had named limits per route
 * since 28 Aug; the chat these matches actually happen in had none.
 *
 * SEND MATCHES THE SOCKET, which was the number the gateway's own comment
 * claimed the HTTP path already used. It did not: the socket ceiling is 60 a
 * minute (`chat.gateway.ts`) and HTTP was 120 shared with every other read.
 * One number, in both doors.
 *
 * SEARCH IS THE TIGHT ONE because of what it costs rather than what it does:
 * `contains … insensitive` across every conversation the citizen is in, with
 * no index behind it.
 */
const SEND_LIMIT = { default: { limit: 60, ttl: 60_000 } };
const SEARCH_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const WRITE_LIMIT = { default: { limit: 120, ttl: 60_000 } };
/* OPENING A SNAP IS A READ OF BYTES, and it has its own ceiling because it is
   the one route in this controller that streams a file rather than a row.
   Thirty a minute is far more than a person taps and few enough that the door
   is not a way to pull the vault through the API. Every open past a budget is
   refused before the bucket is touched, so a loop cannot even reach storage —
   this bounds the ones that CAN. */
const SNAP_LIMIT = { default: { limit: 30, ttl: 60_000 } };

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
  @Throttle(SEND_LIMIT)
  @UsePipes(new ZodValidationPipe(SendMessageSchema))
  send(@CurrentUser() user: JwtUser, @Body() dto: SendMessageDto) {
    return this.messages.send(user.sub, dto);
  }

  // PUT /api/messages/:id
  @Put('messages/:id')
  @Throttle(WRITE_LIMIT)
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
  @Throttle(SEARCH_LIMIT)
  search(@CurrentUser() user: JwtUser, @Query() query: Record<string, string>) {
    const dto: SearchMessagesDto = SearchMessagesSchema.parse(query);
    return this.messages.search(user.sub, dto);
  }

  // POST /api/messages/:id/star — keep it, or stop keeping it.
  @Post('messages/:id/star')
  @Throttle(WRITE_LIMIT)
  @UsePipes(new ZodValidationPipe(StarMessageSchema))
  star(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: StarMessageDto) {
    return this.messages.setStarred(user.sub, id, dto.on);
  }

  // POST /api/messages/:id/react — one of the six, or null to clear yours.
  @Post('messages/:id/react')
  @Throttle(WRITE_LIMIT)
  @UsePipes(new ZodValidationPipe(ReactMessageSchema))
  react(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ReactMessageDto) {
    return this.messages.setReaction(user.sub, id, dto.emoji);
  }

  // POST /api/messages/:id/pin — one pinned message per conversation.
  @Post('messages/:id/pin')
  @Throttle(WRITE_LIMIT)
  @UsePipes(new ZodValidationPipe(PinMessageSchema))
  pin(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PinMessageDto) {
    return this.messages.setPinned(user.sub, id, dto.on);
  }

  // GET /api/chat/:id/pinned — what is pinned in this room, if anything.
  @Get('chat/:id/pinned')
  pinned(@CurrentUser() user: JwtUser, @Param('id') conversationId: string) {
    return this.messages.pinnedIn(user.sub, conversationId);
  }

  /**
   * GET /api/messages/:id/snap — the photograph, and the view it costs.
   *
   * NOT A REDIRECT AND NOT A SIGNED URL, which is the decision this route is.
   * A signed link is a bearer credential for as long as its window: hand one
   * to a recipient and a "View Once" can be re-fetched for the next sixty
   * seconds by anybody they pass the string to. Streaming the bytes means the
   * view is spent at the exact moment they leave, which is the only version of
   * this promise that is true.
   *
   * `no-store`, and it has to be: a snap in any cache — the browser's, an
   * intermediary's, the back button's — is a snap that outlived its view.
   * `Cross-Origin-Resource-Policy` for the reason the dating photo route
   * carries it: helmet's same-origin default silently discards a perfectly
   * good 200 when api.togethercity.app answers an <img> on togethercity.app.
   *
   * One 404 for every refusal — no such message, not a member, expired, spent,
   * your own — because a route that distinguishes them tells whoever is asking
   * something about a photograph they may not see.
   */
  @Get('messages/:id/snap')
  @Throttle(SNAP_LIMIT)
  async snap(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const found = await this.messages.openSnap(user.sub, id);
    if (!found) throw new NotFoundException('That photo is not available.');
    res.set({
      'Content-Type': found.contentType,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      ...(found.contentLength ? { 'Content-Length': String(found.contentLength) } : {}),
    });
    return new StreamableFile(found.body);
  }

  // POST /api/messages/:id/snap/keep — take the sender up on "keep in chat".
  @Post('messages/:id/snap/keep')
  @Throttle(WRITE_LIMIT)
  keepSnap(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.messages.keepSnap(user.sub, id);
  }

  /* POST /api/messages/:id/snap/screenshot — a recipient's device reporting a
     screen capture. THE WEB APP NEVER CALLS THIS: no browser can know. The
     route exists for the Capacitor shells, which can. See the service method
     for the whole argument, including why a browser heuristic would be worse
     than nothing. */
  @Post('messages/:id/snap/screenshot')
  @Throttle(WRITE_LIMIT)
  reportSnapShot(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.messages.reportSnapShot(user.sub, id);
  }

  // GET /api/messages/:id/info — declared AFTER messages/search on purpose:
  // Nest matches in declaration order and a bare `:id` would otherwise swallow
  // the literal path. Sender-only; the service refuses anybody else.
  @Get('messages/:id/info')
  info(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.messages.info(user.sub, id);
  }
}

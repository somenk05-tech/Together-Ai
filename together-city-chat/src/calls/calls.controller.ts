import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { CallsService } from './calls.service';
import { ListCallsSchema, StartCallSchema, type ListCallsDto, type StartCallDto } from './dto/calls.dto';

/**
 * Setup and teardown over HTTP; the handshake itself goes over the socket
 * (ChatGateway), because ICE candidates arrive in a trickle and a REST round
 * trip per candidate would add a second to every connection.
 */
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  /**
   * GET /api/calls/ice — the STUN/TURN list, plus an honest note when no relay
   * is configured. Declared before ':id' so 'ice' is not read as a call id.
   */
  @Get('ice')
  ice() {
    return this.calls.ice();
  }

  /** GET /api/calls — your call history, newest first. */
  @Get()
  @UsePipes(new ZodValidationPipe(ListCallsSchema))
  list(@CurrentUser() user: JwtUser, @Query() dto: ListCallsDto) {
    return this.calls.list(user.sub, dto);
  }

  /** POST /api/calls — ring a conversation, or join the call already ringing in it. */
  @Post()
  @UsePipes(new ZodValidationPipe(StartCallSchema))
  start(@CurrentUser() user: JwtUser, @Body() dto: StartCallDto) {
    return this.calls.start(user.sub, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.get(user.sub, id);
  }

  /** Answer, or rejoin after a dropped connection. */
  @Post(':id/join')
  join(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.join(user.sub, id);
  }

  /** Hang up or decline — for you. The call ends only if that empties it. */
  @Post(':id/leave')
  leave(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.leave(user.sub, id);
  }

  /** End it for everyone. Only the person who started the call may. */
  @Post(':id/end')
  end(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.end(user.sub, id);
  }
}

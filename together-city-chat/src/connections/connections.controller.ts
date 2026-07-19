import { Body, Controller, Get, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { ConnectionsService } from './connections.service';
import {
  RequestConnectionDto,
  RequestConnectionSchema,
  RespondConnectionDto,
  RespondConnectionSchema,
} from './dto/connections.dto';

@Controller('connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Post('request')
  @UsePipes(new ZodValidationPipe(RequestConnectionSchema))
  request(@CurrentUser() user: JwtUser, @Body() dto: RequestConnectionDto) {
    return this.connections.request(user.sub, dto);
  }

  @Post('respond')
  @UsePipes(new ZodValidationPipe(RespondConnectionSchema))
  respond(@CurrentUser() user: JwtUser, @Body() dto: RespondConnectionDto) {
    return this.connections.respond(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('status') status?: string) {
    return this.connections.listForUser(user.sub, status);
  }
}

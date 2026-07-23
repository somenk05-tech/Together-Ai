import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { ConnectionsService } from './connections.service';
import { ENABLED_HUBS } from './hubs.registry';
import {
  RequestConnectionDto,
  RequestConnectionSchema,
  RespondConnectionDto,
  RespondConnectionSchema,
  UpdateModulesDto,
  UpdateModulesSchema,
  UpdatePermissionsDto,
  UpdatePermissionsSchema,
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

  /** Master hubs registry — the UI reads this to render toggles, so adding a hub
   *  never requires a frontend code change. */
  @Get('hubs')
  hubs() {
    return ENABLED_HUBS();
  }

  /** Universal Connection Model — update module permissions on ONE record. */
  @Patch(':id/modules')
  @UsePipes(new ZodValidationPipe(UpdateModulesSchema))
  updateModules(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateModulesDto) {
    return this.connections.updateModules(user.sub, id, dto);
  }

  /** SINGLE SOURCE OF TRUTH write path used by the People checkbox grid.
   *  Body: { hubPermissions: { medical: true, nutrition: false, … } }. */
  @Patch(':id/permissions')
  @UsePipes(new ZodValidationPipe(UpdatePermissionsSchema))
  setPermissions(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdatePermissionsDto) {
    return this.connections.setPermissions(user.sub, id, dto.hubPermissions, dto.relationship);
  }

  /** Remove — instantly disconnects from ALL Together City hubs. */
  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.connections.remove(user.sub, id);
  }

  /** Everyone connected for a given module — hubs display, never re-invite. */
  @Get('module/:key')
  forModule(@CurrentUser() user: JwtUser, @Param('key') key: string) {
    return this.connections.listForModule(user.sub, key);
  }
}

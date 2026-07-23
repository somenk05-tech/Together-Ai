import { Body, Controller, Get, Param, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { ConnectionsService } from './connections.service';
import { HubMemberPatchDto, HubMemberPatchSchema } from './dto/connections.dto';

/**
 * Generic per-hub Members API. Every hub (Nutrition, Medical, Financial, Travel,
 * Fitness, Social, Entertainment) is served by the SAME endpoints — there is no
 * per-hub membership table. Both read and write go through the single connection
 * permission store (Connection.modulesJson), so the People page and each hub
 * page can never drift.
 *
 *   GET   /hub/:hub/members            → everyone connected for that hub
 *   PATCH /hub/:hub/members            → { connectionId, enabled } add/remove one
 */
@Controller('hub')
@UseGuards(JwtAuthGuard)
export class HubMembersController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get(':hub/members')
  members(@CurrentUser() user: JwtUser, @Param('hub') hub: string) {
    return this.connections.listForModule(user.sub, hub);
  }

  @Patch(':hub/members')
  @UsePipes(new ZodValidationPipe(HubMemberPatchSchema))
  patch(@CurrentUser() user: JwtUser, @Param('hub') hub: string, @Body() dto: HubMemberPatchDto) {
    return this.connections.setHubMember(user.sub, hub, dto.connectionId, dto.enabled);
  }
}

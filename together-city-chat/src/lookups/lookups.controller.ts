import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LookupsService } from './lookups.service';

/** Standardized dropdown data: GET /lookups/:category?parent=&q=&limit= */
@Controller('lookups')
@UseGuards(JwtAuthGuard)
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get(':category')
  list(
    @Param('category') category: string,
    @Query('parent') parent?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.lookups.list(category, parent, q, limit ? Number(limit) : undefined);
  }
}

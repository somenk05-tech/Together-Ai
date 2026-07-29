import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { ThoughtsService } from './thoughts.service';
import {
  CreateThoughtSchema, ListThoughtsSchema, UpdateThoughtSchema,
  type CreateThoughtDto, type ListThoughtsDto, type UpdateThoughtDto,
} from './dto/thoughts.dto';

@Controller('thoughts')
@UseGuards(JwtAuthGuard)
export class ThoughtsController {
  constructor(private readonly thoughts: ThoughtsService) {}

  /** GET /api/thoughts — your journal, newest first, cursor-paginated. */
  @Get()
  @UsePipes(new ZodValidationPipe(ListThoughtsSchema))
  list(@CurrentUser() user: JwtUser, @Query() dto: ListThoughtsDto) {
    return this.thoughts.list(user.sub, dto);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateThoughtSchema))
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateThoughtDto) {
    return this.thoughts.create(user.sub, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.thoughts.get(user.sub, id);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(UpdateThoughtSchema))
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateThoughtDto) {
    return this.thoughts.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.thoughts.remove(user.sub, id);
  }
}

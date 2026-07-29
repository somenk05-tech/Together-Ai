import { Body, Controller, Delete, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { AvatarsService } from './avatars.service';
import { CreateAvatarSchema, type CreateAvatarDto } from './dto/avatars.dto';

@Controller('avatars')
@UseGuards(JwtAuthGuard)
export class AvatarsController {
  constructor(private readonly avatars: AvatarsService) {}

  /**
   * GET /api/avatars/options — the whole menu, plus which kind of thing will
   * draw it, so the UI can say so before a citizen commits. Declared before
   * ':id' so 'options' is never read as an avatar id.
   */
  @Get('options')
  options() {
    return this.avatars.options();
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.avatars.list(user.sub);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateAvatarSchema))
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAvatarDto) {
    return this.avatars.create(user.sub, dto);
  }

  /**
   * POST /api/avatars/preview — draw the choices without keeping anything.
   * Declared before ':id' for the same reason 'options' is.
   */
  @Post('preview')
  @UsePipes(new ZodValidationPipe(CreateAvatarSchema))
  preview(@Body() dto: CreateAvatarDto) {
    return this.avatars.preview(dto);
  }

  /** Stop using any avatar and go back to your photo. */
  @Post('deselect')
  deselect(@CurrentUser() user: JwtUser) {
    return this.avatars.deselect(user.sub);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.avatars.get(user.sub, id);
  }

  /** A URL an `<img>` can use — signed link or data URL, one field either way. */
  @Get(':id/asset')
  asset(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.avatars.asset(user.sub, id);
  }

  @Post(':id/select')
  select(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.avatars.select(user.sub, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.avatars.remove(user.sub, id);
  }
}

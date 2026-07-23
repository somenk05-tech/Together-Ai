import { Body, Controller, Get, Param, Patch, Query, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ProfileService } from './profile.service';
import { MasterProfileService, type SharedFields } from './master-profile.service';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly masterProfile: MasterProfileService,
  ) {}

  /** The Master Profile — single source of truth for shared user information. */
  @Get('master')
  master(@CurrentUser() user: JwtUser) {
    return this.masterProfile.get(user.sub);
  }

  /** One platform-wide profile-completion score + per-hub breakdown. */
  @Get('completion')
  completion(@CurrentUser() user: JwtUser) {
    return this.masterProfile.completion(user.sub);
  }

  /** Update shared fields — propagates to every hub that duplicates them. */
  @Patch('master')
  @UsePipes(new ZodValidationPipe(z.object({
    gender: z.enum(['male', 'female', 'nonbinary', 'other']).nullable().optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    timeOfBirth: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    birthCountry: z.string().max(60).nullable().optional(),
    birthState: z.string().max(60).nullable().optional(),
    birthCity: z.string().max(80).nullable().optional(),
    country: z.string().max(60).nullable().optional(),
    state: z.string().max(60).nullable().optional(),
    city: z.string().max(80).nullable().optional(),
    timeZone: z.string().max(60).nullable().optional(),
    languages: z.string().max(300).nullable().optional(),
    heightCm: z.number().int().min(50).max(272).nullable().optional(),
    weightKg: z.number().int().min(20).max(400).nullable().optional(),
    occupation: z.string().max(80).nullable().optional(),
    phone: z.string().max(20).nullable().optional(),
  })))
  async updateMaster(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    const patch: SharedFields = {
      ...body,
      dateOfBirth: typeof body.dateOfBirth === 'string' ? new Date(body.dateOfBirth + 'T00:00:00.000Z') : (body.dateOfBirth as null | undefined),
    } as SharedFields;
    await this.masterProfile.syncShared(user.sub, patch, 'master-profile-page');
    return this.masterProfile.get(user.sub);
  }

  @Get('summary')
  summary(@CurrentUser() user: JwtUser) {
    return this.profile.summary(user.sub);
  }

  @Patch('section')
  @UsePipes(new ZodValidationPipe(z.object({
    key: z.string().min(1).max(64).regex(/^[a-z0-9_.-]+$/i),
    value: z.string().max(20_000),
  })))
  updateSection(@CurrentUser() user: JwtUser, @Body() body: { key: string; value: string }) {
    return this.profile.updateSection(user.sub, body.key, body.value);
  }

  // ── Social profile (My Profile page) ──
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.profile.me(user.sub);
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(z.object({
    name: z.string().max(80).optional(),
    handle: z.string().min(3).max(30).regex(/^[a-z0-9_.]+$/i).optional(),
    bio: z.string().max(500).optional(),
    city: z.string().max(80).optional(),
    website: z.string().max(200).optional(),
  }).strict()))
  update(@CurrentUser() user: JwtUser, @Body() body: { name?: string; handle?: string; bio?: string; city?: string; website?: string }) {
    return this.profile.updateProfile(user.sub, body ?? {});
  }

  @Get('posts')
  posts(@CurrentUser() user: JwtUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.profile.myPosts(user.sub, cursor, limit ? Number(limit) : undefined);
  }

  // ── People (typed search by handle/name) + view a citizen's public profile ──
  @Get('people/search')
  search(@CurrentUser() user: JwtUser, @Query('q') q: string) {
    return this.profile.searchPeople(user.sub, q ?? '');
  }

  @Get('user/:handle')
  publicProfile(@CurrentUser() user: JwtUser, @Param('handle') handle: string) {
    return this.profile.publicProfile(user.sub, handle);
  }
}

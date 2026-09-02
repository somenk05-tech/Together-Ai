import { Body, Controller, Delete, Get, Param, Patch, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { UNDER_AGE_MESSAGE, isAdult } from '../shared/age';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ProfileService } from './profile.service';
import { MasterProfileService, type SharedFields } from './master-profile.service';
import { CityProfilesService } from './city-profiles';
import { declaredHealthPatch } from './master-health-conditions';
import { DESIGNABLE_HUBS } from './design-your-services';

import { Mira } from '../mira/mira.decorator';
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly masterProfile: MasterProfileService,
    private readonly cityProfiles: CityProfilesService,
  ) {}

  /** The Master Profile — single source of truth for shared user information. */
  @Mira({
    intent: 'Read the citizen’s own profile',
    utterances: ['what do you know about me', 'my profile', 'my details', 'who am I to you'],
    risk: 'R0',
  })
  @Get('master')
  master(@CurrentUser() user: JwtUser) {
    return this.masterProfile.get(user.sub);
  }

  /**
   * GET /api/profile/city — every store the city holds about this citizen.
   *
   * One request, one panel per store, each field carrying whether it descends
   * from the Master Profile or belongs to the hub. It exists because the page
   * named after somebody's record could describe only the seven boxes it owns,
   * and a citizen wanting the obvious answer — what do you actually have on me
   * — had to open fourteen pages to assemble it.
   *
   * DELIBERATELY READ-ONLY. There is no PATCH beside it and there should not
   * be: a field is owned by exactly one place, and a second editor for a hub's
   * fields on the page whose whole argument is against duplicate copies would
   * be the defect wearing the fix's clothes. Every panel carries the door to
   * the hub that does own the writing.
   */
  @Mira({
    intent: 'List every profile the city holds for the citizen',
    utterances: ['what data do you have on me', 'all my profiles', 'everything you know about me', 'my profiles across the city'],
    risk: 'R0',
  })
  @Get('city')
  cityProfilesView(@CurrentUser() user: JwtUser) {
    return this.cityProfiles.get(user.sub);
  }

  /** The address book — home, work, other; the legacy line answers as home. */
  @Get('addresses')
  addresses(@CurrentUser() user: JwtUser) {
    return this.masterProfile.addresses(user.sub);
  }

  /** Forget one saved address. Writing happens at the order checkout, where
   *  the consent tick is — there is deliberately no POST here. */
  @Delete('addresses/:label')
  forgetAddress(@CurrentUser() user: JwtUser, @Param('label') label: string) {
    return this.masterProfile.forgetAddress(user.sub, label);
  }

  /** One platform-wide profile-completion score + per-hub breakdown. */
  @Mira({
    intent: 'Say what is still missing from the citizen’s profile',
    utterances: ['what is missing from my profile', 'is my profile complete', 'what else do you need'],
    risk: 'R0',
  })
  @Get('completion')
  completion(@CurrentUser() user: JwtUser) {
    return this.masterProfile.completion(user.sub);
  }

  /**
   * GET /api/profile/health-score — a wellness summary of recorded measurements.
   *
   * Returns `computed`, `incomplete` or `unavailable` — never a fabricated
   * number, and never zero because something was not filled in.
   */
  @Mira({
    intent: 'Tell the citizen their health score',
    utterances: ['my health score', 'how healthy am I', 'whats my score'],
    risk: 'R0',
  })
  @Get('health-score')
  healthScore(@CurrentUser() user: JwtUser) {
    return this.masterProfile.healthScore(user.sub);
  }

  /** Update shared fields — propagates to every hub that duplicates them. */
  @Patch('master')
  @UsePipes(new ZodValidationPipe(z.object({
    gender: z.enum(['male', 'female', 'nonbinary', 'other']).nullable().optional(),
    // Two questions, not one (p2). sexAtBirth is clinical and private;
    // genderIdentity is social and shown. See profile/sex-and-gender.ts.
    sexAtBirth: z.enum(['male', 'female', 'intersex', 'preferNotToSay']).nullable().optional(),
    genderIdentity: z.enum(['male', 'female', 'nonBinary', 'other']).nullable().optional(),
    genderIdentityOther: z.string().trim().max(40).nullable().optional(),
    // Editable by its owner, like every other field on this page. Asked once at
    // the door is not the same as fixed forever.
    orientation: z.enum(['straight', 'gay', 'lesbian', 'bisexual', 'pansexual', 'asexual', 'queer', 'other', 'preferNotToSay']).nullable().optional(),
    orientationOther: z.string().trim().max(40).nullable().optional(),
    /** The version the client believes it is editing. Optional — the hub
     *  services write shared fields without ever having read the profile, and
     *  refusing them would break saving from Nutrition, Fitness and the rest. */
    expectedVersion: z.number().int().nonnegative().optional(),
    // 18+ HERE TOO, or the city rule is one save away from being undone: this
    // endpoint took any date at all, wrote it to the master record, and fanned
    // it out to every hub. An account created at 18 could become 13 on the next
    // PATCH. Null stays allowed — clearing a date is not claiming an age.
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((d) => isAdult(d), { message: UNDER_AGE_MESSAGE })
      .nullable().optional(),
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
    // The eight ABO/Rh groups, the Bombay phenotype in both Rh forms, or the
    // citizen saying they do not know. Anything else is refused rather than
    // stored: this column is only ever their own answer.
    bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'hh+', 'hh-', 'unknown']).nullable().optional(),
    // The citizen's own answer about their life, from a closed list. Anything
    // else is refused rather than stored.
    relationshipStatus: z.enum(['single', 'inRelationship', 'engaged', 'married',
      'separated', 'divorced', 'widowed', 'preferNotToSay']).nullable().optional(),
    // The twelve conditions a citizen can declare about themselves, and the
    // two qualifiers that have rules branching on them. Written out here and
    // pinned against shared/health-conditions.ts by
    // master-health-conditions.spec.ts, which fails on drift in either
    // direction — the pattern blood group and relationship status established.
    //
    // An array, not a csv: the wire carries what the citizen ticked, and
    // exactly one function decides how that becomes three column values.
    healthConditions: z.array(z.enum(['diabetes', 'hypertension', 'highCholesterol',
      'kidney', 'fattyLiver', 'gout', 'pcos', 'thyroid', 'anaemia', 'jointPain',
      'pregnancy', 'breastfeeding'])).max(12).nullable().optional(),
    pregnancyTrimester: z.enum(['first', 'second', 'third', 'unstated']).nullable().optional(),
    kidneyStage: z.enum(['early', 'late', 'dialysis', 'unstated']).nullable().optional(),
  })))
  async updateMaster(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    const patch: SharedFields = {
      ...body,
      // The three health columns move together or not at all, and one
      // function decides how: an array of keys off the wire becomes csv,
      // and a qualifier whose condition is not ticked is cleared rather
      // than left behind. See master-health-conditions.ts.
      ...declaredHealthPatch(body),
      dateOfBirth: typeof body.dateOfBirth === 'string' ? new Date(body.dateOfBirth + 'T00:00:00.000Z') : (body.dateOfBirth as null | undefined),
    } as SharedFields;
    const { expectedVersion, ...fields } = patch as typeof patch & { expectedVersion?: number };
    await this.masterProfile.syncShared(user.sub, fields, 'master-profile-page', { expectedVersion });
    return this.masterProfile.get(user.sub);
  }

  /** DESIGN YOUR SERVICES — the hubs this citizen has switched off. Null,
   *  empty and corrupt all read as the whole city; see design-your-services.ts. */
  @Get('services')
  services(@CurrentUser() user: JwtUser) {
    return this.profile.services(user.sub);
  }

  /** Replace the citizen's design. The whole list travels every time — a
   *  toggle that can PATCH one key is a toggle that can store half an answer.
   *  A key outside the designable list is refused rather than stored, so a
   *  retired hub can never brick a saved design. */
  @Put('services')
  @UsePipes(new ZodValidationPipe(z.object({
    hidden: z.array(z.enum(DESIGNABLE_HUBS)).max(DESIGNABLE_HUBS.length),
  }).strict()))
  designServices(@CurrentUser() user: JwtUser, @Body() body: { hidden: string[] }) {
    return this.profile.designServices(user.sub, body.hidden);
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

  // Save the author's custom drag-to-arrange order for their profile grid.
  @Patch('posts/order')
  reorderPosts(@CurrentUser() user: JwtUser, @Body() body: { order?: string[] }) {
    return this.profile.reorderPosts(user.sub, body?.order ?? []);
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

  // Read-only grid of another citizen's posts (audience/block gated).
  @Get('user/:handle/posts')
  publicPosts(@CurrentUser() user: JwtUser, @Param('handle') handle: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.profile.publicPosts(user.sub, handle, cursor, limit ? Number(limit) : undefined);
  }
}

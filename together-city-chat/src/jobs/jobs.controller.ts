import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { JobsService } from './jobs.service';
import {
  UploadResumeSchema, type UploadResumeDto,
  SaveJobProfileSchema, type SaveJobProfileDto,
  ApplySchema, type ApplyDto,
  PostJobSchema, type PostJobDto,
  UpdateApplicationStatusSchema, type UpdateApplicationStatusDto,
  CvEntrySchema, type CvEntryDto,
  SetEntryHiddenSchema, type SetEntryHiddenDto,
  ReorderEntriesSchema, type ReorderEntriesDto,
  CareerPreferencesSchema, type CareerPreferencesDto,
  VisibilitySchema, type VisibilityDto,
} from './dto/jobs.dto';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.jobs.getProfile(user.sub);
  }

  @Post('resume')
  @UsePipes(new ZodValidationPipe(UploadResumeSchema))
  uploadResume(@CurrentUser() user: JwtUser, @Body() dto: UploadResumeDto) {
    return this.jobs.uploadResume(user.sub, dto);
  }

  /** Their document, gone — file, extracted text and name. The rest of the
   *  profile survives; they may still want to be matched on what they typed. */
  @Delete('resume')
  deleteResume(@CurrentUser() user: JwtUser) {
    return this.jobs.deleteResume(user.sub);
  }

  @Put('profile')
  @UsePipes(new ZodValidationPipe(SaveJobProfileSchema))
  saveProfile(@CurrentUser() user: JwtUser, @Body() dto: SaveJobProfileDto) {
    return this.jobs.saveProfile(user.sub, dto);
  }

  // ── the professional record: jobs, degrees, projects, awards, languages ──
  //
  // No GET here on purpose. `GET /jobs/profile` already returns every entry
  // grouped by kind alongside the section order, and a second endpoint
  // returning the same rows flat is a second thing to keep consistent for a
  // screen that does not exist. It comes back the day one needs it.
  @Post('entries')
  @UsePipes(new ZodValidationPipe(CvEntrySchema))
  addEntry(@CurrentUser() user: JwtUser, @Body() dto: CvEntryDto) {
    return this.jobs.upsertEntry(user.sub, dto);
  }

  /** Declared before `entries/:id` so the literal segment wins the match — a
   *  reorder posted to the parameterised route would be read as an entry id. */
  @Post('entries/reorder')
  @UsePipes(new ZodValidationPipe(ReorderEntriesSchema))
  reorderEntries(@CurrentUser() user: JwtUser, @Body() dto: ReorderEntriesDto) {
    return this.jobs.reorderEntries(user.sub, dto);
  }

  @Put('entries/:id')
  @UsePipes(new ZodValidationPipe(CvEntrySchema))
  editEntry(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: CvEntryDto) {
    return this.jobs.upsertEntry(user.sub, dto, id);
  }

  /** Hidden, not deleted. Two different statements, one of them destructive. */
  @Patch('entries/:id/hidden')
  @UsePipes(new ZodValidationPipe(SetEntryHiddenSchema))
  setEntryHidden(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SetEntryHiddenDto) {
    return this.jobs.setEntryHidden(user.sub, id, dto.hidden);
  }

  @Delete('entries/:id')
  deleteEntry(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.jobs.deleteEntry(user.sub, id);
  }

  @Put('preferences')
  @UsePipes(new ZodValidationPipe(CareerPreferencesSchema))
  savePreferences(@CurrentUser() user: JwtUser, @Body() dto: CareerPreferencesDto) {
    return this.jobs.saveCareerPreferences(user.sub, dto);
  }

  @Put('visibility')
  @UsePipes(new ZodValidationPipe(VisibilitySchema))
  saveVisibility(@CurrentUser() user: JwtUser, @Body() dto: VisibilityDto) {
    return this.jobs.saveVisibility(user.sub, dto);
  }

  @Get('completion')
  completion(@CurrentUser() user: JwtUser) {
    return this.jobs.profileCompletion(user.sub);
  }

  @Get('matches')
  matches(@CurrentUser() user: JwtUser) {
    return this.jobs.matches(user.sub);
  }

  @Get('applications')
  applications(@CurrentUser() user: JwtUser) {
    return this.jobs.applications(user.sub);
  }

  @Post('applications')
  @UsePipes(new ZodValidationPipe(ApplySchema))
  apply(@CurrentUser() user: JwtUser, @Body() dto: ApplyDto) {
    return this.jobs.apply(user.sub, dto);
  }

  /** Candidate withdraws their own application. */
  @Delete('applications/:id')
  withdraw(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.jobs.withdraw(user.sub, id);
  }

  /** Recruiter shortlists / rejects an applicant on one of THEIR postings. */
  @Patch('applications/:id/status')
  @UsePipes(new ZodValidationPipe(UpdateApplicationStatusSchema))
  updateApplicationStatus(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateApplicationStatusDto) {
    return this.jobs.updateApplicationStatus(user.sub, id, dto.status);
  }

  // ── employer side ──
  @Post('postings')
  @UsePipes(new ZodValidationPipe(PostJobSchema))
  postJob(@CurrentUser() user: JwtUser, @Body() dto: PostJobDto) {
    return this.jobs.postJob(user.sub, dto);
  }

  @Get('postings')
  myPostings(@CurrentUser() user: JwtUser) {
    return this.jobs.myPostings(user.sub);
  }

  @Get('postings/:id/applicants')
  applicants(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.jobs.applicants(user.sub, id);
  }

  @Put('postings/:id')
  @UsePipes(new ZodValidationPipe(PostJobSchema))
  editPosting(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PostJobDto) {
    return this.jobs.updatePosting(user.sub, id, dto);
  }

  @Delete('postings/:id')
  deletePosting(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.jobs.deletePosting(user.sub, id);
  }
}

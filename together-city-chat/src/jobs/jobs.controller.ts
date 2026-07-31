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

  @Put('profile')
  @UsePipes(new ZodValidationPipe(SaveJobProfileSchema))
  saveProfile(@CurrentUser() user: JwtUser, @Body() dto: SaveJobProfileDto) {
    return this.jobs.saveProfile(user.sub, dto);
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

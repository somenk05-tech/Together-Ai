import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MedicalService } from './medical.service';
import { SaveBloodTestSchema, type SaveBloodTestDto } from './dto/medical.dto';
import { Mira } from '../mira/mira.decorator';
import {
  AddRecordSchema, type AddRecordDto,
  UploadDocSchema, type UploadDocDto,
  ExtractBloodSchema, type ExtractBloodDto,
  IngestBloodSchema, type IngestBloodDto,
  BookConsultSchema, type BookConsultDto,
  ConsentSchema, type ConsentDto,
} from './dto/records.dto';

@Controller('medical')
@UseGuards(JwtAuthGuard)
export class MedicalController {
  constructor(private readonly medical: MedicalService) {}

  @Post('blood-tests')
  @UsePipes(new ZodValidationPipe(SaveBloodTestSchema))
  save(@CurrentUser() user: JwtUser, @Body() dto: SaveBloodTestDto) {
    return this.medical.saveBloodTest(user.sub, dto);
  }

  // AI reads an uploaded report → marker values for review (must precede :id).
  @Post('blood-tests/extract')
  @UsePipes(new ZodValidationPipe(ExtractBloodSchema))
  extract(@CurrentUser() user: JwtUser, @Body() dto: ExtractBloodDto) {
    return this.medical.extractBloodReport(user.sub, dto);
  }

  // Upload → auto-analyse: file once, read markers, create the linked panel and
  // run the analysis in one step (must precede :id). Shared by Health Records +
  // Blood Test Analysis so a report uploaded on either surfaces on both.
  @Post('blood-tests/ingest')
  @UsePipes(new ZodValidationPipe(IngestBloodSchema))
  ingest(@CurrentUser() user: JwtUser, @Body() dto: IngestBloodDto) {
    return this.medical.ingestBloodReport(user.sub, dto);
  }

  /** GET /api/medical/blood-tests?cursor=&limit= — newest first, a page at a time. */
  @Get('blood-tests')
  history(
    @CurrentUser() user: JwtUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.medical.bloodTests(user.sub, { cursor: cursor ?? null, limit });
  }

  @Get('blood-tests/latest')
  latest(@CurrentUser() user: JwtUser) {
    return this.medical.latest(user.sub);
  }

  // Longitudinal trend analysis across all panels (auto-runs at 2+; must precede :id).
  @Get('blood-tests/trends')
  trends(@CurrentUser() user: JwtUser) {
    return this.medical.bloodTrends(user.sub);
  }

  @Get('blood-tests/:id')
  analyze(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.medical.analyze(user.sub, id);
  }

  // Manual-entry biomarker catalog (sections + reference ranges + hub tags).
  /** DELETE /api/medical/blood-tests/:id — remove a panel and its markers. */
  @Delete('blood-tests/:id')
  deleteBloodTest(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.medical.deleteBloodTest(user.sub, id);
  }

  @Get('biomarkers/catalog')
  biomarkerCatalog() {
    return this.medical.biomarkerCatalog();
  }

  // Evidence-based medical-condition suggestions from blood tests (shared across hubs).
  @Get('conditions/suggested')
  suggestedConditions(@CurrentUser() user: JwtUser) {
    return this.medical.medicalConditionSuggestions(user.sub);
  }

  @Get('supplement-plan')
  supplementPlan(@CurrentUser() user: JwtUser) {
    return this.medical.supplementPlan(user.sub);
  }

  @Mira({
    intent: 'Summarise the citizen’s latest blood work',
    utterances: ['my health summary', 'my blood test', 'how are my labs', 'my results'],
    risk: 'R0',
  })
  @Get('summary')
  summary(@CurrentUser() user: JwtUser) {
    return this.medical.healthSummary(user.sub);
  }

  // ── records ──
  @Get('records')
  records(@CurrentUser() user: JwtUser) {
    return this.medical.records(user.sub);
  }

  @Post('records')
  @UsePipes(new ZodValidationPipe(AddRecordSchema))
  addRecord(@CurrentUser() user: JwtUser, @Body() dto: AddRecordDto) {
    return this.medical.addRecord(user.sub, dto);
  }

  @Delete('records/:id')
  deleteRecord(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.medical.deleteRecord(user.sub, id);
  }

  // Short-lived signed link to view a private health document (owner only).
  @Get('records/:id/file')
  recordFile(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.medical.recordFileUrl(user.sub, id);
  }

  // ── unified 10 GB vault (mail + health documents) ──
  @Get('storage')
  storage(@CurrentUser() user: JwtUser) {
    return this.medical.storageUsage(user.sub);
  }

  @Post('documents')
  @UsePipes(new ZodValidationPipe(UploadDocSchema))
  uploadDoc(@CurrentUser() user: JwtUser, @Body() dto: UploadDocDto) {
    return this.medical.addDocument(user.sub, dto);
  }

  // ── consults ──
  @Get('doctors')
  doctors() {
    return this.medical.doctors();
  }

  @Get('consults')
  consults(@CurrentUser() user: JwtUser) {
    return this.medical.consults(user.sub);
  }

  @Post('consults')
  @UsePipes(new ZodValidationPipe(BookConsultSchema))
  book(@CurrentUser() user: JwtUser, @Body() dto: BookConsultDto) {
    return this.medical.bookConsult(user.sub, dto);
  }

  // ── consent ──
  @Get('consents')
  consents(@CurrentUser() user: JwtUser) {
    return this.medical.consents(user.sub);
  }

  @Patch('consents')
  @UsePipes(new ZodValidationPipe(ConsentSchema))
  setConsent(@CurrentUser() user: JwtUser, @Body() dto: ConsentDto) {
    return this.medical.setConsent(user.sub, dto.hub, dto.granted);
  }

  @Get('shared-biomarkers/:hub')
  shared(@CurrentUser() user: JwtUser, @Param('hub') hub: string) {
    return this.medical.sharedBiomarkers(user.sub, hub);
  }
}

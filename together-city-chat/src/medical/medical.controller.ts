import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MedicalService } from './medical.service';
import { SaveBloodTestSchema, type SaveBloodTestDto } from './dto/medical.dto';
import {
  AddRecordSchema, type AddRecordDto,
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

  @Get('blood-tests')
  history(@CurrentUser() user: JwtUser) {
    return this.medical.bloodTests(user.sub);
  }

  @Get('blood-tests/latest')
  latest(@CurrentUser() user: JwtUser) {
    return this.medical.latest(user.sub);
  }

  @Get('blood-tests/:id')
  analyze(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.medical.analyze(user.sub, id);
  }

  @Get('supplement-plan')
  supplementPlan(@CurrentUser() user: JwtUser) {
    return this.medical.supplementPlan(user.sub);
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

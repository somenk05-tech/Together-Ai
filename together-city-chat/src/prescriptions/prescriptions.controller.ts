import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { PrescriptionsService } from './prescriptions.service';
import {
  ConfirmPrescriptionSchema, DoseActionSchema, LogsQuerySchema, ReviewItemSchema, UploadPrescriptionSchema,
  type ConfirmPrescriptionDto, type DoseActionDto, type LogsQueryDto, type ReviewItemDto, type UploadPrescriptionDto,
} from './dto/prescriptions.dto';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  /** POST /api/prescriptions — a photographed prescription, already uploaded. */
  @Post()
  @UsePipes(new ZodValidationPipe(UploadPrescriptionSchema))
  upload(@CurrentUser() user: JwtUser, @Body() dto: UploadPrescriptionDto) {
    return this.prescriptions.upload(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.prescriptions.list(user.sub);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.prescriptions.get(user.sub, id);
  }

  /** Correct one extracted line before it can become a schedule. */
  @Patch(':id/items/:itemId')
  @UsePipes(new ZodValidationPipe(ReviewItemSchema))
  reviewItem(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: ReviewItemDto,
  ) {
    return this.prescriptions.reviewItem(user.sub, id, itemId, dto);
  }

  /** Turn a reviewed prescription into medicines, schedules and alarms. */
  @Post(':id/confirm')
  @UsePipes(new ZodValidationPipe(ConfirmPrescriptionSchema))
  confirm(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ConfirmPrescriptionDto) {
    return this.prescriptions.confirm(user.sub, id, dto);
  }
}

@Controller('medicines')
@UseGuards(JwtAuthGuard)
export class MedicinesController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.prescriptions.medicines(user.sub);
  }

  /** Every dose: medicine, dosage, when it was due, when it was acted on. */
  @Get('logs')
  @UsePipes(new ZodValidationPipe(LogsQuerySchema))
  logs(@CurrentUser() user: JwtUser, @Query() dto: LogsQueryDto) {
    return this.prescriptions.logs(user.sub, dto);
  }

  /** Mark a dose taken or skipped. Idempotent — one row per dose, ever. */
  @Post('doses')
  @UsePipes(new ZodValidationPipe(DoseActionSchema))
  recordDose(@CurrentUser() user: JwtUser, @Body() dto: DoseActionDto) {
    return this.prescriptions.recordDose(user.sub, dto);
  }
}

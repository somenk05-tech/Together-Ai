-- Prescriptions, medicines, schedules, reminders and dose logs.
--
-- Purely additive: six new tables, their indexes and their foreign keys.
-- Nothing existing is altered, renamed or dropped, so this cannot touch a
-- single row of citizen data that exists today.
--
-- Two unique constraints carry real weight and are not just hygiene:
--
--   MedicineReminder(scheduleId, scheduledAtUtc) — the every-minute dispatcher
--   and the nightly horizon job both insert reminders. Without this key a
--   restart mid-run, or the two jobs overlapping, would double-notify a citizen
--   about the same dose. With it, the second insert is refused by the database
--   rather than by hopeful application logic.
--
--   DoseLog(scheduleId, scheduledAtUtc) — one row per dose, ever. Tapping
--   "taken" twice (or a retried request) updates the row instead of writing a
--   second history entry that would make adherence look better than it was.

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "fileKey" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "providerJobId" TEXT,
    "rawExtraction" TEXT,
    "error" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "durationDays" INTEGER,
    "instructions" TEXT,
    "timesLocal" TEXT,
    "confidence" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "form" TEXT,
    "strength" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "prescriptionItemId" TEXT,
    "timesLocal" TEXT NOT NULL,
    "daysOfWeek" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "dosage" TEXT,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineReminder" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledAtUtc" TIMESTAMP(3) NOT NULL,
    "notifyAtUtc" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoseLog" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledAtUtc" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "actedAtUtc" TIMESTAMP(3),
    "dosageTaken" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoseLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prescription_userId_createdAt_idx" ON "Prescription"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "Medicine_userId_name_idx" ON "Medicine"("userId", "name");

-- CreateIndex
CREATE INDEX "MedicineSchedule_userId_active_idx" ON "MedicineSchedule"("userId", "active");

-- CreateIndex
CREATE INDEX "MedicineSchedule_medicineId_idx" ON "MedicineSchedule"("medicineId");

-- CreateIndex
CREATE INDEX "MedicineReminder_status_notifyAtUtc_idx" ON "MedicineReminder"("status", "notifyAtUtc");

-- CreateIndex
CREATE INDEX "MedicineReminder_userId_idx" ON "MedicineReminder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineReminder_scheduleId_scheduledAtUtc_key" ON "MedicineReminder"("scheduleId", "scheduledAtUtc");

-- CreateIndex
CREATE INDEX "DoseLog_userId_scheduledAtUtc_idx" ON "DoseLog"("userId", "scheduledAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "DoseLog_scheduleId_scheduledAtUtc_key" ON "DoseLog"("scheduleId", "scheduledAtUtc");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSchedule" ADD CONSTRAINT "MedicineSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSchedule" ADD CONSTRAINT "MedicineSchedule_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineReminder" ADD CONSTRAINT "MedicineReminder_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicineSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseLog" ADD CONSTRAINT "DoseLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicineSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

import type { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Typed access to the Medical Mail tables. The generated client on a
 * developer's machine may predate the migration (the repo's own pattern —
 * see NotificationsService.notif), so the shapes are written here and the
 * client is reached through them. Every method used by the service is
 * declared; nothing else is.
 */
export interface MailboxRow {
  id: string; userId: string; address: string; status: string;
  processDocuments: boolean; aiAnalysis: boolean; autoLink: boolean; classifyEmails: boolean; notify: boolean;
  createdAt: Date; updatedAt: Date;
}
export interface EmailRow {
  id: string; mailboxId: string; userId: string; externalMessageId: string | null; providerEmailId: string | null;
  threadId: string | null; fromAddr: string; fromName: string; toAddr: string; subject: string; body: string;
  snippet: string; sizeBytes: number; classification: string; category: string | null; confidence: number;
  classificationReason: string; authenticated: boolean | null; receivedAt: Date; readAt: Date | null;
  starred: boolean; archivedAt: Date | null; deletedAt: Date | null; createdAt: Date;
}
export interface AttachmentRow {
  id: string; emailId: string; userId: string; filename: string; mimeType: string; sizeBytes: number; sha256: string;
  storageKey: string | null; recordId: string | null; documentType: string | null; status: string; error: string | null;
  createdAt: Date; updatedAt: Date;
}
export interface RuleRow { id: string; userId: string; pattern: string; kind: string; rule: string; createdAt: Date }
export interface HintRow { id: string; userId: string; mailMessageId: string; category: string; confidence: number; reason: string; createdAt: Date }
export interface TimelineRow {
  id: string; userId: string; recordId: string | null; emailId: string | null; eventType: string; title: string;
  source: string; eventDate: Date; createdAt: Date;
}
export interface AuditRow { id: string; userId: string; actorId: string; action: string; subject: string; subjectId: string; at: Date }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = any;
interface Table<Row> {
  findUnique(a: Args): Promise<Row | null>;
  findFirst(a: Args): Promise<Row | null>;
  findMany(a: Args): Promise<Row[]>;
  create(a: Args): Promise<Row>;
  update(a: Args): Promise<Row>;
  updateMany(a: Args): Promise<{ count: number }>;
  upsert(a: Args): Promise<Row>;
  delete(a: Args): Promise<Row>;
  deleteMany(a: Args): Promise<{ count: number }>;
  count(a: Args): Promise<number>;
  aggregate(a: Args): Promise<{ _sum: Record<string, number | null> }>;
  groupBy(a: Args): Promise<Array<Record<string, unknown>>>;
}
export interface MedicalMailDb {
  medicalMailbox: Table<MailboxRow>;
  medicalEmail: Table<EmailRow>;
  medicalEmailAttachment: Table<AttachmentRow>;
  medicalSenderRule: Table<RuleRow>;
  medicalMailHint: Table<HintRow>;
  medicalTimelineEvent: Table<TimelineRow>;
  medicalAuditEvent: Table<AuditRow>;
}
export const medicalMailDb = (prisma: PrismaService): MedicalMailDb => prisma as unknown as MedicalMailDb;

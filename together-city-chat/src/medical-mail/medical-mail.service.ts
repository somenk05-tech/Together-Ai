import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';
import { MedicalService } from '../medical/medical.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ClockService } from '../shared/clock/clock.service';
import { swallow } from '../shared/swallow';
import { addressFor, sizeOf, snippetOf } from '../mail/mail.constants';
import type { InboundMail } from '../mail/mail-inbound';
import type { ReceivedAttachment } from '../mail/messaging-provider';
import { UNSORTED, type RecordKind } from '../medical/record-reader';
import { classify, explain, type SenderRule, type Verdict, type DocumentVerdict, domainOf } from './classify';
import { gateAttachment } from './attachment-gate';
import {
  CATEGORY_LABEL, CATEGORY_TO_RECORD_KIND, MAX_MEDICAL_ATTACHMENTS, MAX_MEDICAL_ATTACHMENT_BYTES, MAX_MEDICAL_BODY_CHARS,
  medicalDigitsOf, medicalPartsOf, medicalRecipient, mintMedicalAddress, mintMedicalDigits, type MedicalCategory,
} from './medical-mail.constants';
import { medicalMailDb, type AttachmentRow, type EmailRow, type MailboxRow, type MedicalMailDb } from './medical-mail.db';
import type { FlagEmailDto, ListEmailsDto, ReclassifyDto, SenderRuleDto, SettingsDto } from './dto/medical-mail.dto';

/** What the inbound webhook lends this service: the body and attachment
 *  fetches Together City Mail already knows how to do against the provider. */
export interface InboundFetch {
  body(): Promise<string>;
  attachments(): Promise<ReceivedAttachment[] | null>;
  download(url: string, cap: number): Promise<Buffer | null>;
}

const FILES_ATTACHMENTS = new Set(['medical', 'likely-medical']);
const PAGE_MAX = 50;
/** A filename as the row keeps it: no control characters, no path separators. */
const safeName = (name: string | null | undefined): string => (name || 'attachment').replace(/[\x00-\x1f/\\]/g, '_').slice(0, 200);

/**
 * ── MEDICAL MAIL (owner, 16 Sep) ─────────────────────────────────────────────
 *
 *   MEDICAL EMAIL → MEDICAL INBOX → MEDICAL INTELLIGENCE → MEDICAL RECORDS
 *
 * The front door of a citizen's healthcare life. Everything that arrives at
 * their medical address is filed HERE, never in Together City Mail; every
 * attachment goes through the vault reader Health Records already uses and
 * becomes a MedicalRecord that remembers the email it came in; the email
 * remembers its documents. Nothing is ever lost because a later step failed:
 * the email row is written first, each attachment reports its own state, and
 * the original bytes are never rewritten.
 *
 * Logs carry ids and counts. Nothing in this file logs a subject, a body, a
 * filename or anything read off a document.
 */
@Injectable()
export class MedicalMailService {
  private readonly logger = new Logger(MedicalMailService.name);
  private readonly db: MedicalMailDb;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly medical: MedicalService,
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly clock: ClockService,
  ) {
    this.db = medicalMailDb(prisma);
  }

  // ─────────────────────────── the mailbox ───────────────────────────

  /** The citizen's medical mailbox — made once, on the first ask; its handle
   *  half kept current across a rename, its digits kept for ever. */
  async ensureMailbox(userId: string): Promise<MailboxRow> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
    if (!user) throw new NotFoundException('account not found');
    const have = await this.db.medicalMailbox.findUnique({ where: { userId } });
    if (have) {
      const digits = medicalDigitsOf(have.address) ?? mintMedicalDigits();
      const address = mintMedicalAddress(user.handle, digits);
      if (have.address === address) return have;
      // The handle changed (or the row predates this shape): the address
      // follows the handle and keeps its number. Mail to the old spelling is
      // refused from now on, as mail to the old ordinary address is.
      await this.db.medicalMailbox.updateMany({ where: { userId }, data: { address } });
      await this.audit(userId, 'system', 'address_renamed', 'mailbox', have.id);
      return { ...have, address };
    }
    // The digits can collide with nothing but the same handle's own earlier
    // row, which does not exist; the loop is for the unique index all the same.
    for (let i = 0; ; i++) {
      try {
        return await this.db.medicalMailbox.create({ data: { userId, address: mintMedicalAddress(user.handle) } });
      } catch (e) {
        const again = await this.db.medicalMailbox.findUnique({ where: { userId } });
        if (again) return again; // two requests raced; the first one won
        if (i >= 4) throw e;
      }
    }
  }

  // ─────────────────────────── inbound ───────────────────────────

  /**
   * Route one arriving message to every medical mailbox it names. Called by
   * MailService.ingestInbound with the addresses it already parsed; returns
   * how many took it, so the webhook's answer stays honest.
   */
  async ingest(mail: InboundMail, addresses: string[], fetch: InboundFetch): Promise<{ delivered: number; errors: number }> {
    let delivered = 0; let errors = 0;
    const seen = new Set<string>();
    for (const raw of addresses) {
      const parts = medicalPartsOf(raw);
      const address = medicalRecipient(raw);
      if (!parts || !address || seen.has(address)) continue;
      seen.add(address);
      try {
        // Resolved by the HANDLE, the way ordinary mail is — so a citizen who
        // has never opened the Medical Hub, or renamed since, still receives —
        // and then the whole address is checked, so the digits are the key.
        const user = await this.prisma.user.findUnique({ where: { handle: parts.handle }, select: { id: true, deletedAt: true } });
        if (!user || user.deletedAt) { this.logger.warn('medical mail: no citizen for an address on the medical prefix'); continue; }
        const box = await this.ensureMailbox(user.id);
        if (box.address !== address) { this.logger.warn(`medical mail: wrong digits for mailbox ${box.id}, message refused`); continue; }
        if (box.status !== 'active') { this.logger.warn(`medical mail: mailbox ${box.id} is paused, message not taken`); continue; }
        if (await this.deliver(box, mail, fetch)) delivered++;
      } catch (e) {
        errors++;
        this.logger.error(`medical mail: delivery failed - ${(e as Error).message}`);
      }
    }
    return { delivered, errors };
  }

  private async deliver(box: MailboxRow, mail: InboundMail, fetch: InboundFetch): Promise<boolean> {
    const userId = box.userId;
    // A provider retry is not a second email (the same rule as Together City Mail).
    if (mail.providerMessageId) {
      const already = await this.db.medicalEmail.findFirst({ where: { userId, externalMessageId: mail.providerMessageId }, select: { id: true } });
      if (already) return false;
    }
    const subject = (mail.subject || '(no subject)').slice(0, 200);
    const body = (await fetch.body()).slice(0, MAX_MEDICAL_BODY_CHARS);
    const size = sizeOf(subject, body);
    const usage = await this.medical.storageUsage(userId);
    if (size > usage.remainingBytes) {
      this.logger.warn(`medical mail: vault full for mailbox ${box.id}, message dropped`);
      return false;
    }
    const rules = await this.rulesOf(userId);
    const verdict: Verdict = box.classifyEmails
      ? classify({ from: mail.from, subject, text: body, attachments: mail.attachments, rules, authenticated: mail.authenticated })
      : { classification: 'medical', category: 'other-medical', confidence: 0, reasons: ['It arrived at your medical address; classification is switched off.'], ruled: null };

    // The row FIRST — an email whose attachments later fail is still an email.
    const email = await this.db.medicalEmail.create({
      data: {
        mailboxId: box.id, userId, externalMessageId: mail.providerMessageId ?? null, providerEmailId: mail.emailId ?? null,
        fromAddr: mail.from.addr, fromName: mail.from.name || mail.from.addr, toAddr: box.address,
        subject, body, snippet: snippetOf(body), sizeBytes: size,
        classification: verdict.classification, category: verdict.category, confidence: verdict.confidence,
        classificationReason: verdict.reasons.join('\n').slice(0, 4000), authenticated: mail.authenticated,
      },
    });
    await this.audit(userId, 'system', 'email_received', 'email', email.id);
    this.analytics.track('medical_email_received', userId, { classification: verdict.classification, category: verdict.category, attachments: mail.attachments.length });

    // Attachments: extracted, gated, stored once, filed, linked — each on its own.
    let refined = verdict;
    if (mail.attachments.length) {
      const docs = await this.fileAttachments(box, email, mail, fetch, verdict, usage.remainingBytes - size);
      // What the vault reader said outranks the subject line: reclassify with it.
      if (docs.length && box.classifyEmails) {
        refined = classify({ from: mail.from, subject, text: body, attachments: mail.attachments, rules, authenticated: mail.authenticated, documents: docs });
        if (refined.classification !== verdict.classification || refined.category !== verdict.category) {
          await this.db.medicalEmail.updateMany({ where: { id: email.id, userId }, data: {
            classification: refined.classification, category: refined.category, confidence: refined.confidence,
            classificationReason: refined.reasons.join('\n').slice(0, 4000),
          } });
        }
      }
    }

    // The timeline: one line for the arrival, referencing the email.
    await swallow(this.db.medicalTimelineEvent.create({ data: {
      userId, emailId: email.id, eventType: 'email_received', source: 'medical-mail', eventDate: email.receivedAt,
      title: `${refined.category ? CATEGORY_LABEL[refined.category] : 'Message'} — ${email.fromName}`.slice(0, 160),
    } }), 'medical mail: timeline', { emailId: email.id });

    // Told, without being told what: the push says a medical message arrived
    // and nothing else — a lock screen is a shared screen (owner, §21).
    if (box.notify) {
      await this.notifications.create({
        userId, kind: 'medical_mail', title: 'Medical Mail', body: '1 new medical message',
        href: `/medical/mail/${email.id}`, entityId: email.id,
      });
    }
    return true;
  }

  /**
   * EMAIL → CLASSIFY → MEDICAL → EXTRACT → STORE → LINK → INDEX (owner, §10).
   * Every attachment gets a row before a byte is fetched, and the row says at
   * every step what happened to it. Duplicates (same sha256, same citizen) are
   * a second row pointing at the FIRST record: stored once, linked twice.
   */
  private async fileAttachments(
    box: MailboxRow, email: EmailRow, mail: InboundMail, fetch: InboundFetch, verdict: Verdict, roomBytes: number,
  ): Promise<DocumentVerdict[]> {
    const userId = box.userId;
    const docs: DocumentVerdict[] = [];
    const rows: Array<{ row: AttachmentRow; providerId: string }> = [];
    for (const a of mail.attachments.slice(0, MAX_MEDICAL_ATTACHMENTS)) {
      const row = await this.db.medicalEmailAttachment.create({ data: {
        emailId: email.id, userId, filename: safeName(a.filename), mimeType: a.contentType || 'application/octet-stream',
        sizeBytes: 0, sha256: '', status: 'processing',
      } });
      rows.push({ row, providerId: a.id });
    }
    for (const a of mail.attachments.slice(MAX_MEDICAL_ATTACHMENTS)) {
      await this.db.medicalEmailAttachment.create({ data: {
        emailId: email.id, userId, filename: safeName(a.filename), mimeType: a.contentType || 'application/octet-stream',
        sizeBytes: 0, sha256: '', status: 'failed', error: `More than ${MAX_MEDICAL_ATTACHMENTS} attachments — ask the sender to send the rest separately.`,
      } });
    }
    const fail = (row: AttachmentRow, error: string) =>
      this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { status: 'failed', error: error.slice(0, 300) } });

    if (!mail.emailId) { for (const { row } of rows) await fail(row, 'The message arrived without a reference to fetch its files by.'); return docs; }
    const list = await fetch.attachments();
    if (!list) { for (const { row } of rows) await fail(row, 'The provider could not be reached. Ask the sender to resend.'); return docs; }

    let room = roomBytes;
    for (const { row, providerId } of rows) {
      const listed = list.find((l) => l.id === providerId) ?? list.find((l) => safeName(l.filename) === row.filename);
      if (!listed) { await fail(row, 'The provider did not list this file.'); continue; }
      if (listed.size > MAX_MEDICAL_ATTACHMENT_BYTES) { await fail(row, `Over ${MAX_MEDICAL_ATTACHMENT_BYTES / 1024 / 1024} MB.`); continue; }
      const bytes = await fetch.download(listed.downloadUrl, MAX_MEDICAL_ATTACHMENT_BYTES);
      if (!bytes) { await fail(row, 'The file could not be downloaded from the provider.'); continue; }
      const gate = gateAttachment(row.filename, listed.contentType || row.mimeType, bytes, MAX_MEDICAL_ATTACHMENT_BYTES);
      if (!gate.ok) { await fail(row, gate.reason); continue; }
      const sha256 = createHash('sha256').update(bytes).digest('hex');

      // Stored once. A copy already in the vault is linked, not written again.
      const twin = await this.db.medicalEmailAttachment.findFirst({
        where: { userId, sha256, id: { not: row.id }, OR: [{ recordId: { not: null } }, { storageKey: { not: null } }] },
        orderBy: { createdAt: 'asc' },
      });
      if (twin) {
        await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: {
          sha256, sizeBytes: bytes.length, mimeType: gate.mimeType, status: 'duplicate', recordId: twin.recordId, documentType: twin.documentType,
        } });
        if (twin.recordId) await this.audit(userId, 'system', 'record_linked', 'record', twin.recordId);
        if (twin.documentType) docs.push({ filename: row.filename, isMedical: true, kind: twin.documentType, sure: true });
        continue;
      }
      if (bytes.length > room) { await fail(row, 'No room left in your vault for this file.'); continue; }
      const key = await this.storage.putPrivateObject('health', userId, bytes, gate.mimeType, gate.ext);
      if (!key) { await fail(row, 'The vault could not store the file. It stays with the provider; try again later.'); continue; }
      room -= bytes.length;
      await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { sha256, sizeBytes: bytes.length, mimeType: gate.mimeType, storageKey: key, status: 'stored' } });
      const stored: AttachmentRow = { ...row, sha256, sizeBytes: bytes.length, mimeType: gate.mimeType, storageKey: key, status: 'stored' };
      await this.audit(userId, 'system', 'attachment_stored', 'attachment', row.id);
      this.analytics.track('medical_document_stored', userId, { mimeType: gate.mimeType });

      // Read and filed — only when the citizen allows it and the email reads
      // as medical. A file on an email nobody can vouch for waits for them.
      if (!box.processDocuments || !FILES_ATTACHMENTS.has(verdict.classification)) {
        await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { status: 'needs_review' } });
        continue;
      }
      const filed = await this.fileIntoVault(userId, stored, email, verdict.category, true, box.autoLink);
      if (filed) docs.push(filed);
    }
    return docs;
  }

  /**
   * One stored attachment → the vault reader → a MedicalRecord that remembers
   * this email. Returns what the reader said (for reclassification), or null
   * when nothing was filed. Never throws: a read that fails leaves the row at
   * `stored` with the reason, and the citizen can file it by hand.
   */
  private async fileIntoVault(userId: string, row: AttachmentRow, email: EmailRow, category: string | null, requireMedical = true, autoLink = true): Promise<DocumentVerdict | null> {
    if (!row.storageKey) return null;
    try {
      const filed = await this.medical.fileDocument(userId, { fileKey: row.storageKey, mimeType: row.mimeType, sizeBytes: row.sizeBytes, name: row.filename }, { onMismatch: 'hold', requireMedical });
      if (!filed.recordId) {
        await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { status: 'needs_review', error: filed.note.slice(0, 300) } });
        return { filename: row.filename, isMedical: false, kind: UNSORTED, sure: false };
      }
      // The reader could not name a folder but the email could: a file on a
      // "Your Blood Test Report" mail that read as unsorted goes to Blood Tests.
      let kind = filed.kind;
      const hint = category ? CATEGORY_TO_RECORD_KIND[category as MedicalCategory] : undefined;
      if (kind === UNSORTED && !filed.held && hint) {
        kind = hint;
        await this.medical.tagRecord(userId, filed.recordId, kind as RecordKind);
      }
      await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: {
        recordId: filed.recordId, documentType: kind === UNSORTED ? null : kind,
        status: filed.bloodTestId ? 'analyzed' : filed.held ? 'needs_review' : 'stored',
        error: filed.held ? filed.note.slice(0, 300) : null,
      } });
      await this.audit(userId, 'system', 'record_linked', 'record', filed.recordId);
      this.analytics.track('medical_record_created', userId, { kind: kind === UNSORTED ? 'unsorted' : kind, held: filed.held });
      // The timeline line is the "automatic record linking" switch's half:
      // the record ↔ email link itself always stands (it is what dedupe and
      // "Source: Medical Mail" read), the timeline is the citizen's to want.
      if (!filed.held && autoLink) {
        const rec = await this.prisma.medicalRecord.findFirst({ where: { id: filed.recordId, userId }, select: { title: true, recordedOn: true } });
        await swallow(this.db.medicalTimelineEvent.create({ data: {
          userId, recordId: filed.recordId, emailId: email.id, eventType: filed.bloodTestId ? 'panel_read' : 'document_received',
          title: (rec?.title ?? row.filename).slice(0, 160), source: 'medical-mail', eventDate: rec?.recordedOn ?? email.receivedAt,
        } }), 'medical mail: timeline', { emailId: email.id });
      }
      return { filename: row.filename, isMedical: filed.reading.isMedical, kind, sure: kind !== UNSORTED && !filed.held };
    } catch (e) {
      this.logger.warn(`medical mail: attachment ${row.id} stored but not filed - ${(e as Error).message}`);
      await swallow(this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { status: 'stored', error: 'Stored, but the reader could not file it yet — you can save it to Health Records yourself.' } }), 'medical mail: mark unfiled', { id: row.id });
      return null;
    }
  }

  // ─────────────────────────── reading ───────────────────────────

  private shape(e: EmailRow, attachments: AttachmentRow[] = []) {
    return {
      id: e.id, fromAddr: e.fromAddr, fromName: e.fromName, toAddr: e.toAddr, subject: e.subject, snippet: e.snippet,
      receivedAt: e.receivedAt.toISOString(), read: Boolean(e.readAt), starred: e.starred,
      archived: Boolean(e.archivedAt), deleted: Boolean(e.deletedAt),
      classification: e.classification, category: e.category, confidence: e.confidence,
      why: explain({ classification: e.classification as Verdict['classification'], category: e.category as MedicalCategory | null, reasons: e.classificationReason.split('\n').filter(Boolean) }),
      authenticated: e.authenticated,
      attachmentCount: attachments.length,
      attachments: attachments.map((a) => this.shapeAttachment(a)),
    };
  }

  private shapeAttachment(a: AttachmentRow) {
    return {
      id: a.id, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes, status: a.status, error: a.error,
      recordId: a.recordId, documentType: a.documentType, stored: Boolean(a.recordId || a.storageKey),
      /** Can "Save to Health Records" be offered: bytes held, no record yet. */
      canSave: Boolean(a.storageKey) && !a.recordId,
    };
  }

  /**
   * The landing page: the address, the four counts, the recent mail, the
   * recent documents and the timeline — every number counted, none invented.
   */
  async home(userId: string) {
    const box = await this.ensureMailbox(userId);
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const [total, unread, documents, recentReports, recent, timeline] = await Promise.all([
      this.db.medicalEmail.count({ where: { userId, deletedAt: null } }),
      this.db.medicalEmail.count({ where: { userId, deletedAt: null, archivedAt: null, readAt: null } }),
      this.db.medicalEmailAttachment.count({ where: { userId, recordId: { not: null }, status: { not: 'duplicate' } } }),
      this.db.medicalEmailAttachment.count({ where: { userId, recordId: { not: null }, status: { not: 'duplicate' }, createdAt: { gte: since } } }),
      this.db.medicalEmail.findMany({ where: { userId, deletedAt: null, archivedAt: null }, orderBy: { receivedAt: 'desc' }, take: 5, include: { attachments: true } }),
      this.timeline(userId, 8),
    ]);
    const recentDocs = await this.db.medicalEmailAttachment.findMany({
      where: { userId, recordId: { not: null }, status: { not: 'duplicate' } }, orderBy: { createdAt: 'desc' }, take: 6,
      include: { email: { select: { id: true, fromName: true, subject: true, receivedAt: true } } },
    });
    return {
      address: box.address, status: box.status,
      stats: { total, unread, documents, recentReports },
      recent: (recent as Array<EmailRow & { attachments: AttachmentRow[] }>).map((e) => this.shape(e, e.attachments)),
      recentDocuments: (recentDocs as Array<AttachmentRow & { email: { id: string; fromName: string; subject: string; receivedAt: Date } }>)
        .map((a) => ({ ...this.shapeAttachment(a), emailId: a.email.id, fromName: a.email.fromName, subject: a.email.subject, receivedAt: a.email.receivedAt.toISOString() })),
      timeline,
    };
  }

  /** The unread count for the badge on the rail — nothing else leaves here. */
  async badge(userId: string): Promise<{ unread: number }> {
    return { unread: await this.db.medicalEmail.count({ where: { userId, deletedAt: null, archivedAt: null, readAt: null } }) };
  }

  /**
   * A folder, a page at a time, newest first, cursor on (receivedAt, id).
   * Search reads sender, subject, body, category and attachment names —
   * the citizen's own mailbox only, by the userId on every clause.
   */
  async list(userId: string, q: ListEmailsDto) {
    const where: Record<string, unknown> = { userId };
    switch (q.folder) {
      case 'inbox': Object.assign(where, { deletedAt: null, archivedAt: null }); break;
      case 'archived': Object.assign(where, { deletedAt: null, archivedAt: { not: null } }); break;
      case 'starred': Object.assign(where, { deletedAt: null, starred: true }); break;
      case 'trash': Object.assign(where, { deletedAt: { not: null } }); break;
      case 'attachments': Object.assign(where, { deletedAt: null, attachments: { some: { status: { not: 'failed' } } } }); break;
      case 'all': Object.assign(where, { deletedAt: null }); break;
    }
    // A chip is its categories, OR — for Reports — any email whose attachment
    // was filed as a record: the owner's "2 recent reports" tile counts filed
    // documents, and a chip that counted differently looked like a sort bug.
    const byCategory = q.category?.length ? { category: { in: q.category } } : null;
    const byDocument = q.documents ? { attachments: { some: { recordId: { not: null } } } } : null;
    if (byCategory && byDocument) where.AND = [{ OR: [byCategory, byDocument] }];
    else if (byCategory) where.category = byCategory.category;
    else if (byDocument) where.attachments = byDocument.attachments;
    if (q.q) {
      const needle = q.q.slice(0, 200);
      const cat = Object.entries(CATEGORY_LABEL).find(([, label]) => label.toLowerCase() === needle.toLowerCase())?.[0];
      where.OR = [
        { subject: { contains: needle, mode: 'insensitive' } },
        { fromName: { contains: needle, mode: 'insensitive' } },
        { fromAddr: { contains: needle, mode: 'insensitive' } },
        { body: { contains: needle, mode: 'insensitive' } },
        { attachments: { some: { filename: { contains: needle, mode: 'insensitive' } } } },
        ...(cat ? [{ category: cat }] : []),
      ];
    }
    if (q.cursor) {
      const [at, id] = q.cursor.split('_');
      const t = new Date(Number(at));
      if (!Number.isNaN(t.getTime()) && id) {
        where.AND = [...((where.AND as unknown[]) ?? []), { OR: [{ receivedAt: { lt: t } }, { receivedAt: t, id: { lt: id } }] }];
      }
    }
    const take = Math.min(q.limit, PAGE_MAX);
    const rows = await this.db.medicalEmail.findMany({
      where: { userId, ...where }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: take + 1, include: { attachments: true },
    }) as Array<EmailRow & { attachments: AttachmentRow[] }>;
    const page = rows.slice(0, take);
    const last = page[page.length - 1];
    return {
      items: page.map((e) => this.shape(e, e.attachments)),
      nextCursor: rows.length > take && last ? `${last.receivedAt.getTime()}_${last.id}` : null,
    };
  }

  /** One email, opened: marks it read and writes the audit line. */
  async get(userId: string, id: string) {
    const e = await this.db.medicalEmail.findFirst({ where: { id, userId }, include: { attachments: true } }) as (EmailRow & { attachments: AttachmentRow[] }) | null;
    if (!e) throw new NotFoundException('message not found');
    if (!e.readAt) await this.db.medicalEmail.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    await this.audit(userId, userId, 'email_opened', 'email', id);
    const records = e.attachments.filter((a) => a.recordId).map((a) => a.recordId as string);
    const titles = records.length
      ? new Map((await this.prisma.medicalRecord.findMany({ where: { userId, id: { in: records } }, select: { id: true, title: true, kind: true, bloodTestId: true } }) as Array<{ id: string; title: string; kind: string; bloodTestId: string | null }>).map((r) => [r.id, r]))
      : new Map<string, { id: string; title: string; kind: string; bloodTestId: string | null }>();
    return {
      ...this.shape({ ...e, readAt: e.readAt ?? new Date() }, e.attachments),
      body: e.body,
      attachments: e.attachments.map((a) => {
        const r = a.recordId ? titles.get(a.recordId) : undefined;
        return { ...this.shapeAttachment(a), recordTitle: r?.title ?? null, recordKind: r?.kind ?? null, analysisReady: Boolean(r?.bloodTestId) };
      }),
    };
  }

  /** A short-lived signed link to one attachment — the citizen's own, and a
   *  view is an audited event. */
  async attachmentUrl(userId: string, emailId: string, attachmentId: string): Promise<{ url: string | null; expiresInSec: number }> {
    const a = await this.db.medicalEmailAttachment.findFirst({ where: { id: attachmentId, emailId, userId } });
    if (!a) throw new NotFoundException('attachment not found');
    await this.audit(userId, userId, 'document_viewed', 'attachment', a.id);
    this.analytics.track('medical_document_viewed', userId, { via: 'medical-mail' });
    if (a.recordId) return this.medical.recordFileUrl(userId, a.recordId);
    if (a.storageKey) return { url: await this.storage.presignHealthDownload(a.storageKey), expiresInSec: 300 };
    return { url: null, expiresInSec: 0 };
  }

  async flag(userId: string, id: string, dto: FlagEmailDto) {
    const data: Record<string, unknown> = {};
    if (dto.read !== undefined) data.readAt = dto.read ? new Date() : null;
    if (dto.starred !== undefined) data.starred = dto.starred;
    if (dto.archived !== undefined) data.archivedAt = dto.archived ? new Date() : null;
    const r = await this.db.medicalEmail.updateMany({ where: { id, userId }, data });
    if (!r.count) throw new NotFoundException('message not found');
    return { ok: true };
  }

  /** Trash, then gone. A trashed email keeps its documents in Health Records;
   *  deleting it for good removes only files that were never filed there. */
  async remove(userId: string, id: string, forever = false) {
    const e = await this.db.medicalEmail.findFirst({ where: { id, userId }, include: { attachments: true } }) as (EmailRow & { attachments: AttachmentRow[] }) | null;
    if (!e) throw new NotFoundException('message not found');
    if (!forever && !e.deletedAt) {
      await this.db.medicalEmail.updateMany({ where: { id, userId }, data: { deletedAt: new Date() } });
      await this.audit(userId, userId, 'deleted', 'email', id);
      return { ok: true, trashed: true };
    }
    for (const a of e.attachments) {
      if (a.storageKey && !a.recordId) {
        if (!(await this.storage.deleteHealthObject(a.storageKey))) this.logger.error(`medical mail: ${a.storageKey} is ORPHANED — attachment row deleted, object not`);
      }
    }
    await this.db.medicalEmail.deleteMany({ where: { id, userId } });
    await swallow(this.db.medicalTimelineEvent.deleteMany({ where: { userId, emailId: id, recordId: null } }), 'medical mail: timeline of a deleted email', { id });
    await this.audit(userId, userId, 'deleted', 'email', id);
    return { ok: true, trashed: false };
  }

  async restore(userId: string, id: string) {
    const r = await this.db.medicalEmail.updateMany({ where: { id, userId, deletedAt: { not: null } }, data: { deletedAt: null } });
    if (!r.count) throw new NotFoundException('message not found');
    return { ok: true };
  }

  async emptyTrash(userId: string) {
    const rows = await this.db.medicalEmail.findMany({ where: { userId, deletedAt: { not: null } }, select: { id: true } });
    for (const r of rows) await this.remove(userId, r.id, true);
    return { ok: true, removed: rows.length };
  }

  // ─────────────────────────── the citizen's word ───────────────────────────

  /**
   * The citizen corrects the classifier: a new verdict, a category, and
   * optionally a rule so the next mail from this sender needs no correction.
   * Filing follows the new verdict — attachments held back on an "unknown"
   * are read and filed once the citizen says the mail is medical.
   */
  async reclassify(userId: string, id: string, dto: ReclassifyDto) {
    const e = await this.db.medicalEmail.findFirst({ where: { id, userId }, include: { attachments: true } }) as (EmailRow & { attachments: AttachmentRow[] }) | null;
    if (!e) throw new NotFoundException('message not found');
    const data: Record<string, unknown> = {};
    const reasons: string[] = [];
    if (dto.classification) { data.classification = dto.classification; data.confidence = 1; reasons.push('You set this yourself.'); }
    if (dto.category !== undefined) { data.category = dto.category; if (!reasons.length) reasons.push('You set the category yourself.'); }
    if (reasons.length) data.classificationReason = reasons.join('\n');
    if (Object.keys(data).length) await this.db.medicalEmail.updateMany({ where: { id, userId }, data });
    if (dto.rememberSender) await this.setRule(userId, { pattern: dto.scope === 'domain' ? domainOf(e.fromAddr) : e.fromAddr, kind: dto.scope, rule: dto.rememberSender });
    const box = await this.ensureMailbox(userId);
    if (dto.classification && FILES_ATTACHMENTS.has(dto.classification) && box.processDocuments) {
      for (const a of e.attachments) {
        if (a.storageKey && !a.recordId && a.status !== 'failed') await this.fileIntoVault(userId, a, e, (dto.category ?? e.category) ?? null, false, box.autoLink);
      }
    }
    await this.audit(userId, userId, 'email_moved', 'email', id);
    return this.get(userId, id);
  }

  async rulesOf(userId: string): Promise<SenderRule[]> {
    const rows = await this.db.medicalSenderRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map((r) => ({ pattern: r.pattern, kind: r.kind as SenderRule['kind'], rule: r.rule as SenderRule['rule'] }));
  }

  async rules(userId: string) {
    const rows = await this.db.medicalSenderRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map((r) => ({ id: r.id, pattern: r.pattern, kind: r.kind, rule: r.rule, createdAt: r.createdAt.toISOString() }));
  }

  async setRule(userId: string, dto: SenderRuleDto) {
    const pattern = dto.pattern.trim().toLowerCase();
    if (dto.kind === 'address' && !pattern.includes('@')) throw new BadRequestException('An address rule needs a whole email address.');
    if (dto.kind === 'domain' && (pattern.includes('@') || !pattern.includes('.'))) throw new BadRequestException('A domain rule is a bare domain, like apollohospitals.com.');
    const count = await this.db.medicalSenderRule.count({ where: { userId } });
    if (count >= 500) throw new BadRequestException('That is a lot of rules — remove one first.');
    const row = await this.db.medicalSenderRule.upsert({
      where: { userId_pattern: { userId, pattern } },
      update: { kind: dto.kind, rule: dto.rule },
      create: { userId, pattern, kind: dto.kind, rule: dto.rule },
    });
    await this.audit(userId, userId, 'rule_set', 'rule', row.id);
    return this.rules(userId);
  }

  async deleteRule(userId: string, id: string) {
    await this.db.medicalSenderRule.deleteMany({ where: { id, userId } });
    return this.rules(userId);
  }

  /** "Save to Health Records" on a file the pipeline held back. */
  async saveAttachment(userId: string, emailId: string, attachmentId: string) {
    const e = await this.db.medicalEmail.findFirst({ where: { id: emailId, userId } });
    if (!e) throw new NotFoundException('message not found');
    const a = await this.db.medicalEmailAttachment.findFirst({ where: { id: attachmentId, emailId, userId } });
    if (!a) throw new NotFoundException('attachment not found');
    if (a.recordId) return this.get(userId, emailId);
    if (!a.storageKey) throw new BadRequestException(a.error ?? 'This file was not stored.');
    const box = await this.ensureMailbox(userId);
    const filed = await this.fileIntoVault(userId, a, e, e.category, false, box.autoLink);
    if (!filed) throw new BadRequestException('The vault could not file it just now — try again.');
    return this.get(userId, emailId);
  }

  /**
   * "Analyze": the existing analysis, never a new diagnosis. A blood report
   * already has its panel; anything else is read once (the vault's own
   * reread) and the whole-history analysis on Record Analysis reads it. The
   * answer says where to look, and it is gated on the citizen's AI switch.
   */
  async analyzeAttachment(userId: string, emailId: string, attachmentId: string) {
    const box = await this.ensureMailbox(userId);
    if (!box.aiAnalysis) throw new ForbiddenException('AI analysis is switched off in your Medical Mail settings.');
    const a = await this.db.medicalEmailAttachment.findFirst({ where: { id: attachmentId, emailId, userId } });
    if (!a) throw new NotFoundException('attachment not found');
    if (!a.recordId) throw new BadRequestException('Save it to Health Records first — analysis reads the record.');
    const out = await this.medical.rereadRecord(userId, a.recordId);
    const rec = (out.records as Array<{ id: string; bloodTestId?: string | null; analyzed?: boolean }>).find((r) => r.id === a.recordId);
    if (rec?.bloodTestId) await this.db.medicalEmailAttachment.updateMany({ where: { id: a.id, userId }, data: { status: 'analyzed' } });
    await this.audit(userId, userId, 'document_analyzed', 'attachment', a.id);
    return {
      recordId: a.recordId, bloodTestId: rec?.bloodTestId ?? null, note: out.note,
      href: '/medical/blood',
      label: 'AI-generated analysis, not a medical diagnosis. Values are extracted from the document as printed.',
    };
  }

  // ─────────────────────────── the timeline ───────────────────────────

  /**
   * The chronological health history: events written by Medical Mail, plus
   * every uploaded record that has no event of its own — one line per thing,
   * never the same document twice.
   */
  async timeline(userId: string, limit = 60) {
    const tz = await this.clock.timezoneFor(userId);
    const events = await this.db.medicalTimelineEvent.findMany({ where: { userId }, orderBy: { eventDate: 'desc' }, take: Math.min(limit * 2, 400) });
    const covered = new Set(events.map((e) => e.recordId).filter(Boolean) as string[]);
    const uploads = (await this.prisma.medicalRecord.findMany({ where: { userId }, orderBy: { recordedOn: 'desc' }, take: Math.min(limit * 2, 400), select: { id: true, title: true, kind: true, recordedOn: true } }) as Array<{ id: string; title: string; kind: string; recordedOn: Date }>)
      .filter((r) => !covered.has(r.id));
    const all = [
      ...events.map((e) => ({ id: e.id, date: e.eventDate, day: this.clock.dayIn(tz, e.eventDate), type: e.eventType, title: e.title, source: e.source, recordId: e.recordId, emailId: e.emailId })),
      ...uploads.map((r) => ({ id: `rec-${r.id}`, date: r.recordedOn, day: this.clock.dayIn(tz, r.recordedOn), type: 'record_filed', title: r.title, source: 'upload', recordId: r.id, emailId: null as string | null })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
    return all.map(({ date, ...rest }) => ({ ...rest, at: date.toISOString() }));
  }

  // ─────────────────────────── settings ───────────────────────────

  async settings(userId: string) {
    const box = await this.ensureMailbox(userId);
    return {
      address: box.address, status: box.status, createdAt: box.createdAt.toISOString(),
      processDocuments: box.processDocuments, aiAnalysis: box.aiAnalysis, autoLink: box.autoLink,
      classifyEmails: box.classifyEmails, notify: box.notify,
      rules: await this.rules(userId),
    };
  }

  async updateSettings(userId: string, dto: SettingsDto) {
    const box = await this.ensureMailbox(userId);
    await this.db.medicalMailbox.updateMany({ where: { id: box.id, userId }, data: { ...dto } });
    await this.audit(userId, userId, 'settings', 'mailbox', box.id);
    return this.settings(userId);
  }

  // ─────────────────────────── the other inbox ───────────────────────────

  /**
   * A message that arrived in TOGETHER CITY MAIL and reads as medical is not
   * moved — it is flagged, and the reader is offered the move with the
   * reason (owner, §8: "must NOT silently move"). Called by the inbound path
   * after the ordinary row is written; best-effort, never in its way.
   */
  async hintInbound(userId: string, mailMessageId: string, mail: Pick<InboundMail, 'from' | 'attachments' | 'authenticated'>, subject: string, body: string): Promise<void> {
    try {
      const box = await this.db.medicalMailbox.findUnique({ where: { userId } });
      if (!box || !box.classifyEmails || box.status !== 'active') return;
      const v = classify({ from: mail.from, subject, text: body, attachments: mail.attachments, rules: await this.rulesOf(userId), authenticated: mail.authenticated });
      if (!FILES_ATTACHMENTS.has(v.classification) || !v.category) return;
      await this.db.medicalMailHint.upsert({
        where: { mailMessageId },
        update: { category: v.category, confidence: v.confidence, reason: v.reasons.join('\n').slice(0, 4000) },
        create: { userId, mailMessageId, category: v.category, confidence: v.confidence, reason: v.reasons.join('\n').slice(0, 4000) },
      });
    } catch (e) {
      this.logger.warn(`medical mail: hint failed - ${(e as Error).message}`);
    }
  }

  /** The hint on one ordinary message, for its reader. Null when there is none. */
  async hintFor(userId: string, mailMessageId: string) {
    const h = await swallow(this.db.medicalMailHint.findFirst({ where: { userId, mailMessageId } }), 'medical mail: hint read', { mailMessageId });
    if (!h) return null;
    return { category: h.category, confidence: h.confidence, why: explain({ classification: 'likely-medical', category: h.category as MedicalCategory, reasons: h.reason.split('\n').filter(Boolean) }) };
  }

  async dismissHint(userId: string, mailMessageId: string, rememberSender?: 'medical' | 'personal') {
    const m = await this.prisma.mailMessage.findFirst({ where: { id: mailMessageId, ownerId: userId }, select: { fromAddr: true } });
    await this.db.medicalMailHint.deleteMany({ where: { userId, mailMessageId } });
    if (m && rememberSender) await this.setRule(userId, { pattern: m.fromAddr, kind: 'address', rule: rememberSender });
    return { ok: true };
  }

  /**
   * "Move to Medical": an ordinary message becomes a medical email — its text
   * copied, its thread's files copied into the health vault and filed, the
   * ordinary copy put in Trash. The citizen said it is medical, so it files
   * as such; a rule is written when asked.
   */
  async moveFromMail(userId: string, mailMessageId: string, rememberSender?: 'medical' | 'personal') {
    const m = await this.prisma.mailMessage.findFirst({ where: { id: mailMessageId, ownerId: userId } });
    if (!m) throw new NotFoundException('message not found');
    const box = await this.ensureMailbox(userId);
    const rules = await this.rulesOf(userId);
    const from = { addr: m.fromAddr, name: m.fromName };
    const files = m.threadId ? await this.prisma.driveFile.findMany({ where: { ownerId: userId, attachedType: 'mail', attachedId: m.threadId } }) : [];
    const guess = classify({ from, subject: m.subject, text: m.body, attachments: files.map((f) => ({ filename: f.name, contentType: f.mimeType ?? '' })), rules, authenticated: null });
    const email = await this.db.medicalEmail.create({ data: {
      mailboxId: box.id, userId, externalMessageId: m.providerMessageId ? `moved:${m.providerMessageId}` : null,
      fromAddr: m.fromAddr, fromName: m.fromName, toAddr: box.address, subject: m.subject, body: m.body, snippet: m.snippet, sizeBytes: m.sizeBytes,
      classification: 'medical', category: guess.category ?? 'other-medical', confidence: 1,
      classificationReason: ['You moved this here from Together City Mail.', ...guess.reasons].join('\n').slice(0, 4000),
      receivedAt: m.createdAt, readAt: m.read ? new Date() : null, starred: m.starred,
    } });
    for (const f of files.slice(0, MAX_MEDICAL_ATTACHMENTS)) {
      const row = await this.db.medicalEmailAttachment.create({ data: { emailId: email.id, userId, filename: safeName(f.name), mimeType: f.mimeType ?? 'application/octet-stream', sizeBytes: f.sizeBytes, sha256: '', status: 'processing' } });
      const bytes = await this.readWhole(f.storageKey);
      if (!bytes) { await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { status: 'failed', error: 'The file could not be read from your Drive.' } }); continue; }
      const gate = gateAttachment(row.filename, f.mimeType ?? '', bytes, MAX_MEDICAL_ATTACHMENT_BYTES);
      if (!gate.ok) { await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { status: 'failed', error: gate.reason } }); continue; }
      const key = await this.storage.putPrivateObject('health', userId, bytes, gate.mimeType, gate.ext);
      if (!key) { await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { status: 'failed', error: 'The vault could not store the file.' } }); continue; }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await this.db.medicalEmailAttachment.updateMany({ where: { id: row.id, userId }, data: { sha256, sizeBytes: bytes.length, mimeType: gate.mimeType, storageKey: key, status: 'stored' } });
      if (box.processDocuments) await this.fileIntoVault(userId, { ...row, sha256, sizeBytes: bytes.length, mimeType: gate.mimeType, storageKey: key, status: 'stored' }, email, email.category, false, box.autoLink);
    }
    await this.prisma.mailMessage.updateMany({ where: { id: mailMessageId, ownerId: userId }, data: { folder: 'trash' } });
    await this.db.medicalMailHint.deleteMany({ where: { userId, mailMessageId } });
    if (rememberSender) await this.setRule(userId, { pattern: m.fromAddr, kind: 'address', rule: rememberSender });
    await this.audit(userId, userId, 'email_moved', 'email', email.id);
    return { emailId: email.id };
  }

  /**
   * "Move to Personal": the text goes to Together City Mail's inbox as an
   * ordinary message; the medical copy goes to Trash (nothing is lost), and
   * documents already filed in Health Records stay there — deleting a health
   * record is its own, deliberate act on the Health Records page.
   */
  async moveToMail(userId: string, id: string, rememberSender?: 'medical' | 'personal') {
    const e = await this.db.medicalEmail.findFirst({ where: { id, userId } });
    if (!e) throw new NotFoundException('message not found');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { handle: true, name: true } });
    if (!user) throw new NotFoundException('account not found');
    const created = await this.prisma.mailMessage.create({ data: {
      ownerId: userId, boxUserId: userId, folder: 'inbox', read: Boolean(e.readAt), system: false, starred: e.starred,
      fromAddr: e.fromAddr, fromName: e.fromName, toAddr: addressFor(user.handle), toName: user.name ?? '',
      subject: e.subject, body: e.body, snippet: e.snippet, sizeBytes: e.sizeBytes, threadId: randomUUID(), createdAt: e.receivedAt,
    } });
    await this.db.medicalEmail.updateMany({ where: { id, userId }, data: { deletedAt: new Date(), classification: 'personal', classificationReason: 'You moved this to Together City Mail.' } });
    if (rememberSender) await this.setRule(userId, { pattern: e.fromAddr, kind: 'address', rule: rememberSender });
    await this.audit(userId, userId, 'email_moved', 'email', id);
    return { mailMessageId: created.id };
  }

  private async readWhole(key: string): Promise<Buffer | null> {
    const obj = await this.storage.readPrivateObject(key);
    if (!obj) return null;
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of obj.body as AsyncIterable<Buffer>) {
      total += c.length;
      if (total > MAX_MEDICAL_ATTACHMENT_BYTES) return null;
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  // ─────────────────────────── operator ───────────────────────────

  /**
   * What the founder may see: counts, rates and failures over a window.
   * No subject, no sender, no filename, no citizen leaves this method.
   */
  async ops(days = 7) {
    const since = new Date(Date.now() - days * 24 * 3600_000);
    const [mailboxes, emails, byClass, attachments, byStatus, hints, failedRecent] = await Promise.all([
      this.db.medicalMailbox.count({ where: {} }),
      this.db.medicalEmail.count({ where: { createdAt: { gte: since } } }),
      this.db.medicalEmail.groupBy({ by: ['classification'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.db.medicalEmailAttachment.count({ where: { createdAt: { gte: since } } }),
      this.db.medicalEmailAttachment.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.db.medicalMailHint.count({ where: { createdAt: { gte: since } } }),
      this.db.medicalEmailAttachment.findMany({ where: { createdAt: { gte: since }, status: 'failed' }, select: { error: true }, take: 200, orderBy: { createdAt: 'desc' } }),
    ]);
    const count = (rows: Array<Record<string, unknown>>, key: string) =>
      Object.fromEntries(rows.map((r) => [String(r[key]), Number((r._count as { _all: number })._all)]));
    const statuses = count(byStatus, 'status');
    const failed = statuses.failed ?? 0;
    const stored = (statuses.stored ?? 0) + (statuses.analyzed ?? 0) + (statuses.duplicate ?? 0) + (statuses.needs_review ?? 0);
    // Failure reasons are the pipeline's own sentences, never the document's.
    const reasons: Record<string, number> = {};
    for (const f of failedRecent as Array<{ error: string | null }>) { const k = (f.error ?? 'unknown').slice(0, 80); reasons[k] = (reasons[k] ?? 0) + 1; }
    return {
      days, mailboxes, emails, classifications: count(byClass, 'classification'),
      attachments, attachmentStatuses: statuses,
      attachmentSuccessRate: attachments ? +((stored / attachments) * 100).toFixed(1) : null,
      attachmentFailures: failed, failureReasons: reasons, hintsOnOrdinaryMail: hints,
    };
  }

  // ─────────────────────────── the audit line ───────────────────────────

  private async audit(userId: string, actorId: string, action: string, subject: string, subjectId: string): Promise<void> {
    await swallow(this.db.medicalAuditEvent.create({ data: { userId, actorId, action, subject, subjectId } }), 'medical mail: audit', { action });
  }

  /** Where did this document come from — the audit trail for one record. */
  async provenance(userId: string, recordId: string) {
    const links = await this.db.medicalEmailAttachment.findMany({ where: { userId, recordId }, include: { email: true }, orderBy: { createdAt: 'asc' } }) as Array<AttachmentRow & { email: EmailRow }>;
    const trail = await this.db.medicalAuditEvent.findMany({ where: { userId, OR: [{ subject: 'record', subjectId: recordId }, { subject: 'attachment', subjectId: { in: links.map((l) => l.id) } }] }, orderBy: { at: 'asc' }, take: 200 });
    return {
      recordId,
      emails: links.map((l) => ({ emailId: l.email.id, subject: l.email.subject, fromName: l.email.fromName, fromAddr: l.email.fromAddr, receivedAt: l.email.receivedAt.toISOString(), attachmentId: l.id, filename: l.filename, sha256: l.sha256, duplicate: l.status === 'duplicate' })),
      trail: trail.map((t) => ({ action: t.action, at: t.at.toISOString(), by: t.actorId === userId ? 'you' : t.actorId })),
    };
  }
}

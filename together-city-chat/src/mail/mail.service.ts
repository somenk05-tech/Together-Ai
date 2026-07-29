import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FEED_CAP } from '../shared/paging';
import { StorageProvider } from '../media/storage.provider';
import type { OutboundAttachment } from './messaging-provider';

/**
 * Outbound attachment sizing.
 *
 * Email itself cannot carry large files: providers (Resend included) reject a
 * message over roughly 40 MB, and base64-loading a huge file into memory would
 * take the API process down. So we split by size:
 *  - up to MIME_BUDGET total → real MIME attachments, arriving in the
 *    recipient's mail client exactly as they'd expect;
 *  - anything beyond that, up to TOTAL_CEILING → a secure, expiring download
 *    link in the message body (the same hand-off Gmail does to Drive).
 * The citizen just picks files; which path each takes is decided here.
 */
const MIME_BUDGET_BYTES = 20 * 1024 * 1024;          // safely under provider caps
const MAX_OUTBOUND_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB across attachments
const SHARE_LINK_TTL_SEC = 7 * 24 * 3600;            // 7 days (S3/R2 maximum)
import {
  MAIL_DOMAIN, CITY_DOMAINS, QUOTA_BYTES, addressFor, handleFromAddress, snippetOf, sizeOf, welcomeMail, humanBytes,
} from './mail.constants';
import { createMessagingProvider, messagingConfigured, type Channel } from './messaging-provider';
import type { FlagDto, FolderQueryDto, SendMailDto } from './dto/mail.dto';

@Injectable()
export class MailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  /** Drive files the sender chose are linked to the THREAD, so both the Sent and
   *  Inbox copies resolve the same attachments. Only files the sender actually
   *  owns can be attached. */
  private async linkAttachments(userId: string, threadId: string, fileIds?: string[]): Promise<void> {
    if (!fileIds?.length) return;
    const drive = (this.prisma as unknown as {
      driveFile: { updateMany(a: unknown): Promise<{ count: number }> };
    }).driveFile;
    await drive.updateMany({
      where: { id: { in: fileIds.slice(0, 10) }, ownerId: userId },
      data: { attachedType: 'mail', attachedId: threadId },
    }).catch(() => undefined);
  }

  /**
   * Load the sender's chosen Drive files as real MIME attachments (base64) for
   * an OUTBOUND external email. Only files the sender owns are read. Providers
   * cap total message size (Resend ~40 MB), so we enforce a conservative
   * ceiling and fail with a message that says exactly what to do.
   */
  private async loadOutboundAttachments(
    userId: string, fileIds?: string[],
  ): Promise<{ attachments: OutboundAttachment[]; linkFooter: string }> {
    const none = { attachments: [] as OutboundAttachment[], linkFooter: '' };
    if (!fileIds?.length) return none;
    const drive = (this.prisma as unknown as {
      driveFile: { findMany(a: unknown): Promise<Array<{ id: string; name: string; mimeType: string | null; sizeBytes: number; storageKey: string }>> };
    }).driveFile;
    const files = await drive.findMany({
      where: { id: { in: fileIds.slice(0, 10) }, ownerId: userId },
    }).catch(() => []);
    if (!files.length) return none;

    const total = files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0);
    if (total > MAX_OUTBOUND_TOTAL_BYTES) {
      throw new BadRequestException(
        `Those attachments total ${(total / 1024 / 1024 / 1024).toFixed(2)} GB — the limit for one message is 1 GB. Send fewer files, or share them from your Drive instead.`,
      );
    }

    // Smallest first, so as many files as possible arrive as true attachments
    // and only the big ones fall back to a link.
    const ordered = [...files].sort((a, b) => (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0));
    const attachments: OutboundAttachment[] = [];
    const linked: Array<{ name: string; sizeBytes: number; url: string }> = [];
    let budget = MIME_BUDGET_BYTES;

    for (const f of ordered) {
      const size = f.sizeBytes ?? 0;
      if (size <= budget) {
        const obj = await this.storage.getHealthObjectBase64(f.storageKey).catch(() => null);
        if (obj) {
          attachments.push({ filename: f.name, contentBase64: obj.base64, contentType: f.mimeType ?? obj.contentType });
          budget -= size;
          continue;
        }
        // Unreadable inline → fall through and try a link instead of dropping it.
      }
      const url = await this.storage.presignShareLink(f.storageKey, SHARE_LINK_TTL_SEC).catch(() => null);
      if (url) linked.push({ name: f.name, sizeBytes: size, url });
    }

    const linkFooter = linked.length
      ? [
          '',
          '─'.repeat(28),
          `${linked.length} large file${linked.length === 1 ? '' : 's'} shared as a secure download link (expires in 7 days):`,
          ...linked.map((l) => `• ${l.name} (${humanBytes(l.sizeBytes)})\n  ${l.url}`),
        ].join('\n')
      : '';

    return { attachments, linkFooter };
  }

  /**
   * Which thread a send belongs to. A caller may only continue a thread they
   * already hold a message in; anything else starts a fresh trail rather than
   * joining someone else's. Thread membership is what gates attachment reads,
   * so this is a security boundary, not just tidiness.
   */
  private async resolveThreadId(userId: string, requested?: string | null): Promise<string> {
    if (!requested) return randomUUID();
    const owns = await this.prisma.mailMessage.findFirst({
      where: { ownerId: userId, threadId: requested },
      select: { id: true },
    });
    return owns ? requested : randomUUID();
  }

  /** Attachments on a thread the caller is a participant of. */
  async threadAttachments(userId: string, threadId: string) {
    const owns = await this.prisma.mailMessage.findFirst({ where: { ownerId: userId, threadId }, select: { id: true } });
    if (!owns) throw new NotFoundException('Message not found.');
    const drive = (this.prisma as unknown as {
      driveFile: { findMany(a: unknown): Promise<Array<{ id: string; name: string; mimeType: string | null; sizeBytes: number }>> };
    }).driveFile;
    const items = await drive.findMany({
      where: { attachedType: 'mail', attachedId: threadId },
      select: { id: true, name: true, mimeType: true, sizeBytes: true },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);
    return { items };
  }

  /** Short-lived download URL for an attachment — allowed for ANY participant of
   *  the thread (not just the file's owner), which is what makes mail work. */
  async attachmentUrl(userId: string, threadId: string, fileId: string) {
    const owns = await this.prisma.mailMessage.findFirst({ where: { ownerId: userId, threadId }, select: { id: true } });
    if (!owns) throw new NotFoundException('Message not found.');
    const drive = (this.prisma as unknown as {
      driveFile: { findFirst(a: unknown): Promise<{ ownerId: string; storageKey: string; name: string; mimeType: string | null } | null> };
    }).driveFile;
    const f = await drive.findFirst({ where: { id: fileId, attachedType: 'mail', attachedId: threadId } });
    if (!f) throw new NotFoundException('Attachment not found.');
    // Belt and braces on top of the participant check above: the file must have
    // been attached by someone who is themselves in this thread. A stray or
    // mis-attached DriveFile row can't be turned into a signed download.
    const attacherInThread = f.ownerId === userId || await this.prisma.mailMessage.findFirst({
      where: { ownerId: f.ownerId, threadId }, select: { id: true },
    });
    if (!attacherInThread) throw new NotFoundException('Attachment not found.');
    const url = await this.storage.presignHealthDownload(f.storageKey);
    if (!url) throw new NotFoundException('File storage is not available right now.');
    return { url, name: f.name, mimeType: f.mimeType };
  }

  /** Ensure the user has a mailbox (address + welcome mail). Idempotent. */
  private async ensureAccount(userId: string) {
    let acct = await this.prisma.mailAccount.findUnique({ where: { userId } });
    if (acct) {
      // Mailboxes minted before the domain change still carry the LEGACY
      // address (…@togethercity.tech), so the header showed one domain while
      // the rest of the app advertised another. Move them to the current
      // domain on read — the legacy domain still routes inbound, so nothing
      // already sent to the old address breaks.
      const local = acct.address.split('@')[0];
      const domain = acct.address.split('@')[1];
      if (local && domain && domain !== MAIL_DOMAIN && CITY_DOMAINS.includes(domain)) {
        const moved = await this.prisma.mailAccount
          .update({ where: { userId }, data: { address: `${local}@${MAIL_DOMAIN}` } })
          .catch(() => null);
        if (moved) return moved;
      }
      return acct;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { handle: true, name: true } });
    if (!user) throw new NotFoundException('user not found');
    const address = addressFor(user.handle);
    acct = await this.prisma.mailAccount.create({ data: { userId, address } });
    // seed a welcome message into the inbox
    const w = welcomeMail(user.name, address);
    await this.prisma.mailMessage.create({
      data: {
        ownerId: userId, boxUserId: userId, folder: 'inbox',
        fromAddr: w.fromAddr, fromName: w.fromName, toAddr: address, toName: user.name,
        subject: w.subject, body: w.body, snippet: snippetOf(w.body), sizeBytes: sizeOf(w.subject, w.body),
        read: false, system: true,
      },
    });
    return acct;
  }

  private async usedBytes(userId: string): Promise<number> {
    const rows = await this.prisma.mailMessage.findMany({ where: { ownerId: userId }, select: { sizeBytes: true } });
    return rows.reduce((s, r) => s + r.sizeBytes, 0);
  }

  async account(userId: string) {
    const acct = await this.ensureAccount(userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
    const [inboxUnread, inbox, sent, starred, trash, used, emailed] = await Promise.all([
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'inbox', read: false } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'inbox' } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'sent' } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, starred: true, NOT: { folder: 'trash' } } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'trash' } }),
      this.usedBytes(userId),
      this.prisma.emailDelivery.count({ where: { userId } }),
    ]);
    return {
      address: acct.address, primaryEmail: user?.email ?? null, phone: user?.phone ?? null,
      quotaBytes: QUOTA_BYTES, usedBytes: used,
      usedPct: Math.min(100, +((used / QUOTA_BYTES) * 100).toFixed(4)),
      counts: { inbox, inboxUnread, sent, starred, trash, emailed },
    };
  }

  /** Set/update the primary (external) email + phone — used by existing citizens to add theirs. */
  async setPrimary(userId: string, input: { email?: string; phone?: string }) {
    const data: { email?: string; phone?: string } = {};
    if (input.email !== undefined) data.email = input.email.trim() || undefined;
    if (input.phone !== undefined) data.phone = input.phone.trim() || undefined;
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.account(userId);
  }

  private shape(m: {
    id: string; fromAddr: string; fromName: string; toAddr: string; toName: string; subject: string;
    snippet: string; sizeBytes: number; read: boolean; starred: boolean; system: boolean; folder: string;
    threadId: string | null; createdAt: Date;
  }) {
    return {
      id: m.id, fromAddr: m.fromAddr, fromName: m.fromName, toAddr: m.toAddr, toName: m.toName,
      subject: m.subject, snippet: m.snippet, sizeBytes: m.sizeBytes, read: m.read, starred: m.starred,
      system: m.system, folder: m.folder, threadId: m.threadId, createdAt: m.createdAt.toISOString(),
    };
  }

  /** The full trail for a thread in this user's mailbox (oldest → newest, with bodies). */
  async thread(userId: string, threadId: string) {
    const rows = await this.prisma.mailMessage.findMany({
      where: { ownerId: userId, threadId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({ ...this.shape(m), body: m.body }));
  }

  async list(userId: string, q: FolderQueryDto) {
    await this.ensureAccount(userId);
    const where =
      q.folder === 'starred' ? { ownerId: userId, starred: true, NOT: { folder: 'trash' } }
      : q.folder === 'inbox' ? { ownerId: userId, folder: 'inbox' }
      : q.folder === 'sent' ? { ownerId: userId, folder: 'sent' }
      : { ownerId: userId, folder: 'trash' };
    // A mailbox only grows. Capped rather than paginated so the response shape
    // is unchanged; the cap is far above any current inbox.
    const rows = await this.prisma.mailMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: FEED_CAP });
    return rows.map((m) => this.shape(m));
  }

  async get(userId: string, id: string) {
    const m = await this.prisma.mailMessage.findFirst({ where: { id, ownerId: userId } });
    if (!m) throw new NotFoundException('message not found');
    if (!m.read) await this.prisma.mailMessage.update({ where: { id }, data: { read: true } });
    return { ...this.shape({ ...m, read: true }), body: m.body };
  }

  /** Send a message to another citizen — writes a Sent copy for the sender and an Inbox copy for the recipient. */
  async send(userId: string, dto: SendMailDto) {
    const sender = await this.ensureAccount(userId);
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { handle: true, name: true } });
    if (!me) throw new NotFoundException('user not found');

    const recipientHandle = handleFromAddress(dto.to);
    // External (global) email — a valid address that isn't a city mailbox goes
    // out through the email provider (Resend), with a Sent copy kept in the city.
    if (!recipientHandle) {
      const to = dto.to.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        throw new BadRequestException('Enter a valid email address (a citizen @' + MAIL_DOMAIN + ' handle, or any external email).');
      }
      return this.sendExternal(userId, sender.address, me.name, to, dto);
    }
    const recipient = await this.prisma.user.findUnique({ where: { handle: recipientHandle }, select: { id: true, handle: true, name: true } });
    if (!recipient) throw new BadRequestException(`No such city mailbox: ${addressFor(recipientHandle)}`);

    const subject = dto.subject?.trim() || '(no subject)';
    const size = sizeOf(subject, dto.body);
    const used = await this.usedBytes(userId);
    if (used + size > QUOTA_BYTES) throw new BadRequestException('Your 10 GB mailbox is full. Delete some mail and try again.');

    // Reply → reuse the parent thread (only if the sender actually owns a message
    // in it, so threads can't be spoofed); otherwise start a new trail.
    const threadId = await this.resolveThreadId(userId, dto.threadId);
    const toAddr = addressFor(recipient.handle);
    const base = {
      fromAddr: sender.address, fromName: me.name, toAddr, toName: recipient.name,
      subject, body: dto.body, snippet: snippetOf(dto.body), sizeBytes: size, system: false, threadId,
    };
    // sender's Sent copy
    await this.prisma.mailMessage.create({ data: { ...base, ownerId: userId, boxUserId: userId, folder: 'sent', read: true } });
    // recipient's Inbox copy (only if it's a different mailbox)
    if (recipient.id !== userId) {
      await this.prisma.mailAccount.findUnique({ where: { userId: recipient.id } }).then((a) => a ?? this.ensureAccount(recipient.id));
      await this.prisma.mailMessage.create({ data: { ...base, ownerId: recipient.id, boxUserId: recipient.id, folder: 'inbox', read: false } });
    }
    await this.linkAttachments(userId, threadId, dto.attachmentFileIds);
    return this.list(userId, { folder: 'sent' });
  }

  /** Send to a GLOBAL (external) email address via the email provider (Resend).
   *  Keeps a Sent copy in the city; logs the dispatch to the outbox. */
  private async sendExternal(userId: string, fromAddr: string, fromName: string, toEmail: string, dto: SendMailDto) {
    const subject = dto.subject?.trim() || '(no subject)';
    const size = sizeOf(subject, dto.body);
    const used = await this.usedBytes(userId);
    if (used + size > QUOTA_BYTES) throw new BadRequestException('Your 10 GB mailbox is full. Delete some mail and try again.');

    // Same anti-spoof rule as the internal path. This used to be a bare
    // `dto.threadId ?? randomUUID()`, which let one external mail carrying a
    // stranger's threadId mint an owned row in their thread — enough to pass the
    // participant check on the attachment routes and presign their Drive files.
    const threadId = await this.resolveThreadId(userId, dto.threadId);
    // Sender's Sent copy (the city ledger).
    await this.prisma.mailMessage.create({
      data: {
        ownerId: userId, boxUserId: userId, folder: 'sent', read: true,
        fromAddr, fromName, toAddr: toEmail, toName: toEmail,
        subject, body: dto.body, snippet: snippetOf(dto.body), sizeBytes: size, system: false, threadId,
      },
    });

    // External dispatch through the provider. From = the verified EMAIL_FROM
    // sender; the sender's city identity is noted in the body footer.
    const footer = `\n\n${'─'.repeat(28)}\nSent by ${fromName} (${fromAddr}) via Together City Mail.`;
    const provider = createMessagingProvider('email');
    // Real MIME attachments so external recipients get the actual files.
    const { attachments, linkFooter } = await this.loadOutboundAttachments(userId, dto.attachmentFileIds);
    const res = await provider
      .send({ channel: 'email', to: toEmail, subject, body: dto.body + linkFooter + footer, kind: 'mail', ...(attachments.length ? { attachments } : {}) })
      .catch(() => ({ provider: provider.name, providerMessageId: null as string | null, status: 'failed' as const }));
    await this.prisma.emailDelivery.create({
      data: {
        userId, channel: 'email', toEmail, kind: 'mail', subject, body: dto.body,
        provider: res.provider, providerMessageId: res.providerMessageId ?? undefined, status: res.status,
      },
    }).catch(() => undefined);

    // A real (configured) provider that failed should surface an error; the stub
    // reports 'sent' so demo/dev never blocks.
    if (res.status === 'failed' && messagingConfigured('email')) {
      throw new BadRequestException(`Couldn't deliver to ${toEmail} right now — please try again.`);
    }
    // Keep the attachments visible on the Sent copy too.
    await this.linkAttachments(userId, threadId, dto.attachmentFileIds);
    return this.list(userId, { folder: 'sent' });
  }

  async flag(userId: string, id: string, dto: FlagDto) {
    const m = await this.prisma.mailMessage.findFirst({ where: { id, ownerId: userId } });
    if (!m) throw new NotFoundException('message not found');
    await this.prisma.mailMessage.update({
      where: { id },
      data: { ...(dto.starred !== undefined ? { starred: dto.starred } : {}), ...(dto.read !== undefined ? { read: dto.read } : {}) },
    });
    return { ok: true };
  }

  /** Move to trash; if already in trash, delete permanently. */
  async remove(userId: string, id: string) {
    const m = await this.prisma.mailMessage.findFirst({ where: { id, ownerId: userId } });
    if (!m) throw new NotFoundException('message not found');
    if (m.folder === 'trash') await this.prisma.mailMessage.delete({ where: { id } });
    else await this.prisma.mailMessage.update({ where: { id }, data: { folder: 'trash', starred: false } });
    return { ok: true };
  }

  /**
   * Deliver a system receipt/notice into the user's city inbox AND dispatch a copy
   * to their primary contact via the messaging provider. Channel 'email' → primary
   * email; 'sms' → primary phone. The city inbox is the ledger; the external copy
   * goes through the pluggable provider (stub by default).
   */
  /** Is real external delivery wired for this channel? (stub → false) */
  deliveryConfigured(channel: Channel = 'email'): boolean {
    return messagingConfigured(channel);
  }

  async deliverSystem(
    userId: string,
    r: { subject: string; body: string; html?: string },
    kind: 'receipt' | 'recovery' | 'security' | 'welcome' = 'receipt',
    channel: Channel = 'email',
  ) {
    const acct = await this.ensureAccount(userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });
    const subject = r.subject.trim() || '(no subject)';
    const target = channel === 'sms' ? (user?.phone ?? null) : (user?.email ?? null);
    const footer = target
      ? `\n\n${'─'.repeat(28)}\n${channel === 'sms' ? '📱 Also sent by SMS to' : '📧 A copy was also emailed to your primary address:'} ${target}`
      : '';
    const cityBody = `${r.body}${footer}`;
    await this.prisma.mailMessage.create({
      data: {
        ownerId: userId, boxUserId: userId, folder: 'inbox',
        fromAddr: `receipts@${MAIL_DOMAIN}`, fromName: 'Together City', toAddr: acct.address, toName: user?.name ?? '',
        subject, body: cityBody, snippet: snippetOf(cityBody), sizeBytes: sizeOf(subject, cityBody), read: false, system: true,
      },
    });
    // External dispatch through the messaging provider (stub by default).
    if (target) {
      const provider = createMessagingProvider(channel);
      const res = await provider.send({ channel, to: target, subject, body: r.body, ...(channel === 'email' && r.html ? { html: r.html } : {}), kind }).catch(() => ({ provider: provider.name, providerMessageId: null as string | null, status: 'failed' as const }));
      await this.prisma.emailDelivery.create({
        data: {
          userId, channel, toEmail: channel === 'email' ? target : null, toPhone: channel === 'sms' ? target : null,
          kind, subject, body: r.body, provider: res.provider, providerMessageId: res.providerMessageId ?? undefined, status: res.status,
        },
      }).catch(() => undefined);
    }
    return { deliveredToInbox: true, dispatchedTo: target, channel };
  }

  /** The outbound-delivery log — every email/SMS dispatched through the provider. */
  async outbox(userId: string) {
    const rows = await this.prisma.emailDelivery.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((d) => ({
      id: d.id, channel: d.channel, to: d.channel === 'sms' ? d.toPhone : d.toEmail, kind: d.kind, subject: d.subject,
      provider: d.provider, providerMessageId: d.providerMessageId, status: d.status, createdAt: d.createdAt.toISOString(),
    }));
  }

  /** City directory — everyone you can write to. */
  async directory(userId: string) {
    // Only fellow citizens — exclude service providers (doctors/dietitians are Users
    // so bookings can open a chat, but they are not people you email.)
    const rows = await this.prisma.user.findMany({
      where: { NOT: { id: userId }, doctorProfile: { is: null }, dietitianProfile: { is: null } },
      select: { handle: true, name: true }, orderBy: { name: 'asc' }, take: 200,
    });
    return rows.map((u) => ({ handle: u.handle, name: u.name, address: addressFor(u.handle) }));
  }
}

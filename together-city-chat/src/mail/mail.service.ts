import { swallow } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConnectionStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FEED_CAP } from '../shared/paging';
import { StorageProvider } from '../media/storage.provider';
import type { OutboundAttachment } from './messaging-provider';
import { greetHtml, greetSms, greetText } from './greet';

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
  MAIL_DOMAIN, CITY_DOMAINS, QUOTA_BYTES, addressFor, handleFromAddress, cityRecipient, subAddressed, snippetOf, sizeOf, welcomeMail, humanBytes,
} from './mail.constants';
import { createMessagingProvider, messagingConfigured, type Channel } from './messaging-provider';
import { cityFromHeader, normalizeInbound, type InboundMail } from './mail-inbound';
import type {
  FlagDto, FolderQueryDto, SaveDraftDto, SendMailDto,
  CreateProjectDto, UpdateProjectDto, FileThreadDto,
} from './dto/mail.dto';
import { PROJECT_CAP } from './dto/mail.dto';

/** What a citizen reads when the body could not be retrieved. One sentence, and
 *  never an empty message — a blank arrival is indistinguishable from a blank
 *  email, and only one of those is a bug worth reporting. */
const UNRETRIEVABLE = '(This message arrived but its contents could not be retrieved. '
  + 'Reply to the sender directly, or ask an administrator to check the mail provider.)';

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

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
    await swallow(drive.updateMany({
      where: { id: { in: fileIds.slice(0, 10) }, ownerId: userId },
      data: { attachedType: 'mail', attachedId: threadId },
    }), 'mail: attach drive files', { userId, threadId });
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
    // A failed read silently sent the mail WITHOUT its attachments.
    // unbounded: `in:` of at most 10 ids — the attach flow slices first
    const files = (await swallow(drive.findMany({
      where: { id: { in: fileIds.slice(0, 10) }, ownerId: userId },
    }), 'mail: outgoing attachments read', { userId })) ?? [];
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
        const obj = await swallow(this.storage.getHealthObjectBase64(f.storageKey), 'mail: attachment inline read', { fileId: f.id });
        if (obj) {
          attachments.push({ filename: f.name, contentBase64: obj.base64, contentType: f.mimeType ?? obj.contentType });
          budget -= size;
          continue;
        }
        // Unreadable inline → fall through and try a link instead of dropping it.
      }
      // If this ALSO fails after the inline read failed, the attachment is
      // dropped from the mail — both failures now leave a line.
      const url = await swallow(this.storage.presignShareLink(f.storageKey, SHARE_LINK_TTL_SEC), 'mail: attachment link presign', { fileId: f.id });
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

  /**
   * The room a trail is already in, or null. One indexed read, and it is what
   * makes a reply arrive where the conversation lives without anybody writing
   * a rule: the filing is on the THREAD, so the next message inherits it.
   */
  private async threadProject(userId: string, threadId: string): Promise<string | null> {
    const row = await this.prisma.mailMessage.findFirst({
      where: { ownerId: userId, threadId, projectId: { not: null } },
      select: { projectId: true },
    });
    return row?.projectId ?? null;
  }

  /**
   * Which project a message being sent belongs to.
   *
   * The thread wins over the composer, always. Somebody replying to a filed
   * conversation from All Email has not asked to move it out of its room, and
   * a conversation that changes rooms depending on which screen the reply was
   * typed on is the exact instability a "project" is supposed to remove.
   */
  private async resolveSendProject(userId: string, threadId: string, requested?: string): Promise<string | null> {
    const inherited = await this.threadProject(userId, threadId);
    if (inherited) return inherited;
    if (!requested) return null;
    const owned = await this.prisma.mailProject.findFirst({
      where: { id: requested, ownerId: userId }, select: { id: true },
    });
    return owned?.id ?? null;
  }

  /** Attachments on a thread the caller is a participant of. */
  async threadAttachments(userId: string, threadId: string) {
    const owns = await this.prisma.mailMessage.findFirst({ where: { ownerId: userId, threadId }, select: { id: true } });
    if (!owns) throw new NotFoundException('Message not found.');
    const drive = (this.prisma as unknown as {
      driveFile: { findMany(a: unknown): Promise<Array<{ id: string; name: string; mimeType: string | null; sizeBytes: number }>> };
    }).driveFile;
    // [] on failure told the reader this thread HAD no attachments — an
    // absence never established. unbounded: attach flow caps at 10 per entity
    const items = (await swallow(drive.findMany({
      where: { attachedType: 'mail', attachedId: threadId },
      select: { id: true, name: true, mimeType: true, sizeBytes: true },
      orderBy: { createdAt: 'asc' },
    }), 'mail: thread attachments read', { threadId })) ?? [];
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
        const moved = await swallow(this.prisma.mailAccount
          .update({ where: { userId }, data: { address: `${local}@${MAIL_DOMAIN}` } }),
          'mail: address domain migration', { userId });
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
    // unbounded: the storage meter SUMS every row — truncating undercounts the vault
    const rows = await this.prisma.mailMessage.findMany({ where: { ownerId: userId }, select: { sizeBytes: true } });
    return rows.reduce((s, r) => s + r.sizeBytes, 0);
  }

  async account(userId: string) {
    const acct = await this.ensureAccount(userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
    const [inboxUnread, inbox, sent, draft, failed, starred, trash, used, emailed] = await Promise.all([
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'inbox', read: false } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'inbox' } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'sent' } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'draft' } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'failed' } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, starred: true, NOT: { folder: 'trash' } } }),
      this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'trash' } }),
      this.usedBytes(userId),
      this.prisma.emailDelivery.count({ where: { userId } }),
    ]);
    return {
      address: acct.address, primaryEmail: user?.email ?? null, phone: user?.phone ?? null,
      quotaBytes: QUOTA_BYTES, usedBytes: used,
      usedPct: Math.min(100, +((used / QUOTA_BYTES) * 100).toFixed(4)),
      // `unsent` is what the menu shows; `draft` and `failed` stay separate so
      // a screen can say WHICH kind of waiting it found.
      counts: { inbox, inboxUnread, sent, draft, failed, unsent: draft + failed, starred, trash, emailed },
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
    threadId: string | null; createdAt: Date; failureReason?: string | null;
    projectId?: string | null;
  }) {
    return {
      id: m.id, fromAddr: m.fromAddr, fromName: m.fromName, toAddr: m.toAddr, toName: m.toName,
      subject: m.subject, snippet: m.snippet, sizeBytes: m.sizeBytes, read: m.read, starred: m.starred,
      system: m.system, folder: m.folder, threadId: m.threadId, createdAt: m.createdAt.toISOString(),
      // Which room this conversation is filed in, so All Email can put the
      // chip on the row without asking a second time.
      projectId: m.projectId ?? null,
      // Carried on every message so a list can show it without a second fetch.
      // Null on everything in Sent, by construction.
      failureReason: m.failureReason ?? null,
    };
  }

  /**
   * Try a rejected message again (FE-14.1's Retry).
   *
   * Re-sends the saved body to the saved recipient and files the result the
   * same way the first attempt was filed — accepted goes to Sent, refused stays
   * in Failed with the new reason, because the reason usually changes and the
   * old one is no longer why.
   *
   * The failed row is removed only once the retry has been ACCEPTED. Deleting
   * it first would lose the citizen's writing if the second attempt failed too,
   * which is exactly when they can least afford to lose it.
   */
  async retry(userId: string, id: string) {
    const m = await this.prisma.mailMessage.findFirst({ where: { id, ownerId: userId, folder: 'failed' } });
    if (!m) throw new NotFoundException('No failed message with that id.');

    const attachmentFileIds = ((): string[] => {
      const raw = (m as { attachmentIds?: string | null }).attachmentIds;
      if (!raw) return [];
      try { const j: unknown = JSON.parse(raw); return Array.isArray(j) ? j.map(String) : []; } catch { return []; }
    })();

    const before = await this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'sent' } });
    await this.send(userId, {
      to: m.toAddr, subject: m.subject, body: m.body,
      ...(m.threadId ? { threadId: m.threadId } : {}),
      ...(attachmentFileIds.length ? { attachmentFileIds } : {}),
    });
    const after = await this.prisma.mailMessage.count({ where: { ownerId: userId, folder: 'sent' } });

    // send() throws on a configured-provider refusal, so reaching here means it
    // did not fail — but the count check keeps this honest if that ever changes.
    if (after > before) {
      await this.prisma.mailMessage.deleteMany({ where: { id, ownerId: userId, folder: 'failed' } });
    }
    return this.list(userId, { folder: 'failed' });
  }

  /** The full trail for a thread in this user's mailbox (oldest → newest, with bodies). */
  async thread(userId: string, threadId: string) {
    const rows = await this.prisma.mailMessage.findMany({
      where: { ownerId: userId, threadId },
      orderBy: { createdAt: 'asc' },
      take: FEED_CAP, // a thread longer than this needs pagination, not scroll
    });
    return rows.map((m) => ({ ...this.shape(m), body: m.body }));
  }

  async list(userId: string, q: FolderQueryDto) {
    await this.ensureAccount(userId);
    /**
     * THE SCOPE IS ONE CLAUSE, AND IT IS THE ONLY THING A PROJECT DOES TO THE
     * MAILBOX. Everything below — the folder rules, the search, the cap — is
     * untouched, which is why Sent, Drafts, Starred and Trash all keep working
     * one room in rather than needing a second implementation each.
     *
     * An unknown key is a 404, not an empty list. "The ABG inbox is empty" and
     * "there is no ABG" are different sentences and a citizen deserves the
     * right one.
     */
    const scope = q.project ? await this.projectByKey(userId, q.project) : null;
    const filed = scope ? { projectId: scope.id } : {};
    const folderWhere =
      // Starred deliberately excludes trash only — a starred draft is still
      // something the citizen marked, and hiding it would lose the mark.
      q.folder === 'starred' ? { ownerId: userId, starred: true, NOT: { folder: 'trash' } }
      : q.folder === 'inbox' ? { ownerId: userId, folder: 'inbox' }
      : q.folder === 'sent' ? { ownerId: userId, folder: 'sent' }
      : q.folder === 'draft' ? { ownerId: userId, folder: 'draft' }
      : q.folder === 'failed' ? { ownerId: userId, folder: 'failed' }
      // One room for everything still waiting on the citizen.
      : q.folder === 'unsent' ? { ownerId: userId, folder: { in: ['draft', 'failed'] } }
      : { ownerId: userId, folder: 'trash' };
    const where = { ...folderWhere, ...filed };
    /**
     * SEARCH, WHERE A CITIZEN EXPECTS IT: over the folder they are looking at.
     *
     * Five columns, because those are the five a person actually remembers a
     * message by — who it was from, who it went to, what it was about, and what
     * it said. Insensitive, because nobody recalls the capitalisation of a
     * subject line.
     *
     * ANDed with the folder clause rather than replacing it. A search that
     * silently escapes the folder you are standing in is how a citizen finds a
     * message in Trash while believing they are in the Inbox, and then replies
     * to it.
     */
    const needle = q.q;
    const filtered = needle
      ? {
        AND: [where, {
          OR: [
            { subject: { contains: needle, mode: 'insensitive' as const } },
            { fromName: { contains: needle, mode: 'insensitive' as const } },
            { fromAddr: { contains: needle, mode: 'insensitive' as const } },
            { toAddr: { contains: needle, mode: 'insensitive' as const } },
            { body: { contains: needle, mode: 'insensitive' as const } },
          ],
        }],
      }
      : where;
    // A mailbox only grows. Capped rather than paginated so the response shape
    // is unchanged; the cap is far above any current inbox.
    const rows = await this.prisma.mailMessage.findMany({ where: filtered, orderBy: { createdAt: 'desc' }, take: FEED_CAP });
    return rows.map((m) => this.shape(m));
  }

  async get(userId: string, id: string) {
    const m = await this.prisma.mailMessage.findFirst({ where: { id, ownerId: userId } });
    if (!m) throw new NotFoundException('message not found');
    if (!m.read) await this.prisma.mailMessage.update({ where: { id }, data: { read: true } });
    return { ...this.shape({ ...m, read: true }), body: m.body };
  }

  /**
   * Save what somebody is still writing.
   *
   * A draft is a working copy, not correspondence: it is addressed to nobody
   * until it is sent, so none of the send-time rules apply here. Not the
   * connection check (you may draft a note to somebody you have not connected
   * with yet), not the valid-address check (half an address is what a half
   * written message has), not thread ownership. Those all run at send.
   *
   * The QUOTA still applies, because a draft occupies the same mailbox — but
   * it is checked against the delta only, so editing a draft down in size
   * never fails on a full mailbox.
   *
   * Idempotent by id: the composer calls this every few seconds, and a
   * client that autosaves must not leave a trail of thirty near-identical
   * drafts behind it.
   */
  async saveDraft(userId: string, dto: SaveDraftDto) {
    const sender = await this.ensureAccount(userId);
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const subject = dto.subject.trim();
    const size = sizeOf(subject, dto.body);

    if (dto.id) {
      const existing = await this.prisma.mailMessage.findFirst({ where: { id: dto.id, ownerId: userId, folder: 'draft' } });
      if (!existing) throw new NotFoundException('draft not found');
      const delta = size - existing.sizeBytes;
      if (delta > 0 && (await this.usedBytes(userId)) + delta > QUOTA_BYTES) {
        throw new BadRequestException('Your 10 GB mailbox is full. Delete some mail and try again.');
      }
      const updated = await this.prisma.mailMessage.update({
        where: { id: dto.id },
        data: {
          toAddr: dto.to.trim(), toName: dto.to.trim(), subject, body: dto.body,
          snippet: snippetOf(dto.body), sizeBytes: size,
        },
      });
      return { ...this.shape(updated), body: updated.body };
    }

    if ((await this.usedBytes(userId)) + size > QUOTA_BYTES) {
      throw new BadRequestException('Your 10 GB mailbox is full. Delete some mail and try again.');
    }
    const created = await this.prisma.mailMessage.create({
      data: {
        ownerId: userId, boxUserId: userId, folder: 'draft',
        fromAddr: sender.address, fromName: me?.name ?? 'You',
        toAddr: dto.to.trim(), toName: dto.to.trim(),
        subject, body: dto.body, snippet: snippetOf(dto.body), sizeBytes: size,
        // Read: a draft is your own words — there is nothing here you have not
        // seen, and an unread badge on your own unfinished note is noise.
        read: true, system: false, threadId: dto.threadId ?? null,
      },
    });
    return { ...this.shape(created), body: created.body };
  }

  /**
   * Throw a draft away — deleted outright rather than moved to Trash.
   *
   * Trash is where correspondence goes to be recoverable: things other people
   * sent, or that were actually sent. A draft nobody ever received is a
   * working copy, and filing every abandoned one in Trash turns Trash into a
   * junk drawer of half-sentences. `remove()` keeps its own behaviour for
   * everything else, including failed messages, which ARE a record of an
   * attempt and stay recoverable.
   */
  async discardDraft(userId: string, id: string) {
    const m = await this.prisma.mailMessage.findFirst({ where: { id, ownerId: userId, folder: 'draft' } });
    if (!m) throw new NotFoundException('draft not found');
    await this.prisma.mailMessage.delete({ where: { id } });
    return this.list(userId, { folder: 'unsent' });
  }

  /**
   * The draft a send came from, removed once the message is away.
   *
   * Deliberately forgiving: a draft that is already gone (two tabs, a double
   * tap) is not an error worth failing a delivered message over. What must
   * never happen is the opposite — a sent message that still has a draft,
   * which the citizen would later resume and send a second time.
   */
  private async clearDraft(userId: string, draftId?: string): Promise<void> {
    if (!draftId) return;
    await swallow(
      this.prisma.mailMessage.deleteMany({ where: { id: draftId, ownerId: userId, folder: 'draft' } }),
      'mail: clear draft after send', { userId, draftId },
    );
  }

  /** Send a message to another citizen — writes a Sent copy for the sender and an Inbox copy for the recipient. */
  /**
   * CC AND BCC, AND THE ONE RULE THAT MAKES THEM DIFFERENT.
   *
   * Cc travels on every copy. Being openly copied is a fact all the recipients
   * share, and withholding it would quietly turn Cc into Bcc.
   *
   * Bcc travels on the SENDER'S copy alone. A recipient's row carrying it would
   * name everybody who was blind-copied, to every reader, which is the single
   * thing Bcc exists to prevent — and it would do so silently, because nothing
   * on the screen would look wrong. So the rule is enforced where the rows are
   * written, not where they are read: a reader that forgot to hide it would be
   * a leak, and there will be more readers than writers.
   *
   * The copies are fanned out one recipient at a time through the same path a
   * single send already takes, so every recipient gets the same connection
   * check, the same quota accounting and the same both-copies-or-neither
   * transaction. A send to five people that half-works reports which halves.
   */
  private async fanOut(userId: string, dto: SendMailDto): Promise<{ sent: string[]; failed: Array<{ to: string; reason: string }> }> {
    const seen = new Set<string>();
    const norm = (a: string) => a.trim().toLowerCase();
    const queue: Array<{ addr: string; blind: boolean }> = [];
    const push = (addr: string, blind: boolean) => {
      const a = addr.trim();
      // A person on both To and Cc gets ONE copy, not two. Deduplicating on
      // the way in is the only place it can be done once for every path below.
      if (!a || seen.has(norm(a))) return;
      seen.add(norm(a));
      queue.push({ addr: a, blind });
    };
    push(dto.to, false);
    for (const a of dto.cc ?? []) push(a, false);
    for (const a of dto.bcc ?? []) push(a, true);

    const cc = (dto.cc ?? []).map((a) => a.trim()).filter(Boolean);
    const bcc = (dto.bcc ?? []).map((a) => a.trim()).filter(Boolean);
    const sent: string[] = [];
    const failed: Array<{ to: string; reason: string }> = [];

    for (const [i, r] of queue.entries()) {
      try {
        await this.sendOne(userId, {
          ...dto, to: r.addr,
          // The sender keeps ONE Sent copy, written with the first recipient,
          // and it is the only row that ever carries the blind list. Later
          // recipients write an inbox row and nothing else.
          keepSentCopy: i === 0,
          ccAddrs: cc.length ? cc.join(', ') : null,
          bccAddrs: i === 0 && bcc.length ? bcc.join(', ') : null,
        });
        sent.push(r.addr);
      } catch (e) {
        failed.push({ to: r.addr, reason: (e as Error).message });
      }
    }
    return { sent, failed };
  }

  /**
   * The public door. One message, any number of recipients.
   *
   * It reports which addresses were accepted and which were not, per address,
   * because "could not send" on a message going to five people is an error the
   * citizen cannot act on — they do not know whether to retype one address or
   * all five.
   */
  async send(userId: string, dto: SendMailDto) {
    const { sent, failed } = await this.fanOut(userId, dto);
    if (sent.length === 0) {
      throw new BadRequestException(
        failed[0]?.reason ?? 'That message could not be sent.',
      );
    }
    await this.clearDraft(userId, dto.draftId);
    return { ...(await this.list(userId, { folder: 'sent' })), delivered: sent, failed };
  }

  private async sendOne(userId: string, dto: SendMailDto & {
    keepSentCopy: boolean; ccAddrs: string | null; bccAddrs: string | null;
  }) {
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

    // The directory only offers connections; enforce the same rule here, or the
    // restriction is decoration that anyone can step around by typing a handle.
    if (!(await this.isConnected(userId, recipient.id))) {
      throw new ForbiddenException(
        `You can only write to citizens you're connected with. Send ${recipient.name} a connection request first.`,
      );
    }

    const subject = dto.subject?.trim() || '(no subject)';
    const size = sizeOf(subject, dto.body);
    const used = await this.usedBytes(userId);
    if (used + size > QUOTA_BYTES) throw new BadRequestException('Your 10 GB mailbox is full. Delete some mail and try again.');

    // Reply → reuse the parent thread (only if the sender actually owns a message
    // in it, so threads can't be spoofed); otherwise start a new trail.
    const threadId = await this.resolveThreadId(userId, dto.threadId);
    // THE FILING IS THE SENDER'S, NOT THE MESSAGE'S. It goes on their Sent row
    // below and never into `base` — a recipient's copy stamped with the
    // sender's project would put a stranger's mail in a room they never made.
    const projectId = await this.resolveSendProject(userId, threadId, dto.projectId);
    const toAddr = addressFor(recipient.handle);
    const base = {
      fromAddr: sender.address, fromName: me.name, toAddr, toName: recipient.name,
      // Cc on every copy; Bcc is added to the sender's row alone, below.
      ccAddrs: dto.ccAddrs,
      subject, body: dto.body, snippet: snippetOf(dto.body), sizeBytes: size, system: false, threadId,
    };
    // BOTH COPIES OR NEITHER.
    //
    // sendExternal below carries a long note about why the Sent copy is written
    // only after the provider accepts: a failed send that still files a Sent
    // copy leaves the sender looking at an error AND a copy saying it had gone.
    // The internal path had the same shape and nobody had said so. It wrote the
    // sender's Sent row, then the recipient's Inbox row, as two separate
    // statements — so if the second one failed, the sender kept a Sent copy of
    // a message that had reached nobody, and there is no provider error on this
    // path to contradict it. Silently, and permanently.
    //
    // For internal mail, Sent means it is in their mailbox. The array form of
    // $transaction is the whole fix: two writes, no read between them, so there
    // is no decision here to serialise — only atomicity, which is what was
    // missing.
    if (recipient.id !== userId) {
      // Outside the transaction on purpose: creating a mailbox is idempotent and
      // harmless on its own, and it is not part of the claim being made.
      await this.prisma.mailAccount.findUnique({ where: { userId: recipient.id } }).then((a) => a ?? this.ensureAccount(recipient.id));
    }
    await this.prisma.$transaction([
      // The sender's Sent copy, written once for the whole message rather than
      // once per recipient — five rows in Sent for one message is five things
      // to delete and four lies about how many messages were written. It is
      // also THE ONLY ROW that ever carries the blind list.
      ...(dto.keepSentCopy
        ? [this.prisma.mailMessage.create({ data: { ...base, bccAddrs: dto.bccAddrs, ownerId: userId, boxUserId: userId, folder: 'sent', read: true, projectId } })]
        : []),
      // The recipient's Inbox copy. bccAddrs is absent, not blanked — a column
      // that is present and empty is one somebody later fills in "for
      // completeness".
      ...(recipient.id !== userId
        ? [this.prisma.mailMessage.create({ data: { ...base, ownerId: recipient.id, boxUserId: recipient.id, folder: 'inbox', read: false } })]
        : []),
    ]);
    await this.linkAttachments(userId, threadId, dto.attachmentFileIds);
    return this.list(userId, { folder: 'sent' });
  }

  /** Send to a GLOBAL (external) email address via the email provider (Resend).
   *  Keeps a Sent copy in the city; logs the dispatch to the outbox. */
  private async sendExternal(userId: string, fromAddr: string, fromName: string, toEmail: string,
    dto: SendMailDto & { keepSentCopy?: boolean; ccAddrs?: string | null; bccAddrs?: string | null }) {
    const subject = dto.subject?.trim() || '(no subject)';
    const size = sizeOf(subject, dto.body);
    const used = await this.usedBytes(userId);
    if (used + size > QUOTA_BYTES) throw new BadRequestException('Your 10 GB mailbox is full. Delete some mail and try again.');

    // Same anti-spoof rule as the internal path. This used to be a bare
    // `dto.threadId ?? randomUUID()`, which let one external mail carrying a
    // stranger's threadId mint an owned row in their thread — enough to pass the
    // participant check on the attachment routes and presign their Drive files.
    const threadId = await this.resolveThreadId(userId, dto.threadId);
    // Which room this correspondence lives in — the thread's if it has one,
    // otherwise the project Compose was opened from. See resolveSendProject.
    const projectId = await this.resolveSendProject(userId, threadId, dto.projectId);
    // DISPATCH FIRST, then file it (p21, FE-14.1).
    //
    // The Sent copy used to be written here, before the provider was called,
    // and it was never removed when the provider refused the message. So a
    // failed send left the sender looking at an error AND a copy in Sent
    // saying it had gone — two screens disagreeing about one fact, which is
    // the class of bug this whole review is about. During the delivery outage
    // earlier this week every rejection did exactly that.
    //
    // Sent now means the provider accepted it. Nothing else is ever in there.
    const footer = `\n\n${'─'.repeat(28)}\nSent by ${fromName} (${fromAddr}) via Together City Mail.`;
    const provider = createMessagingProvider('email');
    // Real MIME attachments so external recipients get the actual files.
    const { attachments, linkFooter } = await this.loadOutboundAttachments(userId, dto.attachmentFileIds);
    // Leave AS the citizen: From is their own city address, and replies are
    // directed back to it so they land in THEIR inbox (via the inbound webhook),
    // not the shared branded box. fromAddr is always a verified-domain
    // @togethercity.app address, so this is DKIM-aligned and deliverable.
    const fromHeader = cityFromHeader(fromName, fromAddr);
    const res = await provider
      .send({ channel: 'email', to: toEmail, subject, body: dto.body + linkFooter + footer, kind: 'mail', from: fromHeader, replyTo: fromAddr, ...(attachments.length ? { attachments } : {}) })
      .catch((e: Error) => ({ provider: provider.name, providerMessageId: null as string | null, status: 'failed' as const, error: e.message }));
    // The delivery audit row is how an outage gets diagnosed (see the mail
    // postmortem) — losing it silently blinds exactly that investigation.
    await swallow(this.prisma.emailDelivery.create({
      data: {
        userId, channel: 'email', toEmail, kind: 'mail', subject, body: dto.body,
        provider: res.provider, providerMessageId: res.providerMessageId ?? undefined, status: res.status,
      },
    }), 'mail: delivery audit write', { userId, kind: 'mail' });

    // The stub provider reports 'sent' so demo and dev never block; only a
    // CONFIGURED provider's refusal is a real failure.
    const failed = res.status === 'failed' && messagingConfigured('email');
    const reason = failed
      ? ((res as { error?: string }).error ?? 'The mail provider would not accept this message.')
      : null;

    await this.prisma.mailMessage.create({
      data: {
        ownerId: userId, boxUserId: userId,
        folder: failed ? 'failed' : 'sent',
        read: true,
        fromAddr, fromName, toAddr: toEmail, toName: toEmail,
        // Same rule as the internal path: Cc is shared, Bcc is the sender's
        // alone, and this row belongs to the sender.
        ccAddrs: dto.ccAddrs ?? null,
        bccAddrs: dto.bccAddrs ?? null,
        subject, body: dto.body, snippet: snippetOf(dto.body), sizeBytes: size, system: false, threadId,
        // A failed message keeps its room too, so Retry sends from the same
        // place and the citizen finds it where they left it.
        projectId,
        // The message is kept either way. A failed send that vanishes takes the
        // citizen's writing with it, which is worse than a wrong folder.
        ...(reason ? { failureReason: reason } : {}),
        ...(res.providerMessageId ? { providerMessageId: res.providerMessageId } : {}),
        // Only on a failure, and only so Retry can send the same files. A
        // retry that quietly dropped the attachments would arrive incomplete,
        // which is a worse outcome than the failure it was fixing.
        ...(failed && dto.attachmentFileIds?.length ? { attachmentIds: JSON.stringify(dto.attachmentFileIds) } : {}),
      },
    });

    // Keep the attachments visible on whichever copy was written.
    await this.linkAttachments(userId, threadId, dto.attachmentFileIds);

    if (failed) {
      throw new BadRequestException(
        `Couldn't deliver to ${toEmail}. It's saved in Failed — open it there to see why and try again.`,
      );
    }
    return this.list(userId, { folder: 'sent' });
  }

  /* ══ PROJECTS — THE ROOMS INSIDE A MAILBOX ════════════════════════════════

     A project files THREADS, for one citizen, and it does exactly two things
     to the mail: it puts a name on a conversation, and it lets a folder query
     ask for one room instead of all of them. It never removes a message from
     All Email, it never has an address of its own, and nothing in this block
     ever decides on a citizen's behalf that a message belongs somewhere.

     There are three ways a thread gets into a room, and every one of them is
     something a person did: they composed from inside it, the trail was
     already filed and this message inherited it, or they moved it by hand.  */

  /** A project of this citizen's, by key. 404 rather than an empty list — see
   *  the note on FolderQuerySchema.project. */
  private async projectByKey(userId: string, key: string) {
    const p = await this.prisma.mailProject.findFirst({ where: { ownerId: userId, key } });
    if (!p) throw new NotFoundException(`No project called “${key}” in your mailbox.`);
    return p;
  }

  /** The room a sub-addressed arrival names, if the citizen switched that on
   *  for it. Archived projects accept nothing new — that is what archived
   *  means — so mail to a retired tag lands in All Email rather than in a room
   *  nobody is reading. */
  private async subAddressProject(userId: string, tag: string | null): Promise<string | null> {
    if (!tag) return null;
    const p = await this.prisma.mailProject.findFirst({
      where: { ownerId: userId, key: tag, subAddress: true, archived: false },
      select: { id: true },
    });
    return p?.id ?? null;
  }

  /**
   * Every project with what a card has to say: what is waiting, how much is in
   * there, and what last happened.
   *
   * THE LAST MESSAGE IS ONE QUERY PER PROJECT, deliberately. It is at most
   * fifty indexed `findFirst`s on a screen that loads once, and the alternative
   * — reading the newest N rows of the whole mailbox and reducing in memory —
   * silently loses the last line of any project quiet enough to have fallen off
   * the end, which is precisely the project whose card most needs to say when
   * it last moved.
   */
  async projects(userId: string) {
    const acct = await this.ensureAccount(userId);
    const rows = await this.prisma.mailProject.findMany({
      where: { ownerId: userId },
      orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
      take: PROJECT_CAP,
    });

    // Two grouped counts for the whole mailbox rather than two per project.
    // Trash is excluded from the total for the same reason the folder list
    // excludes it: a card claiming eighty-four messages, twelve of which the
    // citizen has already thrown away, is counting the wrong thing.
    const tally = async (where: Record<string, unknown>): Promise<Map<string, number>> => {
      const rowsOut = await this.prisma.mailMessage.groupBy({
        by: ['projectId'],
        where: { ownerId: userId, projectId: { not: null }, ...where },
        _count: { _all: true },
      });
      const m = new Map<string, number>();
      for (const r of rowsOut) if (r.projectId) m.set(r.projectId, r._count._all);
      return m;
    };
    const totals = await tally({ NOT: { folder: 'trash' } });
    const unreads = await tally({ folder: 'inbox', read: false });

    const lasts = await Promise.all(rows.map((p) => this.prisma.mailMessage.findFirst({
      where: { ownerId: userId, projectId: p.id, NOT: { folder: 'trash' } },
      orderBy: { createdAt: 'desc' },
      select: { fromName: true, toName: true, folder: true, createdAt: true },
    })));

    return rows.map((p, i) => {
      const last = lasts[i];
      return {
        id: p.id, name: p.name, key: p.key,
        subAddress: p.subAddress,
        // Shown on the card only when it is on, because an address a citizen
        // has not switched on is not an address they can hand out.
        address: p.subAddress ? subAddressed(acct.address, p.key) : null,
        archived: p.archived,
        createdAt: p.createdAt.toISOString(),
        total: totals.get(p.id) ?? 0,
        unread: unreads.get(p.id) ?? 0,
        last: last
          ? {
            // The Sent side of a trail says who it went to; the Inbox side says
            // who it came from. A card that always says "from" reads as a lie
            // on a project where the citizen is the one doing the writing.
            who: last.folder === 'sent' || last.folder === 'failed' ? last.toName : last.fromName,
            outbound: last.folder === 'sent' || last.folder === 'failed',
            at: last.createdAt.toISOString(),
          }
          : null,
      };
    });
  }

  async createProject(userId: string, dto: CreateProjectDto) {
    await this.ensureAccount(userId);
    const count = await this.prisma.mailProject.count({ where: { ownerId: userId } });
    if (count >= PROJECT_CAP) {
      throw new BadRequestException(
        `You already have ${PROJECT_CAP} projects, which is the limit. Delete or rename one to make room — deleting a project never deletes its mail.`,
      );
    }
    const clash = await this.prisma.mailProject.findFirst({ where: { ownerId: userId, key: dto.key }, select: { name: true } });
    if (clash) throw new BadRequestException(`“${dto.key}” is already the key for ${clash.name}. Pick another.`);
    const p = await this.prisma.mailProject.create({
      data: { ownerId: userId, name: dto.name, key: dto.key, subAddress: dto.subAddress },
    });
    // NOTHING IS SWEPT IN. A project opens empty because nothing has happened
    // in it yet; back-filling it from a guess about old mail is the one thing
    // this design refuses to do.
    return this.projects(userId).then((all) => ({ projects: all, created: p.key }));
  }

  async updateProject(userId: string, id: string, dto: UpdateProjectDto) {
    const owned = await this.prisma.mailProject.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('No project with that id in your mailbox.');
    await this.prisma.mailProject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.subAddress !== undefined ? { subAddress: dto.subAddress } : {}),
        ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
      },
    });
    return this.projects(userId);
  }

  /**
   * DELETING A PROJECT DELETES NOTHING ELSE.
   *
   * The filing is cleared and the room is closed; every conversation returns
   * to All Email, where it always was. The count of what was released is
   * returned so the client can say it out loud rather than leaving somebody to
   * wonder what just happened to eighty-four messages.
   */
  async deleteProject(userId: string, id: string) {
    const owned = await this.prisma.mailProject.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('No project with that id in your mailbox.');
    const released = await this.prisma.mailMessage.updateMany({
      where: { ownerId: userId, projectId: id },
      data: { projectId: null },
    });
    await this.prisma.mailProject.delete({ where: { id } });
    return { ok: true, released: released.count, projects: await this.projects(userId) };
  }

  /**
   * Move a conversation into a room, or out of one (`projectId: null`).
   *
   * THE ONLY WRITER OF THE FILING, which is the invariant the denormalised
   * column depends on: every row of the trail moves in one statement, so half
   * a conversation can never be in a different room from the other half.
   *
   * Bounded to threads the caller holds a message in — the same participation
   * check the attachment routes use — so a threadId typed into a request
   * cannot file somebody else's correspondence.
   */
  async fileThread(userId: string, dto: FileThreadDto) {
    const owns = await this.prisma.mailMessage.findFirst({
      where: { ownerId: userId, threadId: dto.threadId }, select: { id: true },
    });
    if (!owns) throw new NotFoundException('No conversation with that id in your mailbox.');
    if (dto.projectId) {
      const p = await this.prisma.mailProject.findFirst({
        where: { id: dto.projectId, ownerId: userId }, select: { id: true },
      });
      if (!p) throw new NotFoundException('No project with that id in your mailbox.');
    }
    const moved = await this.prisma.mailMessage.updateMany({
      where: { ownerId: userId, threadId: dto.threadId },
      data: { projectId: dto.projectId },
    });
    return { ok: true, moved: moved.count };
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
   * File an INBOUND external email (typically a reply to a citizen's
   * <handle>@togethercity.app address) into THAT citizen's inbox — and nobody
   * else's. Called by the Resend inbound webhook (MailInboundController).
   *
   * AUTHENTICATION IS NOT HERE. It is InboundSecretGuard, on the route. This
   * method assumes the caller has already been proven to be the provider, and
   * must never be reachable any other way — see that guard for why the check
   * moved out of this function.
   */
  async ingestInbound(payload: unknown) {
    const mail = normalizeInbound(payload);
    if (!mail) {
      this.logger.warn('inbound mail: unrecognised payload shape');
      return { ok: false, reason: 'unparseable' };
    }

    // The reply is addressed to one or more city handles; deliver a copy to each
    // matching citizen. An address we don't recognise is ignored — it was never
    // ours to receive. handleFromAddress returns null for any domain outside
    // CITY_DOMAINS, so a stranger's address cannot name a mailbox here.
    const recipients = mail.to.map(cityRecipient).filter((r): r is { handle: string; tag: string | null } => Boolean(r));
    // One copy per mailbox, keeping the FIRST tag seen for it. Two addresses
    // naming the same citizen is one delivery, and the tag that came with it
    // is a hint about filing, never a reason to deliver twice.
    const byHandle = new Map<string, string | null>();
    for (const r of recipients) if (!byHandle.has(r.handle)) byHandle.set(r.handle, r.tag);
    const handles = [...byHandle.keys()];
    if (!handles.length) {
      this.logger.warn('inbound mail: no city recipient in To');
      return { ok: false, reason: 'no-city-recipient' };
    }

    let delivered = 0;
    for (const handle of handles) {
      const user = await this.prisma.user.findUnique({ where: { handle }, select: { id: true, name: true, deletedAt: true } });
      // A deleted account keeps its row so other citizens' conversations survive
      // (see User.deletedAt). It must not keep receiving mail.
      if (!user || user.deletedAt) continue;
      await this.ensureAccount(user.id);

      const subject = (mail.subject || '(no subject)').slice(0, 200);
      const body = (await this.inboundBody(mail)).slice(0, 50000);
      const size = sizeOf(subject, body);

      // An inbound message a citizen has no room for is dropped rather than
      // failing the whole webhook — the sender is external and cannot be bounced
      // from here.
      const used = await this.usedBytes(user.id);
      if (used + size > QUOTA_BYTES) {
        this.logger.warn(`inbound mail dropped: ${handle}'s mailbox is full`);
        continue;
      }

      const threadId = await this.resolveInboundThread(user.id, mail.from.addr, subject);
      /**
       * WHERE AN ARRIVING MESSAGE IS FILED, in the order the design fixed:
       *
       *   1. the trail it belongs to is already in a room → it goes there;
       *   2. it was addressed to you+<key>@ and that project accepts the
       *      sub-address → it goes there;
       *   3. otherwise: All Email, untagged.
       *
       * There is no third guess. No sender lists, no domain matching, no
       * scoring against a subject line — nothing here can put a message in a
       * room a citizen did not name, because nothing here does any inferring.
       */
      const projectId = (await this.threadProject(user.id, threadId))
        ?? (await this.subAddressProject(user.id, byHandle.get(handle) ?? null));
      await this.prisma.mailMessage.create({
        data: {
          ownerId: user.id, boxUserId: user.id, folder: 'inbox', read: false, system: false, projectId,
          fromAddr: mail.from.addr, fromName: mail.from.name || mail.from.addr,
          toAddr: addressFor(handle), toName: user.name ?? '',
          subject, body, snippet: snippetOf(body), sizeBytes: size, threadId,
          ...(mail.providerMessageId ? { providerMessageId: mail.providerMessageId } : {}),
        },
      });
      delivered++;
    }
    return { ok: true, delivered };
  }

  /**
   * The text of an inbound message — fetched, not read off the webhook.
   *
   * Resend's `email.received` payload is metadata: from, to, subject, an id,
   * attachment descriptions. "Webhooks do not include the email body, headers,
   * or attachments, only their metadata." A parser that reads `data.text` gets
   * nothing, every reply is filed with the right sender and subject and an
   * empty body, and the feature looks like it works. So the body comes from
   * emails.receiving.get(email_id).
   *
   * A payload that DOES carry text is still honoured first — a different
   * provider, or a replay from a fixture, should not need a network round trip
   * to be filed.
   *
   * WHEN THE FETCH FAILS THE MESSAGE STILL ARRIVES, AND SAYS SO. Dropping it
   * loses a reply the citizen was sent and never learns about; filing it blank
   * is the quiet wrong answer this whole method exists to avoid. The mail
   * postmortem's rule — the failure path is louder than the success path —
   * settles it: file the message, say the body could not be retrieved, and log
   * an error a human can act on.
   */
  private async inboundBody(mail: InboundMail): Promise<string> {
    const inline = mail.text || (mail.html ? mail.html.replace(/<[^>]*>/g, ' ') : '');
    if (inline.trim()) return inline;

    // NO BODY AND NO ID IS STILL A BLANK MESSAGE. Both of the next two branches
    // used to `return inline` — an empty string — which files exactly the silent
    // blank this method exists to prevent, and says nothing about it anywhere.
    // Every route out of here now either has text or admits it does not.
    if (!mail.emailId) {
      this.logger.error('inbound mail: no body in the payload and no email_id to fetch one with');
      return UNRETRIEVABLE;
    }
    const provider = createMessagingProvider('email');
    if (!provider.fetchReceived) {
      this.logger.error(`inbound mail: ${provider.name} cannot fetch a received body`);
      return UNRETRIEVABLE;
    }
    const fetched = await provider.fetchReceived(mail.emailId);
    if (fetched) {
      const text = fetched.text || (fetched.html ? fetched.html.replace(/<[^>]*>/g, ' ') : '');
      if (text.trim()) return text;
    }
    this.logger.error(`inbound mail: could not retrieve the body of ${mail.emailId} — filing the message without it`);
    return UNRETRIEVABLE;
  }

  /** Reuse an existing trail when this citizen already corresponds with this
   *  external address under the same (normalised) subject; otherwise a new
   *  thread. Best-effort, since an inbound reply's headers can't be relied on to
   *  echo the id we sent. */
  private async resolveInboundThread(userId: string, fromAddr: string, subject: string): Promise<string> {
    const strip = (t: string) => t.replace(/^\s*(re|fwd?)\s*:\s*/i, '').trim().toLowerCase();
    const norm = strip(subject);
    const prior = await this.prisma.mailMessage.findFirst({
      where: { ownerId: userId, OR: [{ fromAddr }, { toAddr: fromAddr }] },
      orderBy: { createdAt: 'desc' },
      select: { threadId: true, subject: true },
    });
    if (prior?.threadId && strip(prior.subject) === norm) return prior.threadId;
    return randomUUID();
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
    // Every message opens by addressing the person. Applied here rather than in
    // each of the eight callers and five receipt builders, because the rule is
    // "always" and a rule enforced in thirteen places gets missed in the
    // fourteenth. Anything that writes its own salutation is left alone.
    const greeted = {
      ...r,
      body: (channel === 'sms' ? greetSms : greetText)(r.body, user?.name),
      ...(r.html ? { html: greetHtml(r.html, user?.name) } : {}),
    };
    const target = channel === 'sms' ? (user?.phone ?? null) : (user?.email ?? null);
    const footer = target
      ? `\n\n${'─'.repeat(28)}\n${channel === 'sms' ? '📱 Also sent by SMS to' : '📧 A copy was also emailed to your primary address:'} ${target}`
      : '';
    const cityBody = `${greeted.body}${footer}`;
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
      const res = await provider.send({ channel, to: target, subject, body: greeted.body, ...(channel === 'email' && greeted.html ? { html: greeted.html } : {}), kind }).catch(() => ({ provider: provider.name, providerMessageId: null as string | null, status: 'failed' as const }));
      await swallow(this.prisma.emailDelivery.create({
        data: {
          userId, channel, toEmail: channel === 'email' ? target : null, toPhone: channel === 'sms' ? target : null,
          kind, subject, body: r.body, provider: res.provider, providerMessageId: res.providerMessageId ?? undefined, status: res.status,
        },
      }), 'mail: delivery audit write', { userId, kind });
    }
    return { deliveredToInbox: true, dispatchedTo: target, channel };
  }

  /**
   * Dispatch to a specific address or number, rather than to whatever is on the
   * user's record.
   *
   * Verification needs this and deliverSystem cannot provide it: the whole point
   * of verifying a phone is that the number is not yet trusted enough to be the
   * account's phone, so "send to user.phone" is the wrong instruction. It also
   * skips the city inbox copy — a code is not correspondence, and filing six
   * digits in a mailbox that a session hijacker can read would undo the reason
   * for sending it.
   */
  async deliverTo(
    userId: string,
    channel: Channel,
    target: string,
    r: { subject: string; body: string; html?: string },
    kind: 'receipt' | 'recovery' | 'security' | 'welcome' = 'security',
  ): Promise<{ ok: boolean; provider: string; status: string }> {
    const provider = createMessagingProvider(channel);
    // Same rule as deliverSystem. A verification code that opens "Dear Somen,"
    // reads as a message from somebody rather than from a system.
    const who = await swallow(this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }), 'mail: recipient name read', { userId });
    const body = (channel === 'sms' ? greetSms : greetText)(r.body, who?.name);
    const html = r.html ? greetHtml(r.html, who?.name) : undefined;
    const res = await provider
      .send({ channel, to: target, subject: r.subject, body, ...(channel === 'email' && html ? { html } : {}), kind })
      .catch((e: Error) => ({ provider: provider.name, providerMessageId: null as string | null, status: 'failed' as const, error: e.message }));
    if (res.status === 'failed') {
      // Loud, and at the point of dispatch. The provider logs its own reason;
      // this says which flow lost a message, which is what tells you a citizen
      // is sitting on a verification screen waiting for a code that is not
      // coming.
      this.logger.error(`delivery FAILED user=${userId} channel=${channel} kind=${kind} — ${'error' in res ? res.error : 'no reason reported'}`);
    }
    await swallow(this.prisma.emailDelivery.create({
      data: {
        userId, channel,
        toEmail: channel === 'email' ? target : null,
        toPhone: channel === 'sms' ? target : null,
        // The body is deliberately NOT the code. This row is an audit trail of
        // what we dispatched and whether it left; it is readable by anyone who
        // can read the table, and a code sitting in it would be a second copy
        // of the secret with none of the hashing.
        kind, subject: r.subject, body: '(verification code redacted)',
        provider: res.provider, providerMessageId: res.providerMessageId ?? undefined, status: res.status,
      },
    }), 'mail: delivery audit write', { userId, kind });
    return { ok: res.status !== 'failed', provider: res.provider, status: res.status };
  }

  /** The outbound-delivery log — every email/SMS dispatched through the provider. */
  async outbox(userId: string) {
    const rows = await this.prisma.emailDelivery.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((d) => ({
      id: d.id, channel: d.channel, to: d.channel === 'sms' ? d.toPhone : d.toEmail, kind: d.kind, subject: d.subject,
      provider: d.provider, providerMessageId: d.providerMessageId, status: d.status, createdAt: d.createdAt.toISOString(),
    }));
  }

  /**
   * The citizens this person is actually connected to.
   *
   * Mail is a Universal hub, so an accepted connection is enough — no per-hub
   * permission is required to write to someone. But the connection itself IS
   * required: the city is not a phone book, and every signed-up account being
   * addressable by every other is how a small city becomes a spam problem.
   *
   * Only ACCEPTED counts. A pending request is not a relationship yet, and
   * BLOCKED/REMOVED is the opposite of one.
   */
  private async connectedIds(userId: string): Promise<string[]> {
    // unbounded: a citizen's ACCEPTED connections feed the address-book id
    // set; the visible list downstream is already capped at 200
    const rows = await this.prisma.connection.findMany({
      where: {
        status: ConnectionStatus.ACCEPTED,
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
      select: { userOneId: true, userTwoId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) ids.add(r.userOneId === userId ? r.userTwoId : r.userOneId);
    ids.delete(userId);
    return [...ids];
  }

  /** Are these two connected? Used to stop a hand-typed address from reaching
   *  someone the directory would never have offered. */
  private async isConnected(userId: string, otherId: string): Promise<boolean> {
    if (userId === otherId) return true; // a note to yourself is always allowed
    const hit = await this.prisma.connection.findFirst({
      where: {
        status: ConnectionStatus.ACCEPTED,
        OR: [
          { userOneId: userId, userTwoId: otherId },
          { userOneId: otherId, userTwoId: userId },
        ],
      },
      select: { id: true },
    });
    return !!hit;
  }

  /** Your address book — the citizens you're connected to, not the whole city. */
  async directory(userId: string) {
    const ids = await this.connectedIds(userId);
    if (!ids.length) return [];
    // Service providers are excluded even when connected: doctors/dietitians are
    // Users so a booking can open a chat, but they are not people you email.
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids }, doctorProfile: { is: null }, dietitianProfile: { is: null } },
      select: { handle: true, name: true }, orderBy: { name: 'asc' }, take: 200,
    });
    return rows.map((u) => ({ handle: u.handle, name: u.name, address: addressFor(u.handle) }));
  }
}

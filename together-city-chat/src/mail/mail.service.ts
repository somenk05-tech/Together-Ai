import { swallow } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConnectionStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FEED_CAP } from '../shared/paging';
import { StorageProvider } from '../media/storage.provider';
import type { OutboundAttachment } from './messaging-provider';
import { greetHtml, greetSms, greetText } from './greet';
import { parseE164 } from '../auth/verification-policy';
import { normalizeDeliveryEvent, unsubscribeToken, type DeliveryEvent } from './mail-inbound';
import { report } from '../shared/errors/sentry';

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
/**
 * HOW MANY TIMES A SYSTEM MESSAGE IS OFFERED TO THE PROVIDER (fifth audit,
 * 29 Aug).
 *
 * There was one attempt and no second. A Resend timeout or 5xx during a
 * password reset was a permanently lost code — and the citizen could not be
 * told, because the forgot response has to read identically whether or not the
 * account exists, so "delivery failed" is a sentence this route is not allowed
 * to say. With nothing retrying, the only recovery was for them to guess that
 * nothing was coming and ask again.
 *
 * INLINE AND BOUNDED, rather than a durable queue, and the reason is what
 * these messages carry. A queued job holds its rendered body in Redis until it
 * completes or is reaped, and the body of the message this most needs to save
 * IS the six-digit code — a second copy of the secret, unhashed, outliving the
 * request that made it. Three attempts a second and a half apart cover the
 * transient failure, which is nearly all of them, and keep the code in memory
 * only. A failure that survives a process restart is a code already too old to
 * use: they expire in thirty minutes and a resend is one tap.
 *
 * A permanent refusal — a malformed address — is retried too, because the
 * provider does not tell us which kind it is in any shape we can rely on.
 * Resend rejects those immediately, so the cost is two fast round trips.
 */
const SEND_ATTEMPTS = 3;
const SEND_RETRY_MS = 500;

/**
 * ── SUPPRESSION: WHICH SILENCE MEANS WHICH (fifth audit, 29 Aug) ───────────
 *
 * A HARD BOUNCE is the address saying it does not exist. Nothing may go to it
 * again — not a receipt, not a recovery code — because there is nobody there
 * to read one and every attempt is a mark against the domain that carries
 * every OTP this city sends.
 *
 * A COMPLAINT or an UNSUBSCRIBE is a person saying they do not want to hear
 * from us. That is an answer about the mail they were being sent, not about
 * their account: somebody who marked a receipt as spam and later forgets their
 * password must still be able to get back in. So those two silence the
 * discretionary kinds and leave the two a citizen has just asked for.
 *
 * Getting this backwards in either direction is a real failure. Suppressing
 * recovery on a complaint locks people out of their own accounts; NOT
 * suppressing receipts after a complaint is how the next complaint arrives.
 */
const ESSENTIAL_KINDS = new Set(['recovery', 'security']);

/** How long a one-click unsubscribe link stays good. Long, because it lives in
 *  a mail client and mail clients are read late. */
const UNSUBSCRIBE_TTL_MS = 180 * 24 * 3600 * 1000;

/** The refusal `send()` throws when nothing was delivered, carrying whether the
 *  attempt nevertheless filed a row of its own. Only `retry()` reads it, and
 *  only to decide whether the row it started from has been superseded. */
type FiledFailure = Error & { filedARow?: boolean };

const MIME_BUDGET_BYTES = 20 * 1024 * 1024;          // safely under provider caps
const MAX_OUTBOUND_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB across attachments
const SHARE_LINK_TTL_SEC = 7 * 24 * 3600;            // 7 days (S3/R2 maximum)
/**
 * How many city mailboxes ONE arriving email may be delivered to.
 *
 * The webhook is reachable by anyone who can get a message through the
 * provider's MX, and the loop below does a body fetch over the network and a
 * whole-mailbox scan PER RECIPIENT, inline, in the request. A single email
 * addressed to a thousand handles was a thousand of each, in one handler.
 * Fifty is far above any real To line and far below a useful lever.
 */
const MAX_INBOUND_RECIPIENTS = 50;
/**
 * THE OUTBOUND BUDGET, and why the city needs one at all.
 *
 * Writing to a fellow citizen requires an accepted connection. Writing to any
 * address on the public internet required nothing: the external branch of
 * `sendOne` returns before the connection check, and `cc`/`bcc` accept 25 each,
 * so one API call dispatched 51 separately-addressed messages — every one of
 * them From a DKIM-aligned <handle>@togethercity.app that passes DMARC.
 *
 * The global throttler is 120 requests a minute. That is sized for ordinary
 * API traffic, not for an endpoint that turns one request into fifty-one
 * emails, and it counts requests rather than recipients — so it was no
 * ceiling on sending at all.
 *
 * The cost of getting this wrong is not this citizen's account. System mail —
 * password recovery, security notices — leaves on the SAME verified domain, so
 * a burnt sender reputation locks everybody out of their own accounts. The
 * budget is the cheapest thing standing between one abused signup and that.
 *
 * Externals only. A message to citizens is already gated by the connection
 * rule, and counting it here would make the cap bite the people it is not for.
 *
 * A ROLLING WINDOW, not a calendar day: no timezone to argue about, and no
 * midnight at which a full budget becomes an empty one.
 */
/**
 * THREADING IS CARRIED IN THE ID, NOT GUESSED FROM THE SUBJECT.
 *
 * Outbound mail set no Message-ID, no In-Reply-To and no References, so Gmail
 * and Outlook had nothing to thread on but the subject line — and the inbound
 * side had nothing to match on either, so `resolveInboundThread` fell back to
 * "the most recent message from this correspondent, if the Re:-stripped
 * subjects are identical". Two live conversations with one person was enough
 * to break it: a reply to the older one matched the newer one's subject,
 * failed, and started a third thread with no original beside it.
 *
 * The trail id is encoded INTO the ids we mint, so a reply that echoes any of
 * them back — every mail client echoes References — names its thread without
 * a lookup and without a new column.
 *
 *   Message-ID:  <t.{threadId}.{uuid}@togethercity.app>   unique per message
 *   References:  <t.{threadId}.thread@togethercity.app>   stable per thread
 *
 * A THREAD ID IN A HEADER IS A CLAIM, NOT A CREDENTIAL. `threadFromRefs` is
 * only ever believed after checking the citizen already holds a row in that
 * trail — otherwise a stranger could put their mail inside somebody's
 * conversation by writing one header, which is the same hole the draft path
 * had and closed.
 */
const threadAnchorId = (threadId: string): string => `<t.${threadId}.thread@${MAIL_DOMAIN}>`;
const threadMessageId = (threadId: string): string => `<t.${threadId}.${randomUUID()}@${MAIL_DOMAIN}>`;
// Built on call, not at module load: MAIL_DOMAIN is imported BELOW this block
// (this file interleaves its constants with its imports), so reading it here
// eagerly is a temporal-dead-zone crash at require time. Every mail suite fails
// to load, which is how this was caught.
const threadRef = (): RegExp =>
  new RegExp(`^<t\\.([0-9a-f-]{36})\\.[^@<>]+@${MAIL_DOMAIN.replace(/\./g, '\\.')}>$`, 'i');
const threadFromRefs = (refs: string[]): string | null => {
  const re = threadRef();
  for (const r of refs) {
    const m = re.exec(r.trim());
    if (m) return m[1].toLowerCase();
  }
  return null;
};

const EXTERNAL_RECIPIENTS_PER_MESSAGE = 10;
const EXTERNAL_SENDS_PER_DAY = 200;
/**
 * AND A CEILING ON CITY MAIL, WHICH HAD NONE (fifth audit, 29 Aug).
 *
 * `sendOne` writes an inbox row per internal recipient with no per-sender
 * limit, and the row is charged against the RECIPIENT'S quota — so a connected
 * citizen running a script could fill somebody's ten gigabytes in about a day
 * and a half, and a full mailbox then silently drops that person's inbound
 * external mail too.
 *
 * PER SENDER PER DAY, rather than per pair, because it is the simple control
 * that bounds the whole harm: a script cannot do it to one person and cannot
 * do it to a hundred either. Five hundred is far above anybody writing letters
 * and far below anybody filling a mailbox.
 */
const INTERNAL_SENDS_PER_DAY = 500;
const DAY_MS = 24 * 3600 * 1000;
import {
  MAIL_DOMAIN, CITY_DOMAINS, QUOTA_BYTES, addressFor, handleFromAddress, cityRecipient, subAddressed, snippetOf, sizeOf, welcomeMail, humanBytes, isCityAddress,
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
      // NEWEST FILING WINS, AND IT IS ORDERED SO THERE IS ONE ANSWER. Without
      // an orderBy this was "whatever the database hands back first" — fine
      // while a trail can only carry one room, and this method's whole purpose
      // is the case where that has not been established yet. Two rows with two
      // rooms used to make the answer differ between identical requests.
      orderBy: { createdAt: 'desc' },
      select: { projectId: true },
    });
    return row?.projectId ?? null;
  }

  /**
   * FILE THE WHOLE TRAIL, NOT THE ROW BEING WRITTEN.
   *
   * The filing is on the THREAD — `fileThread` says so and moves every row at
   * once — but the send path stamped only its own row, so replying from inside
   * a project to a conversation that was not filed anywhere put ONE message in
   * the room and left the other five in All Emails. The project showed a
   * fragment of a correspondence and nothing said why.
   *
   * Pressing "Compose in ABG" on a conversation means the conversation belongs
   * to ABG. This is that sentence, kept.
   *
   * No participation check here, deliberately: every caller has already
   * established that this citizen owns the trail — `resolveThreadId` for a
   * send, `resolveInboundThread` for an arrival — and the updateMany is scoped
   * to `ownerId` besides. The public `fileThread` keeps its checks, because
   * its threadId comes from a request.
   */
  private async fileWholeThread(userId: string, threadId: string, projectId: string): Promise<void> {
    await this.prisma.mailMessage.updateMany({
      where: { ownerId: userId, threadId },
      data: { projectId },
    });
  }

  /**
   * Which project a message being sent belongs to.
   *
   * The thread wins over the composer, always. Somebody replying to a filed
   * conversation from All Email has not asked to move it out of its room, and
   * a conversation that changes rooms depending on which screen the reply was
   * typed on is the exact instability a "project" is supposed to remove.
   */
  private async resolveSendProject(
    userId: string, threadId: string, key?: string,
  ): Promise<{ id: string; key: string; subAddress: boolean } | null> {
    const inherited = await this.threadProject(userId, threadId);
    if (inherited) {
      return this.prisma.mailProject.findFirst({
        where: { id: inherited, ownerId: userId },
        select: { id: true, key: true, subAddress: true },
      });
    }
    if (!key) return null;
    // A key that names no project of this citizen's files nothing rather than
    // failing the send: the message is the point, and the worst outcome of a
    // stale key is a message in All Emails, which is where it would be anyway.
    const owned = await this.prisma.mailProject.findFirst({
      where: { key, ownerId: userId, archived: false },
      select: { id: true, key: true, subAddress: true },
    });
    // The trail had no room and now it has one — so the trail moves, not just
    // the message about to be written. See fileWholeThread. A brand-new thread
    // has no rows yet and this is a no-op; the row being created carries the
    // filing on its own.
    if (owned) await this.fileWholeThread(userId, threadId, owned.id);
    return owned;
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
    /* AS A DOWNLOAD, NOT AS A PAGE. This is a file a stranger chose, sent by
       email, and the client opens the URL in a tab — so an .html or an .svg
       used to render, with script, on the storage origin. */
    const url = await this.storage.presignHealthDownload(f.storageKey, { asAttachment: true, filename: f.name });
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

  /**
   * THE ACCOUNT'S OWN ALLOWANCE. MailAccount.quotaBytes has existed since the
   * table was written and nothing ever read it — every check used the global
   * constant, so raising one citizen's quota did nothing at all, silently. It
   * is a BigInt column, hence the Number(); the constant is the answer for a
   * mailbox that somehow has no row.
   */
  private async quotaOf(userId: string): Promise<number> {
    const a = await this.prisma.mailAccount.findUnique({ where: { userId }, select: { quotaBytes: true } });
    // `a?.quotaBytes ?` rather than `a ?`: a row that somehow has no allowance
    // must fall back to the constant, not to Number(undefined) — which is NaN,
    // and every `used + size > NaN` is false, so the quota would stop applying
    // at all. Found by four spec harnesses whose stub accounts carry only an
    // address, which is exactly the shape this has to survive.
    return a?.quotaBytes ? Number(a.quotaBytes) : QUOTA_BYTES;
  }

  /**
   * WHAT "FULL" MEANS, SAID ONCE.
   *
   * The old sentence was "Your 10 GB mailbox is full. Delete some mail and try
   * again." — hardcoded to a number that is now per-account, and quiet about
   * the thing that actually traps people: `remove()` moves a message to Trash
   * and usedBytes sums every folder, so a citizen can delete five hundred
   * messages, watch the meter not move, and be told the same thing again with
   * no explanation. Trash counting is the right call — trashed mail is still
   * stored — but it has to be stated, and there has to be a way out. There is
   * one now: DELETE /mail/trash.
   */
  private fullMessage(quota: number): string {
    return `Your ${humanBytes(quota)} mailbox is full. Delete some mail and empty your Trash — `
      + 'trashed mail is still stored, so it still counts — then try again.';
  }

  private async usedBytes(userId: string): Promise<number> {
    /**
     * SUMMED IN THE DATABASE, NOT IN THIS PROCESS.
     *
     * This used to `findMany` every row of the mailbox and reduce in JS — and
     * it is called on every quota check: once in account(), twice per draft
     * autosave, once per recipient in send, once per recipient on an arrival.
     * A citizen with 200 000 messages materialised 200 000 objects every time
     * the composer ticked. The comment it carried ("truncating undercounts the
     * vault") was answering the wrong question: the fix for a cap is an
     * aggregate, not a full read.
     */
    const agg = await this.prisma.mailMessage.aggregate({
      where: { ownerId: userId },
      _sum: { sizeBytes: true },
    });
    return agg._sum.sizeBytes ?? 0;
  }

  async account(userId: string) {
    const acct = await this.ensureAccount(userId);
    const quota = Number(acct.quotaBytes ?? QUOTA_BYTES);
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
      quotaBytes: quota, usedBytes: used,
      usedPct: Math.min(100, +((used / quota) * 100).toFixed(4)),
      // `unsent` is what the menu shows; `draft` and `failed` stay separate so
      // a screen can say WHICH kind of waiting it found.
      counts: { inbox, inboxUnread, sent, draft, failed, unsent: draft + failed, starred, trash, emailed },
    };
  }

  /**
   * Set/update the primary (external) email + phone.
   *
   * ── WHAT THIS USED TO DO (fifth audit, 29 Aug) ─────────────────────────
   *
   * `data.email = input.email.trim()` and an update, and that was the whole
   * method. It is the only writer of `User.email` outside
   * `verification-code.service.ts`, and it left `emailVerified`,
   * `emailVerifiedAt`, `phoneVerifiedAt` and `phoneE164` exactly as they were.
   * Three things followed, and none of them needed anything but this route:
   *
   *  · THE VERIFIED BADGE MOVED WITH NO PROOF. `verified.guard.ts` grants on
   *    `user.emailVerified` alone, and that guard is what gates the Dating
   *    hub. One call and a citizen held "verified" on an address they had
   *    never opened. `writePendingTarget` forty files away does the opposite
   *    and says why: "Anything else would leave a verified flag attached to an
   *    address the account no longer claims."
   *  · A STRANGER'S ADDRESS COULD BE SQUATTED. Recovery resolves by
   *    `user.findFirst({ where: { email } })`, and registration's uniqueness
   *    check was bypassed here — so pointing your primary at somebody else's
   *    address stopped them registering with it and made recovery for that
   *    address an unordered choice between two rows.
   *  · AND A COLLISION WAS A 500. The partial unique index
   *    `User_email_verified_key` turned two verified users on one address into
   *    a raw P2002 out of Prisma.
   *
   * ── WHAT IT DOES NOW ───────────────────────────────────────────────────
   *
   * The same thing `writePendingTarget` does: records the address as CLAIMED,
   * never as proved. The citizen then verifies it through the ordinary code
   * flow, which is the only thing that may set `emailVerified`. Adding your
   * address here still works and still takes one tap; what it no longer does
   * is award the badge that decides whether you can open Dating.
   */
  async setPrimary(userId: string, input: { email?: string; phone?: string }) {
    const data: Record<string, unknown> = {};

    if (input.email !== undefined) {
      // Lowercased, because every reader of this column compares lowercased —
      // registration, recovery, and the partial unique index itself.
      const email = input.email.trim().toLowerCase() || null;
      if (email) {
        /* Somebody who has PROVED this address keeps it. An unproved claim by
           another account is not a reason to refuse — two people may type the
           same address and only one of them can ever verify it. */
        const held = await this.prisma.user.findFirst({
          where: { email, emailVerified: true, NOT: { id: userId } },
          select: { id: true },
        });
        if (held) throw new BadRequestException('That address already belongs to a verified account.');
      }
      // Claimed, not proved. The verification flow is the only thing that may
      // set emailVerified, and changing the address drops any earlier proof.
      data.email = email;
      data.emailVerified = false;
      data.emailVerifiedAt = null;
    }

    if (input.phone !== undefined) {
      const raw = input.phone.trim();
      if (!raw) {
        data.phone = null;
        data.phoneE164 = null;
        data.phoneVerifiedAt = null;
      } else {
        /* `phoneE164` is the column the schema calls "the one to compare
           against", and this method wrote only the legacy `phone` — so a
           number added here was invisible to everything that matches on it. */
        const parsed = parseE164(raw);
        if (!parsed.ok || !parsed.e164) throw new BadRequestException(parsed.reason ?? 'Enter a valid phone number.');
        data.phone = parsed.e164;
        data.phoneE164 = parsed.e164;
        data.phoneVerifiedAt = null;
      }
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (e) {
      // The partial unique index refused it — a verified row appeared between
      // the check above and this write. Same sentence, not a 500.
      if (String((e as { code?: string }).code) === 'P2002') {
        throw new BadRequestException('That address already belongs to a verified account.');
      }
      throw e;
    }
    return this.account(userId);
  }

  private shape(m: {
    id: string; fromAddr: string; fromName: string; toAddr: string; toName: string; subject: string;
    snippet: string; sizeBytes: number; read: boolean; starred: boolean; system: boolean; folder: string;
    threadId: string | null; createdAt: Date; failureReason?: string | null;
    projectId?: string | null; ccAddrs?: string | null; bccAddrs?: string | null;
  }) {
    return {
      id: m.id, fromAddr: m.fromAddr, fromName: m.fromName, toAddr: m.toAddr, toName: m.toName,
      subject: m.subject, snippet: m.snippet, sizeBytes: m.sizeBytes, read: m.read, starred: m.starred,
      system: m.system, folder: m.folder, threadId: m.threadId, createdAt: m.createdAt.toISOString(),
      // Which room this conversation is filed in, so All Email can put the
      // chip on the row without asking a second time.
      projectId: m.projectId ?? null,
      /**
       * THE COPY LISTS WERE WRITTEN AND NEVER RETURNED.
       *
       * Both columns have been filled on every send since Cc and Bcc shipped,
       * no endpoint has ever emitted them, and the client declares both on
       * MailItem while MessageView renders both behind a truthiness check — so
       * the rows were there, the UI was there, and the field in between was
       * missing. A citizen Cc'd two colleagues, opened their own Sent copy,
       * and there was no cc line anywhere.
       *
       * Safe to emit: `bccAddrs` is only ever written to the sender's own Sent
       * row (mail-cc-bcc.spec.ts holds that), and every read here is already
       * scoped to `ownerId`, so a recipient's copy has nothing to leak.
       */
      ccAddrs: m.ccAddrs ?? null,
      bccAddrs: m.bccAddrs ?? null,
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

    // THE COPY LISTS COME WITH IT. Retry rebuilt the message from the
    // recipient, subject, body, thread and files — and dropped Cc and Bcc, so
    // a message that succeeded on the second attempt reached fewer people than
    // the one that failed on the first, silently.
    const split = (v?: string | null) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const cc = split(m.ccAddrs);
    const bcc = split(m.bccAddrs);
    /**
     * THE ATTEMPT'S OWN ROW SUPERSEDES THE SOURCE — WHEN THERE IS ONE.
     *
     * The rule is right and the old implementation of it was not. It removed
     * the source in a `finally`, on the strength of a sentence written above
     * it: "Every path through send() writes a row for this attempt." That is
     * false, and the false cases are the ones a citizen actually meets. send()
     * throws BEFORE anything is written when the mailbox is full, when the
     * recipient is no longer connected, when the message names more external
     * addresses than one message may carry, when the day's external budget is
     * spent, and when the body is empty. The `finally` ran on all of them.
     *
     * So: press Retry on a full mailbox — which is exactly what a citizen does
     * to clear space — and the message was deleted outright with nothing
     * written in its place. The one copy of what they had written, gone, by
     * pressing the button offered for saving it.
     *
     * `filedARow` is fanOut's own ledger, the same flag that decides which
     * recipient carries the Sent copy: it says whether this attempt wrote a
     * row. Superseded → remove the source. Nothing written → keep it, because
     * the failure was about the send and not about the message, and the
     * message is the part that cannot be recovered.
     */
    let filed = true; // a success always files the Sent copy
    try {
      await this.send(userId, {
        to: m.toAddr, subject: m.subject, body: m.body,
        ...(cc.length ? { cc } : {}),
        ...(bcc.length ? { bcc } : {}),
        ...(m.threadId ? { threadId: m.threadId } : {}),
        ...(attachmentFileIds.length ? { attachmentFileIds } : {}),
      });
    } catch (e) {
      filed = Boolean((e as FiledFailure).filedARow);
      if (filed) {
        // Scoped to this id, this owner and this folder, so it can only remove
        // the one row the retry was for.
        await this.prisma.mailMessage.deleteMany({ where: { id, ownerId: userId, folder: 'failed' } });
      }
      throw e;
    }
    await this.prisma.mailMessage.deleteMany({ where: { id, ownerId: userId, folder: 'failed' } });
    return this.list(userId, { folder: 'failed' });
  }

  /** The full trail for a thread in this user's mailbox (oldest → newest, with bodies). */
  async thread(userId: string, threadId: string) {
    /**
     * NEWEST-FIRST TO THE DATABASE, OLDEST-FIRST TO THE READER.
     *
     * This was `asc` with a `take`, so a thread longer than the cap hid its
     * NEWEST messages — including the reply somebody had just been notified
     * about. A cap has to drop something; dropping the end you came for is the
     * one choice that makes the screen useless. `list()` has always done this
     * correctly; only the trail did not.
     */
    const rows = await this.prisma.mailMessage.findMany({
      where: { ownerId: userId, threadId },
      orderBy: { createdAt: 'desc' },
      take: FEED_CAP, // a thread longer than this needs pagination, not scroll
    });
    return rows.reverse().map((m) => ({ ...this.shape(m), body: m.body }));
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
      const quota = Number(sender.quotaBytes ?? QUOTA_BYTES);
      if (delta > 0 && (await this.usedBytes(userId)) + delta > quota) {
        throw new BadRequestException(this.fullMessage(quota));
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

    const quota = Number(sender.quotaBytes ?? QUOTA_BYTES);
    if ((await this.usedBytes(userId)) + size > quota) {
      throw new BadRequestException(this.fullMessage(quota));
    }
    const created = await this.prisma.mailMessage.create({
      data: {
        ownerId: userId, boxUserId: userId, folder: 'draft',
        fromAddr: sender.address, fromName: me?.name ?? 'You',
        toAddr: dto.to.trim(), toName: dto.to.trim(),
        subject, body: dto.body, snippet: snippetOf(dto.body), sizeBytes: size,
        // Read: a draft is your own words — there is nothing here you have not
        // seen, and an unread badge on your own unfinished note is noise.
        read: true, system: false,
        /**
         * THE SAME ANTI-SPOOF GATE THE TWO SEND PATHS USE, AND IT WAS MISSING
         * HERE.
         *
         * Thread membership is this module's authorization boundary: a row in
         * a thread is what `threadAttachments` and `attachmentUrl` accept as
         * proof you belong in that conversation, and neither filters by
         * folder. So a DRAFT carrying somebody else's threadId was as good as
         * a message in their thread — and a draft costs nothing to make. Two
         * requests got a stranger a signed download URL for another citizen's
         * Drive file:
         *
         *   POST /mail/draft {threadId: "<their thread>"}
         *   GET  /mail/thread/<their thread>/attachments/<file>/url
         *
         * resolveThreadId exists to close exactly this, and says so in its own
         * doc comment - "so this is a security boundary, not just tidiness".
         * Both send paths route through it. This one never did.
         *
         * A threadId the caller does not already hold a message in becomes a
         * fresh trail rather than an error: a draft is unfinished work, and
         * refusing to save it would lose what somebody typed over a parameter
         * they never chose.
         */
        threadId: dto.threadId ? await this.resolveThreadId(userId, dto.threadId) : null,
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
  private async fanOut(userId: string, dto: SendMailDto): Promise<{ sent: string[]; failed: Array<{ to: string; reason: string }>; filed: boolean }> {
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
    // THE SENDER'S OWN ADDRESS IS ALREADY SERVED BY THE SENT COPY. Cc'ing
    // yourself alongside somebody else used to enqueue a second pass that
    // wrote NOTHING — no Sent row (that was the first pass's job) and no inbox
    // row (the internal path skips it when the recipient is the sender) — and
    // still reported the address as delivered. Writing to yourself alone still
    // works: it is then the first recipient, and the Sent copy is the message.
    const meAddr = (await this.ensureAccount(userId)).address.toLowerCase();
    const pushUnlessSelfCopy = (addr: string, blind: boolean) => {
      if (queue.length > 0 && norm(addr) === meAddr) return;
      push(addr, blind);
    };
    push(dto.to, false);
    for (const a of dto.cc ?? []) pushUnlessSelfCopy(a, false);
    for (const a of dto.bcc ?? []) pushUnlessSelfCopy(a, true);

    /**
     * ONE THREAD FOR THE WHOLE MESSAGE, RESOLVED ONCE, HERE.
     *
     * `sendOne` used to call resolveThreadId itself, once per recipient — and
     * for a NEW message `dto.threadId` is undefined, so every recipient got a
     * fresh uuid. One message to three people was three unrelated
     * conversations, and the damage was not cosmetic:
     *
     *  · attachments are linked to a THREAD, and `attachedId` is one column,
     *    so the last recipient's trail won and the sender's own Sent copy
     *    showed a message whose files 404;
     *  · a reply came back into a trail the sender's copy was not in, so it
     *    arrived with no original beside it.
     *
     * The room is resolved once for the same reason: one conversation, one
     * filing. Resolving it per recipient also read `threadProject` before the
     * first row existed, which made the answer depend on write order.
     */
    /**
     * The budget is checked ONCE, for the whole message, before anything is
     * written or dispatched. Per-recipient would leave half a message sent and
     * half refused for a reason the citizen cannot act on, and it would put a
     * count query inside the loop.
     */
    const external = queue.filter((r) => !handleFromAddress(r.addr));
    /**
     * AN UNVERIFIED ACCOUNT DOES NOT GET TO USE THE CITY'S DOMAIN (fifth
     * audit, 29 Aug).
     *
     * `POST /mail/send` carried JwtAuthGuard and nothing else — `VerifiedGuard`
     * existed and was used in exactly one place, the Dating hub. Registration
     * is open, so an account created a minute ago could send
     * EXTERNAL_SENDS_PER_DAY emails out of a DKIM-aligned
     * <handle>@togethercity.app: the same domain that carries every OTP, and
     * the caps scale linearly with free accounts. `the-city-is-not-a-megaphone`
     * names the consequence in its own words.
     *
     * INTERNAL MAIL IS UNAFFECTED, which is why this is here and not on the
     * route. Writing to a citizen you are connected with reaches nobody's spam
     * filter and costs the domain nothing; it is the outside world that is
     * being protected, so it is the outside world that is gated.
     */
    if (external.length) {
      const sender = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
      if (!sender?.emailVerified) {
        throw new ForbiddenException(
          'Confirm your own email address before writing to addresses outside the city. '
          + 'Mail to citizens you are connected with is unaffected.',
        );
      }
    }
    if (external.length > EXTERNAL_RECIPIENTS_PER_MESSAGE) {
      throw new BadRequestException(
        `One message can go to ${EXTERNAL_RECIPIENTS_PER_MESSAGE} addresses outside the city at a time. `
        + `This one names ${external.length}. Citizens you're connected with don't count towards it.`,
      );
    }
    const internal = queue.length - external.length;
    if (internal > 0) {
      // The sender's own Sent rows are one per message rather than one per
      // recipient, so this counts messages and the ceiling is in messages.
      // Indexed on [ownerId, folder, createdAt].
      const spent = await this.prisma.mailMessage.count({
        where: { ownerId: userId, folder: 'sent', createdAt: { gte: new Date(Date.now() - DAY_MS) } },
      });
      if (spent >= INTERNAL_SENDS_PER_DAY) {
        throw new BadRequestException(
          `You've sent ${spent} messages in the last 24 hours, which is this city's daily limit. `
          + 'It resets as the oldest of them ages out.',
        );
      }
    }
    if (external.length) {
      // EmailDelivery writes one row per external recipient, so the count and
      // the budget are in the same units. It is indexed on [userId, createdAt].
      const spent = await this.prisma.emailDelivery.count({
        where: { userId, kind: 'mail', createdAt: { gte: new Date(Date.now() - DAY_MS) } },
      });
      if (spent + external.length > EXTERNAL_SENDS_PER_DAY) {
        throw new BadRequestException(
          `You've reached the daily limit of ${EXTERNAL_SENDS_PER_DAY} emails to addresses outside the city `
          + `(${spent} in the last 24 hours). Mail to citizens you're connected with is unaffected.`,
        );
      }
    }

    const threadId = await this.resolveThreadId(userId, dto.threadId);
    const project = await this.resolveSendProject(userId, threadId, dto.projectKey);

    const cc = (dto.cc ?? []).map((a) => a.trim()).filter(Boolean);
    const bcc = (dto.bcc ?? []).map((a) => a.trim()).filter(Boolean);
    const sent: string[] = [];
    const failed: Array<{ to: string; reason: string }> = [];

    /**
     * THE MESSAGE'S OWN ROW BELONGS TO THE FIRST ATTEMPT THAT WRITES ONE, not
     * to the first attempt MADE.
     *
     * `keepSentCopy: i === 0` read as "the first recipient carries the row",
     * and it is only the same thing when the first recipient gets far enough
     * to write. It does not, when the address is malformed, names no city
     * mailbox, belongs to somebody the sender is not connected with, or the
     * mailbox is full: `sendOne` throws before any create. The later
     * recipients then ran with the copy already spoken for and wrote an inbox
     * row and nothing else.
     *
     *   send({ to: 'stranger@togethercity.app', cc: ['alice@togethercity.app'] })
     *
     * Alice gets the mail. `send()` returns 200 with her in `delivered`, so
     * `clearDraft` removes the draft. The sender is left with NO Sent row, no
     * Failed row and no draft — a message delivered and no trace of it
     * anywhere in the mailbox that sent it.
     *
     * A ledger rather than an index, because the fact being tracked is "has a
     * row for this message been written", and only the writer knows. It flips
     * on a Failed row too: an external refusal already files the message so
     * Retry can find it, and a second row would be a second copy of one
     * message, which is the thing the previous commit was for.
     */
    const ownCopy = { written: false };

    for (const r of queue) {
      try {
        await this.sendOne(userId, {
          ...dto, to: r.addr, resolvedThreadId: threadId, projectId: project?.id ?? null,
          ownCopy,
          ccAddrs: cc.length ? cc.join(', ') : null,
          bccAddrs: !ownCopy.written && bcc.length ? bcc.join(', ') : null,
        });
        sent.push(r.addr);
      } catch (e) {
        failed.push({ to: r.addr, reason: (e as Error).message });
      }
    }
    /* `filed` is the ledger the retry path needs: it says whether THIS attempt
       wrote a row of its own — Sent or Failed — and therefore whether the row
       it was retrying has been superseded. See retry(). */
    return { sent, failed, filed: ownCopy.written };
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
    /**
     * A MESSAGE NEEDS SOMETHING IN IT — enforced where the row is written, not
     * only where one client draws its Send key. The web composer refuses an
     * empty body now, but a dozen blank messages in one mailbox arrived
     * through this door before it did, each one a name and a date and
     * nothing else, and any other caller could go on producing them. An
     * attachment counts: a file with no covering note is a message. A subject
     * alone is not — that is the slip this catches.
     */
    if (!(dto.body ?? '').trim() && !dto.attachmentFileIds?.length) {
      throw new BadRequestException('A message needs something in it — a few words, or a file.');
    }
    const { sent, failed, filed } = await this.fanOut(userId, dto);
    if (sent.length === 0) {
      const refusal: FiledFailure = new BadRequestException(
        failed[0]?.reason ?? 'That message could not be sent.',
      );
      // Whether the attempt nevertheless left a row behind. Only retry() reads
      // it, and only to decide whether it may remove the row it started from.
      refusal.filedARow = filed;
      throw refusal;
    }
    await this.clearDraft(userId, dto.draftId);
    /**
     * AN OBJECT, NOT AN ARRAY WITH TWO PROPERTIES BOLTED ON.
     *
     * This used to spread `list()` — an ARRAY — into an object literal, so the
     * response was `{0: {...}, 1: {...}, delivered, failed}`, and the client
     * typed it as `MailItem[]`. Nothing read it, which is the only reason
     * nobody noticed. `failed` is the point: a send to five people where two
     * were refused returned 200 and the composer closed on it.
     */
    return { sent: await this.list(userId, { folder: 'sent' }), delivered: sent, failed };
  }

  private async sendOne(userId: string, dto: SendMailDto & {
    /** Shared across the fan-out: set once, by whichever attempt writes the sender's row. */
    ownCopy: { written: boolean }; ccAddrs: string | null; bccAddrs: string | null;
    /** Resolved once per MESSAGE in fanOut, not once per recipient. */
    resolvedThreadId: string; projectId: string | null;
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
    const quota = await this.quotaOf(userId);
    if (used + size > quota) throw new BadRequestException(this.fullMessage(quota));

    // One trail and one room for the whole message — see fanOut.
    const threadId = dto.resolvedThreadId;
    // THE FILING IS THE SENDER'S, NOT THE MESSAGE'S. It goes on their Sent row
    // below and never into `base` — a recipient's copy stamped with the
    // sender's project would put a stranger's mail in a room they never made.
    const projectId = dto.projectId;
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
    const keepOwnCopy = !dto.ownCopy.written;
    await this.prisma.$transaction([
      // The sender's Sent copy, written once for the whole message rather than
      // once per recipient — five rows in Sent for one message is five things
      // to delete and four lies about how many messages were written. It is
      // also THE ONLY ROW that ever carries the blind list.
      ...(keepOwnCopy
        ? [this.prisma.mailMessage.create({ data: { ...base, bccAddrs: dto.bccAddrs, ownerId: userId, boxUserId: userId, folder: 'sent', read: true, projectId } })]
        : []),
      // The recipient's Inbox copy. bccAddrs is absent, not blanked — a column
      // that is present and empty is one somebody later fills in "for
      // completeness".
      ...(recipient.id !== userId
        ? [this.prisma.mailMessage.create({ data: { ...base, ownerId: recipient.id, boxUserId: recipient.id, folder: 'inbox', read: false } })]
        : []),
    ]);
    // Claimed only after the write succeeded — a transaction that threw leaves
    // the row unwritten, and the next recipient must still be able to carry it.
    if (keepOwnCopy) dto.ownCopy.written = true;
    await this.linkAttachments(userId, threadId, dto.attachmentFileIds);
    return this.list(userId, { folder: 'sent' });
  }

  /** Send to a GLOBAL (external) email address via the email provider (Resend).
   *  Keeps a Sent copy in the city; logs the dispatch to the outbox. */
  private async sendExternal(userId: string, fromAddr: string, fromName: string, toEmail: string,
    dto: SendMailDto & {
      ownCopy: { written: boolean }; ccAddrs?: string | null; bccAddrs?: string | null;
      resolvedThreadId: string; projectId: string | null;
    }) {
    const subject = dto.subject?.trim() || '(no subject)';
    const size = sizeOf(subject, dto.body);
    const used = await this.usedBytes(userId);
    const quota = await this.quotaOf(userId);
    if (used + size > quota) throw new BadRequestException(this.fullMessage(quota));

    // One trail and one room for the whole message, resolved in fanOut through
    // the same anti-spoof gate this path has always used.
    const threadId = dto.resolvedThreadId;
    const projectId = dto.projectId;
    const project = projectId
      ? await this.prisma.mailProject.findFirst({ where: { id: projectId, ownerId: userId }, select: { key: true, subAddress: true } })
      : null;
    /**
     * A REPLY TO A PROJECT'S MAIL COMES BACK TO THE PROJECT, and this is what
     * makes that true rather than likely.
     *
     * Thread inheritance handles the ordinary case, but it leans on matching
     * an inbound message to a trail by sender and normalised subject — and
     * that misses exactly when it matters: a recipient who rewrites the
     * subject, replies from a client that drops the thread, or forwards it to
     * a colleague who writes back. Reply-To carries the room in the ADDRESS,
     * so the reply arrives already saying where it belongs and ingestInbound
     * files it on the sub-address rule with nothing to guess.
     *
     * From stays the plain city address: it is the DKIM-aligned one, and the
     * note above is the reason it must not move. Reply-To is the lever.
     */
    const replyTo = project?.subAddress ? subAddressed(fromAddr, project.key) : fromAddr;
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
      .send({
        channel: 'email', to: toEmail, subject, body: dto.body + linkFooter + footer, kind: 'mail',
        from: fromHeader, replyTo,
        // References names the trail on the FIRST message too, where it points
        // at an id nothing has sent yet. Clients tolerate that and still group
        // on it, and it means every message of a thread carries the same
        // anchor rather than only the replies.
        headers: { 'Message-ID': threadMessageId(threadId), References: threadAnchorId(threadId) },
        ...(attachments.length ? { attachments } : {}),
      })
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

    /**
     * ONE SENT ROW FOR THE MESSAGE, NOT ONE PER RECIPIENT.
     *
     * `keepSentCopy` has been in this method's parameter type since fanOut was
     * written and was never read, so the internal path kept one copy and this
     * one kept N. A single external message with two people Cc'd wrote THREE
     * rows to Sent and charged the 10 GB quota three times — and if the third
     * was refused, the citizen was looking at two Sent rows and one Failed row
     * for one message they wrote once.
     *
     * The first recipient carries the row; the rest dispatch and write
     * nothing. A refusal on a later recipient is not lost — fanOut collects it
     * and `send()` returns it, which is what the composer now reads.
     *
     * The row belongs to the first attempt that WRITES one, not the first
     * attempt made — see the ledger in fanOut. A refusal writes it too, in
     * Failed, so a message nobody would take is still somewhere the citizen
     * can find and retry.
     *
     * KNOWN RESIDUE, stated rather than discovered: if the row is claimed by a
     * refusal and a LATER recipient is accepted, the row is filed under Failed
     * even though the message did reach somebody. Fixing that properly means
     * one provider call carrying to/cc/bcc rather than a fan-out, which is a
     * change to the delivery topology and belongs in its own commit.
     */
    if (dto.ownCopy.written) {
      if (failed) {
        throw new BadRequestException(
          `Couldn't deliver to ${toEmail}. ${reason ?? ''}`.trim(),
        );
      }
      return this.list(userId, { folder: 'sent' });
    }

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
    // Sent or Failed, the message now has exactly one row. Later recipients
    // dispatch and write nothing.
    dto.ownCopy.written = true;

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
        color: p.color, description: p.description ?? null,
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
      data: {
        ownerId: userId, name: dto.name, key: dto.key, subAddress: dto.subAddress,
        color: dto.color, ...(dto.description ? { description: dto.description } : {}),
      },
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
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        // An empty description is a description REMOVED, not one left alone:
        // the field is a text input and clearing it has to mean something.
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
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
    /**
     * BOTH OR NEITHER. These were two statements: clear the filing, then delete
     * the room. If the second failed, every conversation had lost its room
     * permanently and the room was still there — and nothing anywhere recorded
     * what had been in it, so there was no way back. The array form is the
     * whole fix: two writes, no read between them, so there is nothing here to
     * serialise except atomicity, which is what was missing.
     */
    const [released] = await this.prisma.$transaction([
      this.prisma.mailMessage.updateMany({
        where: { ownerId: userId, projectId: id },
        data: { projectId: null },
      }),
      this.prisma.mailProject.delete({ where: { id } }),
    ]);
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
  /**
   * EMPTY THE TRASH. The way out of a full mailbox, which did not exist.
   *
   * `remove()` moves a message to Trash and `usedBytes` sums every folder, so
   * deleting five hundred messages left the meter exactly where it was and the
   * same "mailbox is full" error with no explanation. Counting Trash is right —
   * trashed mail is still stored — but a rule with no escape is a trap.
   *
   * Deletes outright, because that is what emptying a trash means, and returns
   * the freed byte count so the screen can say what happened rather than just
   * going quiet.
   */
  async emptyTrash(userId: string) {
    // The deleteMany below empties all of them regardless of what this read saw.
    // unbounded: every trashed message is SUMMED to say how much was freed — a
    // cap would report a smaller number than the mailbox actually got back.
    const rows = await this.prisma.mailMessage.findMany({
      where: { ownerId: userId, folder: 'trash' }, select: { sizeBytes: true },
    });
    const freed = rows.reduce((n, r) => n + r.sizeBytes, 0);
    const { count } = await this.prisma.mailMessage.deleteMany({ where: { ownerId: userId, folder: 'trash' } });
    return { ok: true, deleted: count, freedBytes: freed };
  }

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
    /* DELIVERY FEEDBACK COMES THROUGH THE SAME DOOR. Resend posts delivered,
       bounced, complained and delayed to the same webhook as a received email,
       and this method understood only the last of those — so the others were
       parsed as mail, matched nothing, and were answered 200 and forgotten.
       Checked first, because a delivery event has no `to` mailbox of ours to
       file into and would otherwise fall through the whole method. */
    const event = normalizeDeliveryEvent(payload);
    if (event) return this.ingestDeliveryEvent(event);

    const mail = normalizeInbound(payload);
    if (!mail) {
      this.logger.warn('inbound mail: unrecognised payload shape');
      return { ok: false, reason: 'unparseable' };
    }

    /**
     * NOTHING THAT ARRIVES HERE MAY WEAR A CITIZEN'S NAME.
     *
     * `fromAddr` was written straight off the wire, and nothing checked what
     * it claimed to be. Mail between citizens never leaves the building —
     * `sendOne` writes both rows itself — so an inbound message whose From is
     * a city address did not come from that citizen. It came from whoever
     * handed it to the provider.
     *
     *   From: "The Mayor" <mayor@togethercity.app>
     *   To:   victim@togethercity.app
     *
     * The provider accepts it for the verified domain and fires this webhook
     * with its own valid secret. Before this gate the row landed in the
     * victim's inbox and rendered as ordinary internal mail — and worse,
     * `resolveInboundThread` matches on fromAddr and subject, so a forgery
     * spliced itself into a real conversation and inherited that thread's
     * project.
     *
     * It also walked past the only anti-abuse control this module has, the
     * connection check on the send path, because it never touched the
     * authenticated API at all.
     *
     * The rule needs no verdict header and no provider-specific field, which
     * is why it is this and not a DKIM check: internal mail has no reason to
     * arrive here, so a city From is either forged or a loop, and both should
     * be refused. (A DKIM/SPF verdict on top would let us mark ordinary
     * external mail as unverified; that needs the payload shape confirmed
     * against a live webhook and is not guessed at here.)
     */
    if (isCityAddress(mail.from.addr)) {
      this.logger.warn(`inbound mail REFUSED: From claims the city address ${mail.from.addr}`);
      return { ok: false, reason: 'from-is-a-city-address' };
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
    const allHandles = [...byHandle.keys()];
    const handles = allHandles.slice(0, MAX_INBOUND_RECIPIENTS);
    if (allHandles.length > handles.length) {
      // Said out loud rather than truncated quietly: a silent cap reads as
      // "everybody got it" to whoever is reading the logs afterwards.
      this.logger.warn(
        `inbound mail: ${allHandles.length} city recipients, delivering to the first ${MAX_INBOUND_RECIPIENTS}`,
      );
    }
    if (!handles.length) {
      this.logger.warn('inbound mail: no city recipient in To');
      return { ok: false, reason: 'no-city-recipient' };
    }

    let delivered = 0;
    /**
     * ONE FAILURE MUST NOT RE-DELIVER TO EVERYBODY ELSE.
     *
     * The loop had no catch, so a write that threw halfway escaped the method,
     * Nest answered 500, and the provider re-sent the identical payload — to
     * the mailboxes that had already taken it. Each recipient is now its own
     * attempt, and the ones that worked are not undone by the one that did
     * not. `errors` is reported so a partial delivery is legible rather than
     * inferred from a count.
     */
    let errors = 0;
    for (const handle of handles) {
     try {
      const user = await this.prisma.user.findUnique({ where: { handle }, select: { id: true, name: true, deletedAt: true } });
      // A deleted account keeps its row so other citizens' conversations survive
      // (see User.deletedAt). It must not keep receiving mail.
      if (!user || user.deletedAt) continue;
      const acctFor = await this.ensureAccount(user.id);

      /**
       * A PROVIDER RETRY IS NOT A SECOND EMAIL.
       *
       * providerMessageId was written and never read back, and the column
       * carries no constraint — so every redelivery (a timeout on our side, a
       * partial failure, an at-least-once guarantee doing its job) put another
       * copy of the same message in the same inbox, in the same thread,
       * charging the quota again. Scoped per mailbox because the id is unique
       * to the message, not to the delivery.
       */
      if (mail.providerMessageId) {
        const already = await this.prisma.mailMessage.findFirst({
          where: { ownerId: user.id, providerMessageId: mail.providerMessageId },
          select: { id: true },
        });
        if (already) continue;
      }

      const subject = (mail.subject || '(no subject)').slice(0, 200);
      const body = (await this.inboundBody(mail)).slice(0, 50000);
      const size = sizeOf(subject, body);

      // An inbound message a citizen has no room for is dropped rather than
      // failing the whole webhook — the sender is external and cannot be bounced
      // from here.
      const used = await this.usedBytes(user.id);
      const quota = Number(acctFor?.quotaBytes ?? QUOTA_BYTES);
      if (used + size > quota) {
        this.logger.warn(`inbound mail dropped: ${handle}'s mailbox is full`);
        continue;
      }

      const threadId = await this.resolveInboundThread(user.id, mail.from.addr, subject, mail.inReplyTo, mail.authenticated);
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
      const inherited = await this.threadProject(user.id, threadId);
      const tagged = inherited ? null : await this.subAddressProject(user.id, byHandle.get(handle) ?? null);
      // An arrival addressed to you+abg@ files the CONVERSATION, not only
      // itself — the same rule the send path follows, for the same reason.
      if (tagged) await this.fileWholeThread(user.id, threadId, tagged);
      const projectId = inherited ?? tagged;
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
     } catch (e) {
      errors++;
      this.logger.error(`inbound mail: delivery to ${handle} failed - ${(e as Error).message}`);
     }
    }
    return { ok: true, delivered, ...(errors ? { errors } : {}) };
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
  /**
   * HTML TO SOMETHING A PERSON CAN READ.
   *
   * `html.replace(/<[^>]*>/g, ' ')` removes the TAGS and keeps everything
   * between them — so a real marketing email, which opens with a `<style>`
   * block and usually carries a `<script>`, arrived as a wall of CSS followed
   * by the actual words, with every `&nbsp;` and `&amp;` still spelled out.
   * Not a security hole: nothing renders this as HTML, the client draws it as
   * escaped text. A product one, and it made HTML mail effectively unreadable.
   *
   * Script and style go WITH their contents; block-level tags become line
   * breaks so paragraphs survive; entities are decoded; runs of blank space
   * collapse. Deliberately not a parser — this is a preview of a message whose
   * canonical form is the sender's, and a dependency is a lot to carry for
   * that.
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?(p|div|br|tr|li|h[1-6]|table|blockquote)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
      .replace(/&#(\d{1,6});/g, (_m, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n').map((l) => l.trim()).join('\n')
      .trim();
  }

  private async inboundBody(mail: InboundMail): Promise<string> {
    const inline = mail.text || (mail.html ? this.htmlToText(mail.html) : '');
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
      const text = fetched.text || (fetched.html ? this.htmlToText(fetched.html) : '');
      if (text.trim()) return text;
    }
    this.logger.error(`inbound mail: could not retrieve the body of ${mail.emailId} — filing the message without it`);
    return UNRETRIEVABLE;
  }

  /** Reuse an existing trail when this citizen already corresponds with this
   *  external address under the same (normalised) subject; otherwise a new
   *  thread. Best-effort, since an inbound reply's headers can't be relied on to
   *  echo the id we sent. */
  private async resolveInboundThread(
    userId: string, fromAddr: string, subject: string, refs: string[] = [],
    authenticated: boolean | null = null,
  ): Promise<string> {
    /**
     * THE HEADERS FIRST, BECAUSE THEY ARE THE ANSWER THE PROTOCOL CARRIES.
     *
     * Outbound mail now mints ids with the trail encoded in them, and every
     * mail client echoes References back. So a reply usually names its own
     * thread, and none of the guessing below has to run.
     *
     * A THREAD ID IN A HEADER IS A CLAIM, NOT A CREDENTIAL. It is believed
     * only after checking this citizen already holds a row in that trail —
     * without that, anyone could drop their mail into the middle of somebody
     * else's conversation by writing one header, which is the hole the draft
     * path had. The check is the same shape as `resolveThreadId`'s.
     */
    const claimed = threadFromRefs(refs);
    if (claimed) {
      const mine = await this.prisma.mailMessage.findFirst({
        where: { ownerId: userId, threadId: claimed }, select: { id: true },
      });
      if (mine) return claimed;
    }

    /**
     * Then the old guess, for mail from a client that dropped the headers, or
     * a forward that came back. It looks at the most recent message from this
     * correspondent and requires the subjects to match — which is wrong often
     * enough to matter (two live conversations with one person is enough), and
     * is why the headers above exist. It is kept because losing the thread is
     * worse than occasionally starting a new one.
     */
    /**
     * AND ONLY FOR A SENDER WHO PROVED THEY ARE THE SENDER (fifth audit,
     * 29 Aug).
     *
     * The header path above is safe on its own: a claimed thread id is checked
     * against a row this citizen already holds, so it is a claim that has to
     * survive a lookup. This heuristic has no such check — it asks only "who
     * was the last correspondent at this address, and does the subject match"
     * — and the From header is free to write. So any host on the internet
     * could forge `From: <a correspondent>` with a matching subject and have
     * the message spliced into that live conversation, inheriting its history
     * and its filing. The guard on the route authenticates the PROVIDER; it
     * has never said anything about the message.
     *
     * `null` — no verdict available — is treated like a failure HERE and only
     * here. The mail is still delivered: dropping real correspondence because
     * a provider did not annotate it would be the worse mistake, and a message
     * in its own thread is a message the citizen can read. What it does not
     * get is somebody else's conversation to sit inside.
     */
    if (authenticated !== true) return randomUUID();

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

  /**
   * ONE DISPATCH PATH FOR EVERY SYSTEM MESSAGE — with a retry, and with an
   * alarm when it finally does not go.
   *
   * `deliverSystem` and `deliverTo` each called `provider.send(...).catch(...)`
   * once and wrote the outcome to a row. So a failure was a `logger.error` and
   * an `EmailDelivery` with `status: 'failed'` that nothing reads — `outbox()`
   * is per-citizen, there is no admin view, and Sentry was wired to the
   * exception filter and to unhandled rejections and to nothing here. Delivery
   * could stop entirely and the first anybody would know is a support message
   * about a code that never arrived.
   *
   * `report()` is the alarm, and it carries the flow and the provider and NOT
   * the recipient: the PII discipline the Resend and Twilio adapters already
   * keep (domain only, never the number) does not get relaxed by the file that
   * calls them.
   */
  /**
   * Is this address on the list, for a message of this kind?
   *
   * Fails OPEN, loudly: a read that throws must not stop a password reset. The
   * cost of the wrong answer here is one message to an address that did not
   * want it; the cost of refusing every message because a query failed is the
   * city's whole recovery path.
   */
  private async suppressedFor(channel: Channel, to: string, kind: string): Promise<string | null> {
    if (channel !== 'email') return null;
    try {
      const row = await this.prisma.suppressedAddress.findUnique({
        where: { address: to.trim().toLowerCase() }, select: { reason: true },
      });
      if (!row) return null;
      if (row.reason === 'hard-bounce') return row.reason;
      return ESSENTIAL_KINDS.has(kind) ? null : row.reason;
    } catch (e) {
      this.logger.warn(`suppression list unreadable: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * List-Unsubscribe, on the mail a person may reasonably not want.
   *
   * The header seam has existed since threading landed and its own comment
   * says "and later List-Unsubscribe"; later is now. Everything this city
   * sends is transactional in the strict sense, so this is not a compliance
   * failure today — but citizen-composed mail runs at 200 a day per account on
   * this domain, which is bulk-SHAPED traffic, and Gmail and Yahoo's
   * bulk-sender rules are about shape. A domain that offers the header before
   * it is asked for it is a domain that keeps its reputation.
   *
   * NOT ON RECOVERY OR SECURITY. There is no unsubscribing from a password
   * reset, and offering to would be an invitation to lock yourself out.
   *
   * Silent when PUBLIC_API_URL is unset — a List-Unsubscribe pointing at a URL
   * that does not resolve is worse than none, because a client that presses it
   * and fails may treat the whole message as broken.
   */
  private unsubscribeHeaders(channel: Channel, to: string, kind: string): { headers?: Record<string, string> } {
    if (channel !== 'email' || ESSENTIAL_KINDS.has(kind)) return {};
    const base = (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '');
    if (!base) return {};
    const token = unsubscribeToken(to, Date.now() + UNSUBSCRIBE_TTL_MS);
    return {
      headers: {
        'List-Unsubscribe': `<${base}/mail/unsubscribe?t=${encodeURIComponent(token)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  }

  /**
   * Stop writing to this address, for anything discretionary.
   *
   * The address arrives ALREADY PROVEN: UnsubscribeTokenGuard reads the signed
   * token off the route and refuses anything that is not ours, which is where
   * the check belongs — see that file, and route-exposure.spec.ts for the rule
   * it satisfies.
   */
  async unsubscribe(address: string): Promise<{ ok: boolean }> {
    if (!address) return { ok: false };
    await swallow(this.prisma.suppressedAddress.upsert({
      where: { address },
      create: { address, reason: 'unsubscribed', detail: 'one-click unsubscribe' },
      update: { reason: 'unsubscribed', detail: 'one-click unsubscribe' },
    }), 'mail: unsubscribe', {});
    return { ok: true };
  }

  /**
   * WHAT THE PROVIDER SAID AFTERWARDS.
   *
   * `EmailDelivery.status` was written at create and never touched again —
   * grep the tree and only `.create`, `.count` and `.findMany` exist against
   * that table — so every Resend send read `queued` for ever, however it
   * actually ended. This is the other half of the send: the row learns what
   * happened, and an address that cannot or does not want to receive is
   * written down so the next send does not repeat the mistake.
   */
  private async ingestDeliveryEvent(ev: DeliveryEvent) {
    const status = ev.type === 'delivered' ? 'delivered'
      : ev.type === 'bounced' ? 'bounced'
      : ev.type === 'complained' ? 'complained'
      : 'delayed';
    await swallow(this.prisma.emailDelivery.updateMany({
      where: { providerMessageId: ev.emailId }, data: { status },
    }), 'mail: delivery event', { emailId: ev.emailId });

    const reason = ev.type === 'complained' ? 'complaint'
      : ev.type === 'bounced' && ev.permanent ? 'hard-bounce'
      : null;
    /* A SOFT BOUNCE IS RECORDED AND NOT SUPPRESSED. A full mailbox or a
       greylist says nothing about whether the address exists, and suppressing
       on one would quietly lock somebody out of their own recovery the week
       their inbox was full. */
    if (!reason || !ev.address) return { ok: true, status };
    await swallow(this.prisma.suppressedAddress.upsert({
      where: { address: ev.address },
      create: { address: ev.address, reason, detail: ev.detail ?? null },
      update: { reason, detail: ev.detail ?? null },
    }), 'mail: suppress address', { reason });
    // The domain only: a warn line is not a place to put people's addresses.
    this.logger.warn(`suppressing an address after ${ev.type} (${reason}) — domain ${ev.address.split('@').pop()}`);
    return { ok: true, status };
  }

  private async dispatch(
    channel: Channel,
    payload: Parameters<ReturnType<typeof createMessagingProvider>['send']>[0],
    meta: { userId: string; kind: string },
  ): Promise<{ provider: string; providerMessageId: string | null; status: string; error?: string }> {
    const provider = createMessagingProvider(channel);
    /* THE LIST IS CHECKED HERE, once, for every system message — rather than
       at the eight call sites, which is how the fourteenth one forgets. */
    const suppressed = await this.suppressedFor(channel, payload.to, meta.kind);
    if (suppressed) {
      this.logger.log(`not sending ${meta.kind} — address suppressed (${suppressed})`);
      return { provider: provider.name, providerMessageId: null, status: 'suppressed' };
    }
    let last: { provider: string; providerMessageId: string | null; status: string; error?: string } = {
      provider: provider.name, providerMessageId: null, status: 'failed',
    };
    for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt += 1) {
      last = await provider.send(payload).catch((e: Error) => ({
        provider: provider.name, providerMessageId: null as string | null, status: 'failed', error: e.message,
      }));
      if (last.status !== 'failed') return last;
      if (attempt < SEND_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, SEND_RETRY_MS * attempt));
      }
    }
    // Loud, and at the point of dispatch. The provider logs its own reason;
    // this says which flow lost a message, which is what tells you a citizen
    // is sitting on a verification screen waiting for a code that is not
    // coming.
    this.logger.error(`delivery FAILED after ${SEND_ATTEMPTS} attempts user=${meta.userId} channel=${channel} kind=${meta.kind} — ${last.error ?? 'no reason reported'}`);
    report(new Error(`mail dispatch failed: ${channel}/${meta.kind}`), {
      channel, kind: meta.kind, provider: last.provider, reason: last.error,
    });
    return last;
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
      const res = await this.dispatch(
        channel,
        {
          channel, to: target, subject, body: greeted.body,
          ...(channel === 'email' && greeted.html ? { html: greeted.html } : {}),
          kind,
          ...this.unsubscribeHeaders(channel, target, kind),
        },
        { userId, kind },
      );
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
    // Same rule as deliverSystem. A verification code that opens "Dear Somen,"
    // reads as a message from somebody rather than from a system.
    const who = await swallow(this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }), 'mail: recipient name read', { userId });
    const body = (channel === 'sms' ? greetSms : greetText)(r.body, who?.name);
    const html = r.html ? greetHtml(r.html, who?.name) : undefined;
    const res = await this.dispatch(
      channel,
      { channel, to: target, subject: r.subject, body, ...(channel === 'email' && html ? { html } : {}), kind },
      { userId, kind },
    );
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
    // `suppressed` is not a success: the caller is telling somebody a code is
    // coming, and to a bounced address it is not. It is not a provider failure
    // either, which is why it has its own word on the row.
    return { ok: res.status !== 'failed' && res.status !== 'suppressed', provider: res.provider, status: res.status };
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

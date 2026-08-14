/**
 * Together City Mail — sender-identity + inbound-parsing helpers.
 *
 * Kept Prisma-free on purpose so they can be unit-tested in isolation (the same
 * reason messaging-provider's checks live beside their own spec). MailService
 * and the inbound webhook both import from here.
 */
import { timingSafeEqual } from 'crypto';

/**
 * Build an RFC 5322 From header from a citizen's display name + city address, so
 * a user-composed message leaves AS the citizen — their @togethercity.app
 * address is covered by the domain's DKIM — rather than as the shared branded
 * box. The display name is quoted only when it contains characters that would
 * otherwise break the header; " and \ inside are escaped.
 */
export function cityFromHeader(name: string, addr: string): string {
  const clean = (name ?? '').replace(/[\r\n]/g, ' ').trim();
  if (!clean) return addr;
  const needsQuote = /["(),.:;<>@[\]\\]/.test(clean);
  const display = needsQuote ? `"${clean.replace(/(["\\])/g, '\\$1')}"` : clean;
  return `${display} <${addr}>`;
}

/** Constant-time string compare for the inbound webhook secret. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Parse "Name <a@b>" or a bare address into { addr (lowercased), name }. */
export function parseAddr(raw: string): { addr: string; name: string } {
  const v = (raw ?? '').trim();
  const m = /^([^<>]*)<([^<>]+)>$/.exec(v);
  if (m) return { addr: m[2].trim().toLowerCase(), name: m[1].trim().replace(/^"|"$/g, '') };
  return { addr: v.toLowerCase(), name: '' };
}

/** Pull a bare address out of a string or an { address | email | addr } object. */
export function addrFromField(v: unknown): string {
  if (typeof v === 'string') return parseAddr(v).addr;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const a = o.address ?? o.email ?? o.addr;
    return typeof a === 'string' ? a.trim().toLowerCase() : '';
  }
  return '';
}

/**
 * Normalise a To field that may be a string, "Name <a@b>", or an array of
 * either / of { address } objects, into bare lowercase addresses.
 */
export function toAddrList(v: unknown): string[] {
  if (!v) return [];
  const arr: unknown[] = Array.isArray(v) ? v : [v];
  return arr.map((x) => addrFromField(x)).filter(Boolean);
}

export interface InboundMail {
  to: string[];
  from: { addr: string; name: string };
  subject: string;
  text: string;
  html?: string;
  providerMessageId?: string;
  /**
   * Resend's own id for the received email — `data.email_id` on the
   * `email.received` event.
   *
   * THE WEBHOOK DOES NOT CARRY THE BODY. Resend's docs are explicit: "Webhooks
   * do not include the email body, headers, or attachments, only their
   * metadata." The payload has from, to, subject and this id, and no text or
   * html at all — so parsing alone would file every reply with the right sender
   * and subject and nothing inside it, which looks like the feature working.
   * MailService uses this id to fetch the body before writing the row.
   */
  emailId?: string;
  /**
   * The Message-IDs this mail says it answers — In-Reply-To first, then the
   * References chain, newest last.
   *
   * Threading used to be "the most recent message from this correspondent,
   * if the Re:-stripped subjects match exactly". Two conversations with one
   * person was enough to break it: a reply to the older one matched the newer
   * one's subject, failed, and started a third thread. The headers are the
   * answer the protocol already carries, and the outbound side now mints ids
   * it can recognise.
   */
  inReplyTo: string[];
}

/**
 * Parse a Resend (or compatible) inbound-email webhook payload defensively —
 * accepting both a bare email object and a `{ type, data }` envelope, and the
 * common shapes a `from`/`to` field can take. Returns null if it isn't an email
 * we can file.
 */
export function normalizeInbound(payload: unknown): InboundMail | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const d = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const to = toAddrList(d.to);
  const from = typeof d.from === 'string'
    ? parseAddr(d.from)
    : {
        addr: addrFromField(d.from),
        name: d.from && typeof d.from === 'object' ? String((d.from as Record<string, unknown>).name ?? '') : '',
      };
  if (!to.length || !from.addr) return null;
  const headers = (d.headers && typeof d.headers === 'object' ? d.headers : {}) as Record<string, unknown>;
  const idRaw = d.message_id ?? d.messageId ?? headers['message-id'] ?? headers['Message-ID'] ?? d.id ?? '';
  // Case-insensitive: header names are, and providers differ about which case
  // they hand back. Both fields are lists of <id> tokens; References carries
  // the whole chain, In-Reply-To the immediate parent, and either will do.
  const hdr = (name: string): string => {
    const k = Object.keys(headers).find((x) => x.toLowerCase() === name);
    const v = k === undefined ? undefined : headers[k];
    return typeof v === 'string' ? v : '';
  };
  const refs = `${d.in_reply_to ?? d.inReplyTo ?? hdr('in-reply-to')} ${d.references ?? hdr('references')}`;
  const inReplyTo = (refs.match(/<[^<>\s]+>/g) ?? []).map((x) => x.trim());
  return {
    to,
    from,
    subject: typeof d.subject === 'string' ? d.subject : '',
    text: typeof d.text === 'string' ? d.text : typeof d.plain === 'string' ? d.plain : '',
    html: typeof d.html === 'string' ? d.html : undefined,
    providerMessageId: String(idRaw) || undefined,
    emailId: typeof d.email_id === 'string' ? d.email_id
      : typeof d.emailId === 'string' ? d.emailId : undefined,
    inReplyTo,
  };
}

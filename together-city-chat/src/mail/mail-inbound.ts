/**
 * Together City Mail — sender-identity + inbound-parsing helpers.
 *
 * Kept Prisma-free on purpose so they can be unit-tested in isolation (the same
 * reason messaging-provider's checks live beside their own spec). MailService
 * and the inbound webhook both import from here.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { purposeSecret } from '../shared/secrets/derived-secret';

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

/**
 * ── THE ONE-CLICK UNSUBSCRIBE TOKEN, MINTED AND READ HERE ──────────────────
 *
 * Prisma-free like the rest of this file, because two things need it: the
 * service that puts the link in a header, and the GUARD that authenticates the
 * request when a mail client presses it. `route-exposure.spec.ts` is why it is
 * a guard — "a public mutation must NAME the mechanism that guards it, and
 * that mechanism must be a real guard on the route, where the inventory, and a
 * reviewer skimming the controller, can see it".
 *
 * An HMAC over the address and an expiry, so the endpoint needs no session and
 * no database read to know the link is ours — which is the point of
 * List-Unsubscribe-Post: the client presses it with nobody signed in.
 *
 * THE EXPIRY COMES FIRST and the address is everything after the first dot.
 * An email address contains dots, so `address.expiry` cannot be split back
 * apart: `reader@example.com.123` reads as an address of `reader@example`
 * expiring at `com`.
 *
 * Domain-separated from every other use of the signing secret, so a token
 * minted here can never be presented anywhere else.
 */
export function unsubscribeToken(address: string, expiresAt: number): string {
  return unsubscribeTokenWith(unsubscribeSecret(), address, expiresAt);
}

/** The unsubscribe key is its own secret now (4 Sep) — explicit
 *  MAIL_UNSUBSCRIBE_SECRET, else derived from the root; it was the raw JWT
 *  secret under a prefix. See shared/secrets. */
function unsubscribeSecret(): string {
  return purposeSecret(process.env.MAIL_UNSUBSCRIBE_SECRET, process.env.JWT_ACCESS_SECRET ?? '', 'mail-unsubscribe');
}

/** The key every link sent before 4 Sep was signed with. Read-only, so a
 *  footer in somebody's inbox keeps working through the 30-day window the
 *  tokens carry; delete after 5 Oct 2026. */
function legacyUnsubscribeSecret(): string {
  return `together-city/unsubscribe/${process.env.JWT_ACCESS_SECRET ?? ''}`;
}

function unsubscribeTokenWith(secret: string, address: string, expiresAt: number): string {
  const payload = `${expiresAt}.${address.trim().toLowerCase()}`;
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${mac}`;
}

/** The address a token names, or null for anything that is not one of ours.
 *  Null for every failure and never a reason: this endpoint takes an address,
 *  and a talkative refusal is a way to ask whether one is on our list. */
export function addressFromUnsubscribeToken(token: string): string | null {
  const [body, mac] = String(token ?? '').split('.');
  if (!body || !mac) return null;
  const payload = Buffer.from(body, 'base64url').toString('utf8');
  const cut = payload.indexOf('.');
  if (cut < 0) return null;
  const expiresAt = Number(payload.slice(0, cut));
  const address = payload.slice(cut + 1);
  if (!address || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const a = Buffer.from(token);
  for (const secret of [unsubscribeSecret(), legacyUnsubscribeSecret()]) {
    const b = Buffer.from(unsubscribeTokenWith(secret, address, expiresAt));
    if (a.length === b.length && timingSafeEqual(a, b)) return address;
  }
  return null;
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
/**
 * THE ARRAY ARRIVES FROM THE INTERNET AND HAD NO CEILING.
 *
 * A webhook payload is a JSON body from outside, and this took whatever length
 * of `to` it was handed: every entry parsed with a regex, lowercased, and held
 * in a list, before anything downstream had a chance to say "fifty is enough".
 * The delivery cap in the service is a cap on WORK DONE PER RECIPIENT; this is
 * the cap on the payload itself, and it has to be here, in the parser, because
 * by the time the service sees the list the allocation has already happened.
 *
 * `PARSE_CAP` is far above any real message — the delivery ceiling is fifty,
 * and a mail with fifty city recipients does not exist — so nothing legitimate
 * is trimmed. It is a bound on a hostile input, not a product rule, which is
 * why it does not warn: a truncation here is either an absurd message or an
 * attempt, and the service says out loud what it actually delivered to.
 */
const PARSE_CAP = 200;

export function toAddrList(v: unknown): string[] {
  if (!v) return [];
  const arr: unknown[] = Array.isArray(v) ? v.slice(0, PARSE_CAP) : [v];
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
   * What the webhook says was attached — names and types only, no bytes
   * (5 Sep). Until now this was not even read: a reply that carried a PDF
   * was filed as a reply with no PDF, and nothing anywhere said so. The
   * bytes come from the provider's attachment endpoint, by `emailId`.
   */
  attachments: Array<{ id: string; filename: string; contentType: string }>;
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
  /**
   * DID THE SENDER PROVE THEY ARE THE SENDER? (fifth audit, 29 Aug.)
   *
   * `ingestInbound` refused a city `From` and checked nothing else. The guard
   * on the route authenticates the PROVIDER, not the MESSAGE — so any host on
   * the internet could put `From: <a correspondent's address>` on a mail with
   * a matching subject and have it spliced into that live thread by the
   * subject heuristic, inheriting its filing and its history.
   *
   * `true` only when a verdict was found and it passed; `false` when a verdict
   * was found and it failed; `null` when the provider told us nothing, which
   * is a different thing from a failure and is treated as one below rather
   * than as either extreme.
   */
  authenticated: boolean | null;
}

/**
 * Read the sender verdict out of whatever the provider gave us.
 *
 * `Authentication-Results` is where the protocol puts it and it is what the
 * receiving MTA — Resend, in our case — writes after it has checked. The
 * per-field shapes (`dmarc: 'pass'`, `spf: { status }`) are accepted too,
 * because providers differ and a verdict we can read is worth more than a
 * verdict in the shape we expected.
 *
 * DMARC IS THE ONE THAT DECIDES, when it is there: it is the check that ties
 * the visible From to the thing that passed, which is the only question being
 * asked here. SPF alone passes for a forwarded message whose From is forged.
 */
export function senderVerdict(d: Record<string, unknown>, headers: Record<string, unknown>): boolean | null {
  const say = (v: unknown): string => {
    if (typeof v === 'string') return v.toLowerCase();
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const x = o.status ?? o.result ?? o.verdict;
      return typeof x === 'string' ? x.toLowerCase() : '';
    }
    return '';
  };
  for (const key of ['dmarc', 'dkim', 'spf']) {
    const v = say(d[key]);
    if (v === 'pass') return true;
    if (v === 'fail' || v === 'softfail' || v === 'permerror') return false;
  }
  const k = Object.keys(headers).find((x) => x.toLowerCase() === 'authentication-results');
  const line = k === undefined ? '' : String(headers[k] ?? '').toLowerCase();
  if (!line) return null;
  if (/\bdmarc=pass\b/.test(line)) return true;
  if (/\bdmarc=(fail|permerror|temperror)\b/.test(line)) return false;
  if (/\bdkim=pass\b/.test(line)) return true;
  if (/\bdkim=fail\b/.test(line) || /\bspf=fail\b/.test(line)) return false;
  return null;
}

/**
 * WHAT THE PROVIDER TELLS US AFTER IT HAS TRIED (fifth audit, 29 Aug).
 *
 * The webhook handled `email.received` and nothing else, so every other event
 * Resend sends — delivered, bounced, complained, delayed — arrived at a handler
 * that could make nothing of it and answered 200. `EmailDelivery.status` was
 * therefore written once, at create, and never again: every send in the table
 * says `queued` for ever, a hard bounce is re-sent on the next resend, and a
 * spam complaint suppresses nothing.
 *
 * `email_id` is the join. It is the id `ResendEmailProvider.send` already
 * returns and `EmailDelivery.providerMessageId` already stores.
 */
export type DeliveryEventType = 'delivered' | 'bounced' | 'complained' | 'delayed';

export interface DeliveryEvent {
  type: DeliveryEventType;
  /** The provider's id for the message this is about. */
  emailId: string;
  /** Who it was to, when the payload says. Lowercased. */
  address: string;
  /**
   * PERMANENT means the address does not exist and never will — that is the
   * one that must never be written to again. A soft bounce is a full mailbox
   * or a greylist and says nothing about the address, so it is recorded and
   * not suppressed. Resend reports the distinction as `bounce.type`.
   */
  permanent: boolean;
  /** The provider's own words, for a human reading the table later. */
  detail?: string;
}

const EVENT_TYPES: Record<string, DeliveryEventType> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed',
};

export function normalizeDeliveryEvent(payload: unknown): DeliveryEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const type = EVENT_TYPES[String(root.type ?? '')];
  if (!type) return null;
  const d = (root.data && typeof root.data === 'object' ? root.data : {}) as Record<string, unknown>;
  const emailId = String(d.email_id ?? d.emailId ?? d.id ?? '');
  if (!emailId) return null;
  const bounce = (d.bounce && typeof d.bounce === 'object' ? d.bounce : {}) as Record<string, unknown>;
  const subType = String(bounce.type ?? d.bounce_type ?? '').toLowerCase();
  return {
    type,
    emailId,
    address: toAddrList(d.to)[0] ?? '',
    /* Permanent unless the provider says otherwise. A bounce whose type we
       cannot read is treated as the address being gone, because the cost of
       suppressing a live address is one person who has to ask us to send
       again, and the cost of the other mistake is the domain. */
    permanent: type === 'bounced' ? subType !== 'transient' && subType !== 'soft' : false,
    detail: typeof bounce.message === 'string' ? bounce.message
      : typeof d.reason === 'string' ? d.reason : undefined,
  };
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
    attachments: attachmentsOf(d.attachments),
    authenticated: senderVerdict(d, headers),
  };
}

function attachmentsOf(raw: unknown): InboundMail['attachments'] {
  if (!Array.isArray(raw)) return [];
  const out: InboundMail['attachments'] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) continue;
    out.push({
      id: r.id,
      filename: typeof r.filename === 'string' && r.filename ? r.filename : 'attachment',
      contentType: typeof r.content_type === 'string' ? r.content_type : typeof r.contentType === 'string' ? r.contentType : 'application/octet-stream',
    });
  }
  return out;
}

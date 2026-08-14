/**
 * Together City — messaging provider seam.
 *
 * Every message that leaves the city (a receipt copied to a primary email, a
 * recovery OTP texted to a phone) is dispatched through a MessagingProvider.
 * This is the ONE place to wire a real vendor — swap the stub for SendGrid/SES
 * (email) or Twilio/SNS (SMS) by implementing this interface and returning it
 * from `createMessagingProvider()`. Nothing else in the app changes.
 */
import { swallow } from '../shared/swallow';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';

export type Channel = 'email' | 'sms';

/** A real file to send with an email (base64 content, as vendors expect). */
export interface OutboundAttachment {
  filename: string;
  contentBase64: string;
  contentType?: string;
}

export interface OutboundMessage {
  channel: Channel;
  to: string;          // email address or E.164 phone
  subject?: string;    // email only
  body: string;        // plain-text (SMS body, or the email text fallback)
  html?: string;       // email only — rich HTML body (falls back to `body`)
  kind: string;        // receipt | recovery | security | welcome
  attachments?: OutboundAttachment[]; // email only — real MIME attachments
  // email only — per-message sender identity. User-composed city mail sends AS
  // the citizen's own "<Name> <handle@togethercity.app>" (covered by the
  // domain's DKIM), so it arrives from them, not from the shared branded box.
  // Omitted for system mail (OTP/receipts), which uses the provider default.
  from?: string;
  // email only — where replies go. Set to the citizen's city address so a reply
  // lands back in THEIR inbox (via the inbound webhook), not the shared box.
  replyTo?: string;
  /**
   * email only — raw headers to put on the wire.
   *
   * This is the seam that was missing. Everything an email needs beyond a
   * body — Message-ID, In-Reply-To, References, and later List-Unsubscribe and
   * Auto-Submitted — is a header, and there was nowhere to put one, so
   * outbound city mail carried none of them. Gmail and Outlook were left to
   * thread on the subject line alone.
   */
  headers?: Record<string, string>;
}

export interface ProviderResult {
  provider: string;
  providerMessageId: string;
  status: 'queued' | 'sent' | 'failed';
  /** Why it failed, when it did. Present only on status: 'failed'. */
  error?: string;
}

/** The parts of a received email that the webhook does not carry. */
export interface ReceivedBody { text: string; html: string | null; subject: string }

export interface MessagingProvider {
  readonly name: string;
  send(msg: OutboundMessage): Promise<ProviderResult>;
  /**
   * Fetch a received email's BODY by the provider's id.
   *
   * Optional because it is meaningless for a provider that cannot receive — the
   * stub has nothing to fetch from. Callers must handle its absence rather than
   * assume the configured provider can do this.
   */
  fetchReceived?(id: string): Promise<ReceivedBody | null>;
}

/**
 * Stub provider — the default. Performs NO real network I/O; it logs the
 * dispatch and returns a synthetic message id so the whole flow is exercised
 * end-to-end in dev/demo. Production swaps this out (see adapters below).
 */
let warnedStubInProd = false;

export class StubMessagingProvider implements MessagingProvider {
  readonly name = 'stub';
  async send(msg: OutboundMessage): Promise<ProviderResult> {
    if (process.env.NODE_ENV === 'production' && !warnedStubInProd) {
      warnedStubInProd = true;
      // eslint-disable-next-line no-console
      console.error('[messaging:stub] WARNING: running in production with the STUB provider — verification & OTP messages are NOT being delivered. Set EMAIL_PROVIDER=resend + RESEND_API_KEY.');
    }
    const id = `stub_${msg.channel}_${randomBytes(6).toString('hex')}`;
    // eslint-disable-next-line no-console
    console.log(`[messaging:stub] → ${msg.channel} ${msg.to} · ${msg.kind} · ${msg.subject ?? '(sms)'} · ${id}`);
    return { provider: 'stub', providerMessageId: id, status: 'sent' };
  }
}

/**
 * Resend email provider (recommended). Enable with EMAIL_PROVIDER=resend and set
 * RESEND_API_KEY + EMAIL_FROM (a verified sender, e.g. "Together City
 * <no-reply@togethercity.app>"). SendGrid is a drop-in alternative behind the
 * same interface — implement SendgridEmailProvider and add a case below.
 */
/**
 * Is this a sender address a mail provider will accept — and if not, can it be
 * salvaged without guessing?
 *
 * Two legal shapes, and only two: a bare address, or a display name followed by
 * the address in angle brackets. Checked rather than trusted, because the
 * failure it catches is silent, total and indistinguishable from a delivery
 * problem — one missing ">" in an environment variable rejects every message the
 * application ever sends, and the only evidence is a 422 in a dashboard nobody
 * thinks to open. That is not hypothetical: EMAIL_FROM was set to
 * "Together City <hello@togethercity.app" and every send for a week was refused.
 *
 * ONE malformation is repaired rather than merely reported: an opening "<" with
 * a valid address after it and no closing ">". There is exactly one thing that
 * can mean, so repairing it is not a guess — and Railway's variable editor has
 * been observed dropping that character on save, which makes this a defect the
 * configuration UI can inflict on you rather than one you can avoid by being
 * careful. A repair is logged every time. Anything else is refused, because a
 * "helpful" fix to an ambiguous value is how you end up sending as the wrong
 * domain and never finding out.
 */
export interface FromAddressCheck {
  ok: boolean;
  /** The address to actually use. Present when ok. */
  value?: string;
  /** True when `value` differs from the input because we repaired it. */
  repaired?: boolean;
  reason?: string;
}

const SHAPE_HELP = 'Use either "user@domain" or "Display Name <user@domain>".';
const ADDR = /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/;

export function describeFromAddress(from: string): FromAddressCheck {
  const v = (from ?? '').trim();
  if (!v) return { ok: false, reason: `EMAIL_FROM is empty. ${SHAPE_HELP}` };

  const bracketed = /^([^<>]*)<([^<>]+)>$/.exec(v);
  if (bracketed && ADDR.test(bracketed[2].trim())) return { ok: true, value: v };

  // The repairable case: "Display Name <user@domain" — opening bracket, valid
  // address, nothing closing it.
  const truncated = /^([^<>]*)<([^<>]+)$/.exec(v);
  if (truncated && ADDR.test(truncated[2].trim())) {
    return { ok: true, value: `${truncated[1]}<${truncated[2].trim()}>`, repaired: true };
  }

  if (ADDR.test(v)) return { ok: true, value: v };

  if (v.includes('<') || v.includes('>')) {
    return { ok: false, reason: `EMAIL_FROM has unbalanced or empty angle brackets: ${JSON.stringify(v)}. ${SHAPE_HELP}` };
  }
  return { ok: false, reason: `EMAIL_FROM is not a valid sender: ${JSON.stringify(v)}. ${SHAPE_HELP}` };
}

export class ResendEmailProvider implements MessagingProvider {
  readonly name = 'resend';
  private readonly client: Resend;
  private readonly from: string;

  constructor(
    apiKey: string = process.env.RESEND_API_KEY ?? '',
    // Must be a domain VERIFIED in Resend. Defaults to togethercity.app (the
    // verified sending domain); override with EMAIL_FROM if you verify another.
    from: string = process.env.EMAIL_FROM ?? 'Together City <no-reply@togethercity.app>',
  ) {
    this.client = new Resend(apiKey);
    this.from = from;

    // Loud, once, at construction. A sender that cannot work should say so when
    // the app starts, not on the first verification code somebody waits for.
    const verdict = describeFromAddress(from);
    if (!verdict.ok) {
      // eslint-disable-next-line no-console
      console.error(`[messaging:resend] REFUSING TO START CLEANLY — ${verdict.reason} Every send will be rejected until this is fixed.`);
    } else if (verdict.repaired) {
      // eslint-disable-next-line no-console
      console.warn(`[messaging:resend] EMAIL_FROM was missing its closing ">" and has been repaired to ${JSON.stringify(verdict.value)}. Fix the variable — this repair is a safety net, not the intended configuration.`);
      this.from = verdict.value as string;
    }
  }

  /**
   * Pull a received email's body from Resend.
   *
   * The `email.received` webhook is metadata only — from, to, subject, an id,
   * and attachment descriptions. The text and html live behind this call, so a
   * reply cannot be filed without it. Returns null rather than throwing: a
   * webhook must not 500 because one fetch failed, and the caller says so in
   * the message it writes instead of leaving a blank one.
   */
  async fetchReceived(id: string): Promise<ReceivedBody | null> {
    try {
      const { data, error } = await this.client.emails.receiving.get(id);
      if (error || !data) {
        // eslint-disable-next-line no-console
        console.error(`[messaging:resend] receiving.get(${id}) failed — ${error?.message ?? 'no data returned'}`);
        return null;
      }
      return { text: data.text ?? '', html: data.html ?? null, subject: data.subject ?? '' };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[messaging:resend] receiving.get(${id}) threw — ${(e as Error).message}`);
      return null;
    }
  }

  async send(msg: OutboundMessage): Promise<ProviderResult> {
    if (msg.channel !== 'email') {
      throw new Error('ResendEmailProvider handles the email channel only');
    }
    // Per-message sender: user-composed city mail carries its own `from` (the
    // citizen's @togethercity.app address, covered by domain DKIM). System mail
    // passes none and uses the branded default. A malformed per-message from is
    // refused back to the default rather than sent as the wrong identity — the
    // same "never guess a sender" rule the default is checked by.
    const perMsgFrom = msg.from?.trim() ? describeFromAddress(msg.from) : null;
    if (perMsgFrom && !perMsgFrom.ok) {
      // eslint-disable-next-line no-console
      console.error(`[messaging:resend] per-message from invalid — ${perMsgFrom.reason} Falling back to ${this.from}.`);
    }
    const fromToUse = perMsgFrom?.ok ? (perMsgFrom.value as string) : this.from;
    const { data, error } = await this.client.emails.send({
      from: fromToUse,
      // Replies go where the sender can actually receive them (their city
      // inbox), not to the envelope default.
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      // Threading, and whatever else the caller needs on the wire.
      ...(msg.headers && Object.keys(msg.headers).length ? { headers: msg.headers } : {}),
      to: msg.to,
      subject: msg.subject ?? '(no subject)',
      // Send both: HTML for clients that render it, plain text as the fallback.
      ...(msg.html ? { html: msg.html } : {}),
      text: msg.body,
      // Real MIME attachments (Resend takes base64 content per file).
      ...(msg.attachments?.length
        ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: a.contentBase64,
              ...(a.contentType ? { contentType: a.contentType } : {}),
            })),
          }
        : {}),
    });
    if (error) {
      // Resend says exactly what was wrong — a rejected sender, a malformed
      // address, a field it would not accept. This used to destructure `error`
      // and then discard it, so every failure looked identical from the inside
      // and thirteen consecutive 422s went unnoticed for a week. The one thing
      // a failed send must not do is fail silently.
      const reason = `${error.name ?? 'error'}: ${error.message ?? 'no detail'}`;
      // The recipient's domain, not their address: enough to tell "every send to
      // this domain fails" from "this one address is malformed", without turning
      // an error log into a list of people's email addresses.
      const domain = msg.to.includes('@') ? msg.to.split('@').pop() : 'unknown';
      // eslint-disable-next-line no-console
      console.error(`[messaging:resend] send REJECTED — ${reason} (from: ${fromToUse}, to domain: ${domain}, kind: ${msg.kind})`);
      return { provider: 'resend', providerMessageId: '', status: 'failed', error: reason };
    }
    return { provider: 'resend', providerMessageId: data?.id ?? '', status: 'queued' };
  }
}

/**
 * Twilio SMS. Enable with SMS_PROVIDER=twilio and set TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN, and either TWILIO_FROM (a number you own) or
 * TWILIO_MESSAGING_SERVICE_SID (a messaging service, which is what you want in
 * India — it handles sender-ID and route selection for you).
 *
 * Written against the REST API with fetch rather than the twilio SDK: the whole
 * call is one form POST, and the SDK is 40-odd transitive dependencies for it.
 * The dependency audit already flags how much of the tree is reachable.
 */
export class TwilioSmsProvider implements MessagingProvider {
  readonly name = 'twilio';

  constructor(
    private readonly sid: string = process.env.TWILIO_ACCOUNT_SID ?? '',
    private readonly token: string = process.env.TWILIO_AUTH_TOKEN ?? '',
    private readonly from: string = process.env.TWILIO_FROM ?? '',
    private readonly messagingServiceSid: string = process.env.TWILIO_MESSAGING_SERVICE_SID ?? '',
  ) {}

  async send(msg: OutboundMessage): Promise<ProviderResult> {
    if (msg.channel !== 'sms') throw new Error('TwilioSmsProvider handles the sms channel only');

    const body = new URLSearchParams({ To: msg.to, Body: msg.body });
    if (this.messagingServiceSid) body.set('MessagingServiceSid', this.messagingServiceSid);
    else body.set('From', this.from);

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        // An OTP the user is staring at is worthless after ten seconds of
        // waiting. Fail fast and let them press resend.
        signal: AbortSignal.timeout(10_000),
      });
      const json = ((await swallow(res.json(), 'twilio: response parse')) ?? {}) as { sid?: string; status?: string; message?: string };
      if (!res.ok) {
        // Never log msg.to at error level: a failed-send log becomes a list of
        // phone numbers, which is the last thing an incident channel needs.
        // eslint-disable-next-line no-console
        console.error(`[messaging:twilio] send failed (${res.status}): ${json.message ?? 'no detail'}`);
        return { provider: 'twilio', providerMessageId: json.sid ?? '', status: 'failed', error: `${res.status}: ${json.message ?? 'no detail'}` };
      }
      // Twilio's own vocabulary: queued | accepted | sending | sent | failed.
      // Anything that is not an outright failure is 'queued' here, because the
      // delivery state machine (BE-2.2) is what resolves it from the webhook —
      // guessing "sent" at dispatch time is exactly the p21 bug.
      const status = json.status === 'failed' || json.status === 'undelivered' ? 'failed' : 'queued';
      return { provider: 'twilio', providerMessageId: json.sid ?? '', status };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[messaging:twilio] send threw: ${(e as Error).message}`);
      return { provider: 'twilio', providerMessageId: '', status: 'failed', error: (e as Error).message };
    }
  }
}

/**
 * Factory — returns the configured provider per channel. Email defaults to
 * EMAIL_PROVIDER (then MESSAGING_PROVIDER, then stub); SMS to SMS_PROVIDER.
 * Unset → StubMessagingProvider, so the app runs with no vendor credentials.
 */
/**
 * Whether a REAL (non-stub) provider is wired for a channel. Lets flows like
 * password recovery tell the user "delivery isn't set up yet" instead of
 * silently pretending a code was sent. This is a system-wide config fact — it
 * reveals nothing about any specific account.
 */
export function messagingConfigured(channel: Channel): boolean {
  return createMessagingProvider(channel).name !== 'stub';
}

export function createMessagingProvider(channel: Channel): MessagingProvider {
  if (channel === 'email') {
    const provider = (process.env.EMAIL_PROVIDER ?? process.env.MESSAGING_PROVIDER ?? 'stub').toLowerCase();
    switch (provider) {
      case 'resend':
        return new ResendEmailProvider();
      // case 'sendgrid': return new SendgridEmailProvider();
      case 'stub':
      default:
        return new StubMessagingProvider();
    }
  }

  const smsProvider = (process.env.SMS_PROVIDER ?? process.env.MESSAGING_PROVIDER ?? 'stub').toLowerCase();
  switch (smsProvider) {
    case 'twilio':
      return new TwilioSmsProvider();
    case 'stub':
    default:
      return new StubMessagingProvider();
  }
}

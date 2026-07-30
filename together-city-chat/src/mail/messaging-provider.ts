/**
 * Together City — messaging provider seam.
 *
 * Every message that leaves the city (a receipt copied to a primary email, a
 * recovery OTP texted to a phone) is dispatched through a MessagingProvider.
 * This is the ONE place to wire a real vendor — swap the stub for SendGrid/SES
 * (email) or Twilio/SNS (SMS) by implementing this interface and returning it
 * from `createMessagingProvider()`. Nothing else in the app changes.
 */
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
}

export interface ProviderResult {
  provider: string;
  providerMessageId: string;
  status: 'queued' | 'sent' | 'failed';
}

export interface MessagingProvider {
  readonly name: string;
  send(msg: OutboundMessage): Promise<ProviderResult>;
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
  }

  async send(msg: OutboundMessage): Promise<ProviderResult> {
    if (msg.channel !== 'email') {
      throw new Error('ResendEmailProvider handles the email channel only');
    }
    const { data, error } = await this.client.emails.send({
      from: this.from,
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
      return { provider: 'resend', providerMessageId: '', status: 'failed' };
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
      const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string };
      if (!res.ok) {
        // Never log msg.to at error level: a failed-send log becomes a list of
        // phone numbers, which is the last thing an incident channel needs.
        // eslint-disable-next-line no-console
        console.error(`[messaging:twilio] send failed (${res.status}): ${json.message ?? 'no detail'}`);
        return { provider: 'twilio', providerMessageId: json.sid ?? '', status: 'failed' };
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
      return { provider: 'twilio', providerMessageId: '', status: 'failed' };
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

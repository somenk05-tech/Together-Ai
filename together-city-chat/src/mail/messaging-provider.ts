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

export interface OutboundMessage {
  channel: Channel;
  to: string;          // email address or E.164 phone
  subject?: string;    // email only
  body: string;
  kind: string;        // receipt | recovery | security | welcome
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
export class StubMessagingProvider implements MessagingProvider {
  readonly name = 'stub';
  async send(msg: OutboundMessage): Promise<ProviderResult> {
    const id = `stub_${msg.channel}_${randomBytes(6).toString('hex')}`;
    // eslint-disable-next-line no-console
    console.log(`[messaging:stub] → ${msg.channel} ${msg.to} · ${msg.kind} · ${msg.subject ?? '(sms)'} · ${id}`);
    return { provider: 'stub', providerMessageId: id, status: 'sent' };
  }
}

/**
 * Resend email provider (recommended). Enable with EMAIL_PROVIDER=resend and set
 * RESEND_API_KEY + EMAIL_FROM (a verified sender, e.g. "Together City
 * <no-reply@togethercity.tech>"). SendGrid is a drop-in alternative behind the
 * same interface — implement SendgridEmailProvider and add a case below.
 */
export class ResendEmailProvider implements MessagingProvider {
  readonly name = 'resend';
  private readonly client: Resend;
  private readonly from: string;

  constructor(
    apiKey: string = process.env.RESEND_API_KEY ?? '',
    from: string = process.env.EMAIL_FROM ?? 'Together City <no-reply@togethercity.tech>',
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
      text: msg.body,
    });
    if (error) {
      return { provider: 'resend', providerMessageId: '', status: 'failed' };
    }
    return { provider: 'resend', providerMessageId: data?.id ?? '', status: 'queued' };
  }
}

/*
 * SMS (recovery OTP) — implement + enable via SMS_PROVIDER=twilio:
 *
 * class TwilioSmsProvider implements MessagingProvider {
 *   readonly name = 'twilio';
 *   constructor(private sid = process.env.TWILIO_SID!, private token = process.env.TWILIO_TOKEN!, private from = process.env.TWILIO_FROM!) {}
 *   async send(msg: OutboundMessage): Promise<ProviderResult> {
 *     // POST https://api.twilio.com/2010-04-01/Accounts/<sid>/Messages.json  (Basic auth)
 *     // return { provider: 'twilio', providerMessageId: res.sid, status: res.status };
 *   }
 * }
 */

/**
 * Factory — returns the configured provider per channel. Email defaults to
 * EMAIL_PROVIDER (then MESSAGING_PROVIDER, then stub); SMS to SMS_PROVIDER.
 * Unset → StubMessagingProvider, so the app runs with no vendor credentials.
 */
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
    // case 'twilio': return new TwilioSmsProvider();
    case 'stub':
    default:
      return new StubMessagingProvider();
  }
}

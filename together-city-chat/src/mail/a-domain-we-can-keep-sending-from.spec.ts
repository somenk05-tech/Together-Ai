/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MailService } from './mail.service';
import { addressFromUnsubscribeToken, normalizeDeliveryEvent, senderVerdict, unsubscribeToken } from './mail-inbound';

/**
 * ── THE DOMAIN IS THE ASSET (fifth audit, 29 Aug) ──────────────────────────
 *
 * `the-city-is-not-a-megaphone` already says what is at stake in its own
 * words: "a burnt sender reputation locks everybody out of their own
 * accounts". One domain carries every verification code, every recovery code
 * and every citizen's outbound mail, and four things were missing from the
 * side of it that keeps a reputation:
 *
 *  1 · NO FEEDBACK AT ALL. The webhook understood `email.received` and nothing
 *      else, so `EmailDelivery.status` was written at create and never again —
 *      every send in the table reads `queued` for ever. A hard bounce was
 *      re-sent on the next resend; a complaint suppressed nothing.
 *  2 · NO SUPPRESSION LIST to write any of that down in.
 *  3 · AN UNVERIFIED ACCOUNT COULD SEND 200 EXTERNAL EMAILS A DAY from a
 *      DKIM-aligned city address. `VerifiedGuard` existed and was used in
 *      exactly one place: the Dating hub.
 *  4 · AND NO `List-Unsubscribe`, on traffic that is bulk-SHAPED even where it
 *      is transactional in substance.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('what the provider says afterwards is read', () => {
  it('recognises the four events, and the received one is not one of them', () => {
    expect(normalizeDeliveryEvent({ type: 'email.bounced', data: { email_id: 'e1' } })?.type).toBe('bounced');
    expect(normalizeDeliveryEvent({ type: 'email.complained', data: { email_id: 'e1' } })?.type).toBe('complained');
    expect(normalizeDeliveryEvent({ type: 'email.delivered', data: { email_id: 'e1' } })?.type).toBe('delivered');
    expect(normalizeDeliveryEvent({ type: 'email.delivery_delayed', data: { email_id: 'e1' } })?.type).toBe('delayed');
    // Still an email to file, not a verdict about one.
    expect(normalizeDeliveryEvent({ type: 'email.received', data: { email_id: 'e1' } })).toBeNull();
  });

  it('needs the provider id, because that is the only join to the row', () => {
    expect(normalizeDeliveryEvent({ type: 'email.bounced', data: {} })).toBeNull();
  });

  it('a soft bounce is not permanent, and an unlabelled one is', () => {
    // A full mailbox says nothing about whether the address exists. An
    // unreadable label is treated as the address being gone, because the cost
    // of the other mistake is the domain.
    expect(normalizeDeliveryEvent({ type: 'email.bounced', data: { email_id: 'e', bounce: { type: 'Transient' } } })?.permanent).toBe(false);
    expect(normalizeDeliveryEvent({ type: 'email.bounced', data: { email_id: 'e', bounce: { type: 'Permanent' } } })?.permanent).toBe(true);
    expect(normalizeDeliveryEvent({ type: 'email.bounced', data: { email_id: 'e' } })?.permanent).toBe(true);
  });

  it('a complaint is never "permanent" — it is a different fact', () => {
    expect(normalizeDeliveryEvent({ type: 'email.complained', data: { email_id: 'e' } })?.permanent).toBe(false);
  });
});

describe('who may still be written to', () => {
  const build = (rows: any[]) => {
    const prisma: any = {
      suppressedAddress: {
        findUnique: async ({ where }: any) => rows.find((r) => r.address === where.address) ?? null,
        upsert: async ({ where, create }: any) => {
          const i = rows.findIndex((r) => r.address === where.address);
          if (i >= 0) rows[i] = { ...rows[i], ...create }; else rows.push(create);
          return create;
        },
      },
      emailDelivery: { updateMany: async () => ({ count: 1 }) },
    };
    return { svc: new MailService(prisma, {} as never) as any, rows };
  };

  it('a hard bounce stops everything, recovery included', () => {
    // There is nobody at the address. A recovery code sent there is not a
    // kindness, it is a mark against the domain.
    const { svc } = build([{ address: 'gone@example.com', reason: 'hard-bounce' }]);
    return Promise.all([
      expect(svc.suppressedFor('email', 'gone@example.com', 'recovery')).resolves.toBe('hard-bounce'),
      expect(svc.suppressedFor('email', 'gone@example.com', 'receipt')).resolves.toBe('hard-bounce'),
    ]);
  });

  it('a complaint stops the discretionary mail and not the asked-for kind', async () => {
    // Somebody who marked a receipt as spam and later forgets their password
    // must still be able to get back in.
    const { svc } = build([{ address: 'cross@example.com', reason: 'complaint' }]);
    await expect(svc.suppressedFor('email', 'cross@example.com', 'receipt')).resolves.toBe('complaint');
    await expect(svc.suppressedFor('email', 'cross@example.com', 'welcome')).resolves.toBe('complaint');
    await expect(svc.suppressedFor('email', 'cross@example.com', 'recovery')).resolves.toBeNull();
    await expect(svc.suppressedFor('email', 'cross@example.com', 'security')).resolves.toBeNull();
  });

  it('an unknown address is not on any list', async () => {
    const { svc } = build([]);
    await expect(svc.suppressedFor('email', 'nobody@example.com', 'receipt')).resolves.toBeNull();
  });

  it('and an unreadable list lets the message through, loudly', async () => {
    // Fail-open here on purpose: refusing every message because one query
    // failed takes the city's whole recovery path down with it.
    const prisma: any = { suppressedAddress: { findUnique: async () => { throw new Error('down'); } } };
    const svc: any = new MailService(prisma, {} as never);
    svc.logger = { warn: () => undefined };
    await expect(svc.suppressedFor('email', 'a@b.com', 'recovery')).resolves.toBeNull();
  });

  it('a permanent bounce writes the address down; a soft one does not', async () => {
    const { svc, rows } = build([]);
    svc.logger = { warn: () => undefined };
    await svc.ingestDeliveryEvent({ type: 'bounced', emailId: 'e1', address: 'gone@example.com', permanent: true });
    expect(rows.map((r) => r.reason)).toEqual(['hard-bounce']);

    const soft = build([]);
    soft.svc.logger = { warn: () => undefined };
    await soft.svc.ingestDeliveryEvent({ type: 'bounced', emailId: 'e2', address: 'full@example.com', permanent: false });
    expect(soft.rows).toEqual([]);
  });

  it('a complaint writes it down as a complaint, not as a bounce', async () => {
    const { svc, rows } = build([]);
    svc.logger = { warn: () => undefined };
    await svc.ingestDeliveryEvent({ type: 'complained', emailId: 'e1', address: 'cross@example.com', permanent: false });
    expect(rows[0]).toMatchObject({ address: 'cross@example.com', reason: 'complaint' });
  });
});

describe('a one-click unsubscribe proves itself', () => {
  it('round-trips a token it minted', () => {
    expect(addressFromUnsubscribeToken(unsubscribeToken('Reader@Example.com', Date.now() + 60_000)))
      .toBe('reader@example.com');
  });

  it('refuses a forged one, an expired one and a nonsense one', () => {
    const good = unsubscribeToken('reader@example.com', Date.now() + 60_000);
    const [body] = good.split('.');
    expect(addressFromUnsubscribeToken(`${body}.notthemac`)).toBeNull();
    expect(addressFromUnsubscribeToken(unsubscribeToken('reader@example.com', Date.now() - 1))).toBeNull();
    expect(addressFromUnsubscribeToken('rubbish')).toBeNull();
    expect(addressFromUnsubscribeToken('')).toBeNull();
  });

  it('and one minted for a different address does not unsubscribe this one', () => {
    const forOther = unsubscribeToken('someone@example.com', Date.now() + 60_000);
    const [, mac] = forOther.split('.');
    const swapped = `${Buffer.from(`${Date.now() + 60_000}.victim@example.com`).toString('base64url')}.${mac}`;
    expect(addressFromUnsubscribeToken(swapped)).toBeNull();
  });

  it('the token is read by a GUARD, not by the handler', () => {
    // route-exposure.spec.ts: a public mutation must NAME the mechanism that
    // guards it, and that mechanism must be a real guard on the route, where
    // the inventory and a reviewer skimming the controller can both see it.
    const c = read('mail/mail-inbound.controller.ts');
    expect(c).toMatch(/@UseGuards\(UnsubscribeTokenGuard\)/);
    // And the service takes an address that has already been proved, so the
    // check cannot be half-done in two places.
    expect(read('mail/mail.service.ts')).toMatch(/async unsubscribe\(address: string\)/);
  });
});

describe('the header, and who gets it', () => {
  const svc = () => new MailService({} as never, {} as never) as any;
  const withBase = <T>(run: () => T): T => {
    const before = process.env.PUBLIC_API_URL;
    process.env.PUBLIC_API_URL = 'https://api.togethercity.app/api';
    try { return run(); } finally { process.env.PUBLIC_API_URL = before; }
  };

  it('rides on a receipt and on a welcome', () => {
    withBase(() => {
      for (const kind of ['receipt', 'welcome']) {
        const h = svc().unsubscribeHeaders('email', 'a@b.com', kind).headers;
        expect(h?.['List-Unsubscribe']).toMatch(/^<https:\/\/api\.togethercity\.app\/api\/mail\/unsubscribe\?t=/);
        expect(h?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      }
    });
  });

  it('never on a recovery code or a security notice', () => {
    // There is no unsubscribing from a password reset, and offering to would
    // be an invitation to lock yourself out.
    withBase(() => {
      expect(svc().unsubscribeHeaders('email', 'a@b.com', 'recovery')).toEqual({});
      expect(svc().unsubscribeHeaders('email', 'a@b.com', 'security')).toEqual({});
    });
  });

  it('and not at all when there is no public URL to point at', () => {
    // A List-Unsubscribe pointing nowhere is worse than none: a client that
    // presses it and fails may treat the whole message as broken.
    const before = process.env.PUBLIC_API_URL;
    process.env.PUBLIC_API_URL = '';
    try { expect(svc().unsubscribeHeaders('email', 'a@b.com', 'receipt')).toEqual({}); }
    finally { process.env.PUBLIC_API_URL = before; }
  });

  it('and never on SMS, which has no headers', () => {
    withBase(() => expect(svc().unsubscribeHeaders('sms', '+919876543210', 'receipt')).toEqual({}));
  });
});

describe('who may use the city’s domain', () => {
  const mail = read('mail/mail.service.ts');

  it('an unverified account may not write outside the city', () => {
    const fn = mail.slice(mail.indexOf('private async fanOut('), mail.indexOf('async send('));
    expect(fn).toMatch(/emailVerified: true/);
    expect(fn).toMatch(/Confirm your own email address before writing to addresses outside the city/);
  });

  it('but internal mail is untouched, which is why the gate is not on the route', () => {
    // Writing to a citizen you are connected with reaches nobody's spam filter
    // and costs the domain nothing.
    const fn = mail.slice(mail.indexOf('private async fanOut('), mail.indexOf('async send('));
    expect(fn).toMatch(/if \(external\.length\) \{\s*\n\s*const sender/);
    expect(read('mail/mail.controller.ts')).not.toMatch(/VerifiedGuard/);
  });

  it('and city mail has a ceiling of its own now', () => {
    expect(mail).toMatch(/INTERNAL_SENDS_PER_DAY = 500/);
  });
});

describe('a forged sender does not inherit a conversation', () => {
  it('reads a per-field verdict', () => {
    expect(senderVerdict({ dmarc: 'pass' }, {})).toBe(true);
    expect(senderVerdict({ dmarc: 'fail' }, {})).toBe(false);
    expect(senderVerdict({ spf: { status: 'pass' } }, {})).toBe(true);
  });

  it('and the Authentication-Results line the protocol actually uses', () => {
    expect(senderVerdict({}, { 'Authentication-Results': 'mx.example; spf=pass; dkim=pass; dmarc=pass' })).toBe(true);
    expect(senderVerdict({}, { 'authentication-results': 'mx.example; dmarc=fail' })).toBe(false);
  });

  it('and says nothing rather than guessing when there is nothing to read', () => {
    expect(senderVerdict({}, {})).toBeNull();
    expect(senderVerdict({}, { 'Authentication-Results': 'mx.example; none' })).toBeNull();
  });
});

describe('an HTML email arrives as something a person can read', () => {
  const svc = () => new MailService({} as never, {} as never) as any;

  /**
   * `html.replace(/<[^>]*>/g, ' ')` removes the TAGS and keeps everything
   * between them — so a real marketing email, which opens with a `<style>`
   * block and often carries a `<script>`, arrived as a wall of CSS followed by
   * the words, with every `&nbsp;` still spelled out. Not a security hole:
   * nothing renders this as HTML. A product one, and it made HTML mail
   * effectively unreadable. (re-audit, 29 Aug)
   */
  it('drops script and style WITH their contents', () => {
    const out = svc().htmlToText('<style>.a{color:red}</style><script>alert(1)</script><p>Hello</p>');
    expect(out).toBe('Hello');
  });

  it('keeps the paragraphs as paragraphs', () => {
    expect(svc().htmlToText('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
    expect(svc().htmlToText('a<br>b')).toBe('a\nb');
  });

  it('decodes the entities instead of printing them', () => {
    expect(svc().htmlToText('<p>Tom &amp; Jerry&nbsp;&#39;s &lt;hat&gt; &#x2014; ok</p>'))
      .toBe("Tom & Jerry 's <hat> — ok");
  });

  it('and an HTML comment is not content', () => {
    expect(svc().htmlToText('<!-- hidden --><p>shown</p>')).toBe('shown');
  });

  it('leaves a plain-text body untouched — it never reaches this', () => {
    // `inboundBody` prefers `mail.text` and only falls back to the HTML.
    const mail = { text: 'plain  body', html: '<p>rich</p>' } as any;
    return expect(svc().inboundBody(mail)).resolves.toBe('plain  body');
  });
});

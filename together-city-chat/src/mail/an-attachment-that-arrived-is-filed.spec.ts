/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { normalizeInbound } from './mail-inbound';
import { MailService } from './mail.service';

/**
 * ── AN ATTACHMENT THAT ARRIVED IS FILED, OR SAID TO BE MISSING (5 Sep) ──────
 * The webhook's attachment list was never read and the row said nothing:
 * a reply with a signed contract was filed as a reply with no contract.
 */
describe('the webhook’s attachment list is read', () => {
  it('names and types come through; bytes never do', () => {
    const out = normalizeInbound({
      type: 'email.received',
      data: {
        email_id: 'e1', from: 'bob@gmail.com', to: ['somen@togethercity.app'], subject: 'contract',
        attachments: [{ id: 'a1', filename: 'contract.pdf', content_type: 'application/pdf' }, { id: 'a2', filename: null, content_type: 'image/png' }, { nope: true }],
      },
    })!;
    expect(out.attachments).toEqual([
      { id: 'a1', filename: 'contract.pdf', contentType: 'application/pdf' },
      { id: 'a2', filename: 'attachment', contentType: 'image/png' },
    ]);
  });
  it('no list is an empty list', () => {
    expect(normalizeInbound({ data: { from: 'b@x.com', to: ['s@togethercity.app'], subject: 's' } })!.attachments).toEqual([]);
  });
});

function svc(opts: { list: unknown; put?: string | null; fetchOk?: boolean; bytes?: number }) {
  const created: any[] = [];
  const s: any = Object.create(MailService.prototype);
  s.logger = { warn: () => undefined, error: () => undefined };
  s.prisma = { driveFile: { create: async ({ data }: any) => { created.push(data); return { id: `f${created.length}` }; } } };
  s.storage = { putPrivateObject: async () => (opts.put === undefined ? 'drive/u1/k.pdf' : opts.put) };
  s.download = async () => (opts.fetchOk === false ? null : Buffer.alloc(opts.bytes ?? 1000));
  return { s, created };
}
const mail: any = { emailId: 'e1', attachments: [{ id: 'a1', filename: 'contract.pdf', contentType: 'application/pdf' }] };
const listed = [{ id: 'a1', filename: 'contract.pdf', contentType: 'application/pdf', size: 1000, downloadUrl: 'https://r/x' }];

describe('filing', () => {
  const providerWith = (list: unknown) => {
    jest.resetModules();
    jest.doMock('./messaging-provider', () => ({ createMessagingProvider: () => ({ name: 'test', fetchReceivedAttachments: async () => list }) }));
  };
  afterEach(() => jest.dontMock('./messaging-provider'));

  it('a fetched attachment becomes a Drive file attached to the thread, and its bytes are charged', async () => {
    providerWith(listed);
    const { MailService: M } = require('./mail.service');
    const { s, created } = svc({ list: listed });
    Object.setPrototypeOf(s, M.prototype);
    const out = await s.fileInboundAttachments('u1', 't1', mail, 10_000_000);
    expect(out).toEqual({ bytes: 1000, note: '' });
    expect(created[0]).toMatchObject({ ownerId: 'u1', name: 'contract.pdf', mimeType: 'application/pdf', sizeBytes: 1000, storageKey: 'drive/u1/k.pdf', attachedType: 'mail', attachedId: 't1' });
  });

  it('one that does not fit the mailbox is named as missing, not dropped in silence', async () => {
    providerWith(listed);
    const { MailService: M } = require('./mail.service');
    const { s, created } = svc({ list: listed });
    Object.setPrototypeOf(s, M.prototype);
    const out = await s.fileInboundAttachments('u1', 't1', mail, 500);
    expect(created).toEqual([]);
    expect(out.bytes).toBe(0);
    expect(out.note).toMatch(/contract\.pdf/);
    expect(out.note).toMatch(/could not be saved/);
  });

  it('a provider that cannot be reached says so under the body', async () => {
    providerWith(null);
    const { MailService: M } = require('./mail.service');
    const { s } = svc({ list: null });
    Object.setPrototypeOf(s, M.prototype);
    const out = await s.fileInboundAttachments('u1', 't1', mail, 10_000_000);
    expect(out.note).toMatch(/contract\.pdf/);
    expect(out.note).toMatch(/could not be saved/);
  });

  it('a message with no attachments costs nothing and says nothing', async () => {
    const { s } = svc({ list: [] });
    expect(await s.fileInboundAttachments('u1', 't1', { emailId: 'e1', attachments: [] }, 1)).toEqual({ bytes: 0, note: '' });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { MailService } from './mail.service';

/**
 * ── MEDICAL MAIL IS ITS OWN DOOR (owner, 16 Sep) ─────────────────────────────
 *
 * "The existing Together City Mail and the Medical system must remain
 * clearly separated. Do not mix the two inboxes." The inbound webhook is one
 * door; what it does with a medical address is hand it to Medical Mail and
 * write nothing here — and an ordinary address never reaches Medical Mail,
 * however medical the message reads (it is HINTED, never moved: §46, §8).
 */
function harness() {
  const rows: any[] = [];
  const medical: any[] = [];
  const hints: any[] = [];
  let seq = 0;
  const prisma: any = {
    mailMessage: {
      create: async ({ data }: any) => { const row = { id: `m${++seq}`, createdAt: new Date(), ...data }; rows.push(row); return row; },
      findFirst: async () => null,
    },
    user: { findUnique: async ({ where }: any) => (where.handle === 'somen' ? { id: 'u1', name: 'Somen', deletedAt: null } : null) },
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.logger = { warn: () => undefined, error: () => undefined, log: () => undefined };
  svc.ensureAccount = async () => ({ address: 'somen@togethercity.app' });
  svc.inboundBody = async () => 'the body';
  svc.usedBytes = async () => 0;
  svc.resolveInboundThread = async () => 'thread-1';
  svc.threadProject = async () => null;
  svc.subAddressProject = async () => null;
  svc.fileWholeThread = async () => undefined;
  svc.fileInboundAttachments = async () => ({ bytes: 0, note: '' });
  svc.medicalMail = {
    ingest: async (mail: any, addresses: string[]) => { medical.push({ mail, addresses }); return { delivered: new Set(addresses).size, errors: 0 }; },
    hintInbound: async (userId: string, id: string, mail: any, subject: string) => { hints.push({ userId, id, from: mail.from.addr, subject }); },
    hintFor: async () => null,
  };
  return { svc, rows, medical, hints };
}
const payload = (to: string[], over: any = {}) => ({
  type: 'email.received',
  data: { to, from: 'City Hospital <hospital@example.com>', subject: 'Your Blood Test Report', text: 'attached', message_id: `<${Math.random()}@x>`, ...over },
});
const MED = 'medical.somen4821@togethercity.app';

describe('the one webhook, two inboxes', () => {
  it('a medical address goes to Medical Mail and writes nothing in Together City Mail', async () => {
    const { svc, rows, medical } = harness();
    const res = await svc.ingestInbound(payload([MED]));
    expect(res).toEqual({ ok: true, delivered: 1 });
    expect(rows).toHaveLength(0);
    expect(medical).toHaveLength(1);
    expect(medical[0].addresses).toEqual([MED]);
  });

  it('§46 · a shop’s mail to the ordinary address stays in Together City Mail and never reaches Medical Mail', async () => {
    const { svc, rows, medical, hints } = harness();
    const res = await svc.ingestInbound(payload(['somen@togethercity.app'], { from: 'Amazon <amazon@example.com>', subject: 'Your order has shipped' }));
    expect(res).toEqual({ ok: true, delivered: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].folder).toBe('inbox');
    expect(medical).toEqual([]);
    // The hint is asked for on every ordinary arrival; Medical Mail decides
    // whether there is anything to say. Nothing is moved either way.
    expect(hints).toEqual([{ userId: 'u1', id: 'm1', from: 'amazon@example.com', subject: 'Your order has shipped' }]);
  });

  it('a message to both addresses is delivered once to each inbox, never twice to either', async () => {
    const { svc, rows, medical } = harness();
    const res = await svc.ingestInbound(payload(['somen@togethercity.app', MED, MED]));
    expect(res).toEqual({ ok: true, delivered: 2 });
    expect(rows).toHaveLength(1);
    expect(medical[0].addresses).toEqual([MED, MED]); // Medical Mail dedupes by mailbox itself
  });

  it('a medical local part is not a handle: no mailbox lookup, no stray delivery', async () => {
    const { svc, rows } = harness();
    svc.medicalMail = undefined;
    const res = await svc.ingestInbound(payload([MED]));
    expect(res).toEqual({ ok: false, reason: 'no-city-recipient' });
    expect(rows).toHaveLength(0);
  });
});

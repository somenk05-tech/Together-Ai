import { MailService } from './mail.service';

/**
 * A DRAFT IS THE MESSAGE, NOT A SUMMARY OF IT.
 *
 * `SaveDraftSchema` carried five fields — id, to, subject, body, thread —
 * while the composer's message has nine and the row it writes to has a column
 * for every one of them. So: attach three files, blind-copy your accountant,
 * write half a letter inside a project, watch "Draft saved" appear, come back
 * the next morning, and have the words. No files, no Bcc, no Cc, no room.
 *
 * Nothing told anybody, because telling them would have required the endpoint
 * to know what it was dropping, and it did not — the fields never reached it.
 *
 * THE FILES ARE RECORDED AND NOT LINKED, which is the one non-obvious rule
 * here and the reason the last assertion exists. `DriveFile.attachedId` is ONE
 * column, so linking on every autosave tick would tear each file away from
 * wherever it actually lives — a medical record, an earlier conversation —
 * every 1.2 seconds while somebody typed, and a draft that was never sent
 * would leave them torn away for good. A draft holds a list of intentions; the
 * send links them, once, when the message is real.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const FILE_A = '11111111-1111-4111-8111-111111111111';
const FILE_B = '22222222-2222-4222-8222-222222222222';
const GONE   = '33333333-3333-4333-8333-333333333333';

function harness() {
  const rows: any[] = [];
  const linked: any[] = [];
  let seq = 0;
  const matches = (where: any, r: any): boolean => {
    if (where.id && where.id !== r.id) return false;
    if (where.ownerId && where.ownerId !== r.ownerId) return false;
    if (typeof where.folder === 'string' && where.folder !== r.folder) return false;
    return true;
  };
  const prisma: any = {
    mailMessage: {
      create: async ({ data }: any) => {
        const row = {
          id: `m${++seq}`, createdAt: new Date('2026-08-14T09:00:00Z'), starred: false,
          threadId: null, projectId: null, ccAddrs: null, bccAddrs: null,
          attachmentIds: null, failureReason: null, ...data,
        };
        rows.push(row); return row;
      },
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id); Object.assign(r, data); return r;
      },
      findFirst: async ({ where }: any) => rows.find((r) => matches(where, r)) ?? null,
      findMany: async () => [],
      aggregate: async () => ({ _sum: { sizeBytes: 0 } }),
    },
    mailProject: {
      findFirst: async ({ where }: any) =>
        (where.key === 'abg' ? { id: 'p-abg', key: 'abg', name: 'ABG', subAddress: true } : null),
    },
    mailAccount: { findUnique: async () => ({ userId: 'u1', address: 'somen@togethercity.app' }) },
    user: { findUnique: async () => ({ id: 'u1', name: 'Somen', handle: 'somen' }) },
    // Two files this citizen owns. GONE is not here: deleted since it was
    // picked, which a draft outlives all the time.
    driveFile: {
      findMany: async ({ where }: any) => [
        { id: FILE_A, name: 'contract.pdf', mimeType: 'application/pdf', sizeBytes: 1024 },
        { id: FILE_B, name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 12 },
      ].filter((f) => where.id.in.includes(f.id) && where.ownerId === 'u1'),
      updateMany: async (a: any) => { linked.push(a); return { count: 0 }; },
    },
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.ensureAccount = async () => ({ address: 'somen@togethercity.app' });
  return { svc, rows, linked };
}

const base = { to: 'alice@togethercity.app', subject: 'hi', body: 'half a letter' };

describe('what a draft keeps', () => {
  it('records the copy lists, the files and the room', async () => {
    const { svc, rows } = harness();
    const d = await svc.saveDraft('u1', {
      ...base,
      cc: ['bob@togethercity.app'], bcc: ['accountant@example.com'],
      attachmentFileIds: [FILE_A, FILE_B], projectKey: 'abg',
    });

    expect(rows[0].ccAddrs).toBe('bob@togethercity.app');
    expect(rows[0].bccAddrs).toBe('accountant@example.com');
    expect(JSON.parse(rows[0].attachmentIds)).toEqual([FILE_A, FILE_B]);
    expect(rows[0].projectId).toBe('p-abg');
    // ...and it says so on the way back out, or the composer cannot redraw it.
    expect(d.ccAddrs).toBe('bob@togethercity.app');
    expect(d.bccAddrs).toBe('accountant@example.com');
    expect(d.projectId).toBe('p-abg');
  });

  it('hands the files back named and in the order they were picked', async () => {
    const { svc } = harness();
    const d = await svc.saveDraft('u1', { ...base, attachmentFileIds: [FILE_B, FILE_A] });
    expect(d.attachments.map((f: any) => f.name)).toEqual(['notes.txt', 'contract.pdf']);
    expect(d.attachments[1]).toEqual({ id: FILE_A, name: 'contract.pdf', mimeType: 'application/pdf', sizeBytes: 1024 });
  });

  it('comes back with the files that are still there when one has been deleted', async () => {
    // A draft outlives its attachments often enough that failing on the
    // missing one would be a composer that will not open.
    const { svc } = harness();
    const d = await svc.saveDraft('u1', { ...base, attachmentFileIds: [FILE_A, GONE] });
    expect(d.attachments.map((f: any) => f.id)).toEqual([FILE_A]);
  });

  it('does NOT link the files, because attachedId is one column', async () => {
    // Linking here would tear every file away from wherever it lives, on every
    // autosave tick, for a message that may never be sent.
    const { svc, linked } = harness();
    await svc.saveDraft('u1', { ...base, attachmentFileIds: [FILE_A] });
    expect(linked).toEqual([]);
  });
});

describe('what a draft lets go of', () => {
  it('drops a Bcc that has been taken out of the composer', async () => {
    const { svc, rows } = harness();
    const first = await svc.saveDraft('u1', { ...base, bcc: ['accountant@example.com'] });
    expect(rows[0].bccAddrs).toBe('accountant@example.com');

    await svc.saveDraft('u1', { ...base, id: first.id });
    // Not "kept because it was not mentioned": a draft that holds a recipient
    // the citizen has already removed is the same silence pointed the other
    // way, and this one sends to them.
    expect(rows[0].bccAddrs).toBeNull();
    expect(rows[0].attachmentIds).toBeNull();
  });

  it('does not unfile a draft just because an autosave named no room', async () => {
    // The Unsent folder's composer carries no project key in its URL. That is
    // not somebody saying "take this out of ABG".
    const { svc, rows } = harness();
    const first = await svc.saveDraft('u1', { ...base, projectKey: 'abg' });
    expect(rows[0].projectId).toBe('p-abg');

    await svc.saveDraft('u1', { ...base, id: first.id, body: 'more of it' });
    expect(rows[0].projectId).toBe('p-abg');
  });

  it('saves what was typed even when the room named does not exist', async () => {
    const { svc, rows } = harness();
    const d = await svc.saveDraft('u1', { ...base, projectKey: 'nosuch' });
    expect(rows[0].projectId).toBeNull();
    expect(d.body).toBe('half a letter');
  });
});

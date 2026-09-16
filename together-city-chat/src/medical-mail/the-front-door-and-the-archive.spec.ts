/* eslint-disable @typescript-eslint/no-explicit-any */
import { MedicalMailService } from './medical-mail.service';

/**
 * ── THE FRONT DOOR AND THE ARCHIVE (owner, 16 Sep) ───────────────────────────
 *
 *   MEDICAL EMAIL = the front door · MEDICAL RECORDS = the permanent archive
 *
 * The pipeline on paper: an in-memory table set, a vault that hands back keys,
 * a reader that says what each file is. What is asserted is the owner's §45,
 * §47, §48 and §32 — the email row survives every downstream failure, each
 * attachment is filed on its own, a duplicate is linked not stored, and a
 * file the reader is sure is not medical never becomes a record.
 */
function tables() {
  const store: Record<string, any[]> = {};
  let n = 0;
  const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (k === 'OR') return (v as any[]).some((w) => matches(row, w));
    if (k === 'AND') return (v as any[]).every((w) => matches(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('not' in v) return v.not === null ? row[k] !== null && row[k] !== undefined : row[k] !== v.not;
      if ('in' in v) return (v.in as any[]).includes(row[k]);
      if ('gte' in v) return row[k] >= v.gte;
      return true;
    }
    return row[k] === v;
  });
  const table = (name: string) => {
    store[name] = store[name] ?? [];
    const rows = store[name];
    const include = (row: any, inc: any) => {
      if (!row || !inc) return row;
      const out = { ...row };
      if (inc.attachments) out.attachments = (store.medicalEmailAttachment ?? []).filter((a) => a.emailId === row.id);
      if (inc.email) out.email = (store.medicalEmail ?? []).find((e) => e.id === row.emailId) ?? null;
      return out;
    };
    return {
      findUnique: async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null,
      findFirst: async ({ where, include: inc }: any) => include(rows.find((r) => matches(r, where)) ?? null, inc),
      findMany: async ({ where, include: inc }: any) => rows.filter((r) => matches(r, where ?? {})).map((r) => include(r, inc)),
      create: async ({ data }: any) => { const row = { id: `${name}-${++n}`, createdAt: new Date(), updatedAt: new Date(), receivedAt: new Date(), readAt: null, starred: false, archivedAt: null, deletedAt: null, recordId: null, storageKey: null, documentType: null, error: null, ...data }; rows.push(row); return row; },
      update: async ({ where, data }: any) => { const row = rows.find((r) => matches(r, where)); Object.assign(row, data); return row; },
      updateMany: async ({ where, data }: any) => { const hit = rows.filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
      upsert: async ({ where, update, create }: any) => { const row = rows.find((r) => matches(r, where.userId_pattern ?? where)); if (row) { Object.assign(row, update); return row; } const made = { id: `${name}-${++n}`, createdAt: new Date(), ...create }; rows.push(made); return made; },
      delete: async ({ where }: any) => { const i = rows.findIndex((r) => matches(r, where)); return rows.splice(i, 1)[0]; },
      deleteMany: async ({ where }: any) => { const hit = rows.filter((r) => matches(r, where)); hit.forEach((h) => rows.splice(rows.indexOf(h), 1)); return { count: hit.length }; },
      count: async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
      aggregate: async () => ({ _sum: { sizeBytes: 0 } }),
      groupBy: async () => [],
    };
  };
  return { store, table };
}

function build() {
  const t = tables();
  const notifications: any[] = [];
  const events: any[] = [];
  const put: string[] = [];
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => (where.handle && where.handle !== 'somen' ? null : { id: 'u1', handle: 'somen', deletedAt: null }) },
    medicalRecord: { findFirst: async ({ where }: any) => ({ id: where.id, title: `Record ${where.id}`, recordedOn: new Date('2026-09-16T12:00:00Z') }), findMany: async () => [] },
    medicalMailbox: t.table('medicalMailbox'), medicalEmail: t.table('medicalEmail'), medicalEmailAttachment: t.table('medicalEmailAttachment'),
    medicalSenderRule: t.table('medicalSenderRule'), medicalMailHint: t.table('medicalMailHint'), medicalTimelineEvent: t.table('medicalTimelineEvent'), medicalAuditEvent: t.table('medicalAuditEvent'),
  };
  let recs = 0;
  const reader = (name: string) => (/blood/.test(name) ? { kind: 'blood-test', isMedical: true } : /presc/.test(name) ? { kind: 'prescription', isMedical: true } : /invoice/.test(name) ? { kind: 'hospital', isMedical: true } : { kind: 'unsorted', isMedical: false });
  const medical: any = {
    storageUsage: async () => ({ remainingBytes: 1 << 30 }),
    fileDocument: async (_u: string, dto: any, o: any) => {
      const r = reader(dto.name);
      if (o.requireMedical && !r.isMedical && r.kind === 'unsorted') return { recordId: null, kind: 'unsorted', sorted: false, held: false, bloodTestId: null, note: 'not medical', reason: 'not-medical', reading: { isMedical: false } };
      const id = `rec-${++recs}`;
      return { recordId: id, kind: r.kind, sorted: true, held: false, bloodTestId: r.kind === 'blood-test' ? 'bt-1' : null, note: 'filed', reason: 'filed', reading: { isMedical: true } };
    },
    tagRecord: async () => ({}),
    recordFileUrl: async () => ({ url: 'https://signed', expiresInSec: 300 }),
  };
  const storage: any = { putPrivateObject: async (_p: string, u: string, _b: Buffer, _c: string, ext: string) => { const k = `health/${u}/${put.length + 1}.${ext}`; put.push(k); return k; }, presignHealthDownload: async () => 'https://signed' };
  const svc = new MedicalMailService(prisma, storage, medical, { create: async (n: any) => { notifications.push(n); } } as any, { track: (name: string, _u: any, props: any) => events.push({ name, props }) } as any, { timezoneFor: async () => 'Asia/Kolkata', dayIn: (_tz: string, d: Date) => d.toISOString().slice(0, 10) } as any);
  return { svc, t, notifications, events, put, prisma };
}

const pdf = (label: string) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(label)]);
const fetchOf = (files: Record<string, Buffer>, fail: string[] = []) => ({
  body: async () => 'Dear patient, your report is attached.',
  attachments: async () => Object.keys(files).map((name, i) => ({ id: `a${i}`, filename: name, contentType: 'application/pdf', size: files[name].length, downloadUrl: `https://r/${name}` })),
  download: async (url: string) => { const name = url.split('/').pop()!; return fail.includes(name) ? null : files[name]; },
});
const ADDR = 'medical.somen4821@togethercity.app';
const mailOf = (over: any = {}) => ({
  to: [ADDR], from: { addr: 'hospital@example.com', name: 'City Hospital' },
  subject: 'Your Blood Test Report', text: '', providerMessageId: `<m${Math.random()}@x>`, emailId: 'e1',
  attachments: [{ id: 'a0', filename: 'blood_report.pdf', contentType: 'application/pdf' }], inReplyTo: [], authenticated: true, ...over,
});
async function withBox(b: ReturnType<typeof build>) {
  return b.prisma.medicalMailbox.create({ data: { userId: 'u1', address: ADDR, status: 'active', processDocuments: true, aiAnalysis: true, autoLink: true, classifyEmails: true, notify: true } });
}

describe('§45 · a blood test report arrives', () => {
  it('lands in Medical Mail, its file stored once, filed, linked, on the timeline, and the citizen is told', async () => {
    const b = build(); await withBox(b);
    const out = await b.svc.ingest(mailOf() as any, [ADDR], fetchOf({ 'blood_report.pdf': pdf('cbc') }) as any);
    expect(out).toEqual({ delivered: 1, errors: 0 });
    const [email] = b.t.store.medicalEmail;
    expect(email.classification).toBe('medical');
    expect(email.category).toBe('blood-test');
    const [att] = b.t.store.medicalEmailAttachment;
    expect(att).toMatchObject({ status: 'analyzed', recordId: 'rec-1', documentType: 'blood-test', storageKey: 'health/u1/1.pdf' });
    expect(att.sha256).toHaveLength(64);
    expect(b.put).toEqual(['health/u1/1.pdf']);
    // the email → the record, the record → the email
    expect(b.t.store.medicalTimelineEvent.map((e) => e.eventType).sort()).toEqual(['email_received', 'panel_read']);
    expect(b.t.store.medicalTimelineEvent.find((e) => e.eventType === 'panel_read')).toMatchObject({ recordId: 'rec-1', emailId: email.id, source: 'medical-mail' });
    // told, and told nothing: the push body names no subject
    expect(b.notifications).toHaveLength(1);
    expect(b.notifications[0]).toMatchObject({ kind: 'medical_mail', title: 'Medical Mail', body: '1 new medical message', href: `/medical/mail/${email.id}` });
    expect(JSON.stringify(b.notifications[0])).not.toMatch(/Blood Test/);
    // analytics carries names and a category, never the subject or the file
    expect(b.events.map((e) => e.name)).toEqual(['medical_email_received', 'medical_document_stored', 'medical_record_created']);
    expect(JSON.stringify(b.events)).not.toMatch(/blood_report|Blood Test Report|City Hospital/);
    // audited: received, stored, linked
    expect(b.t.store.medicalAuditEvent.map((a) => a.action)).toEqual(['email_received', 'attachment_stored', 'record_linked']);
  });

  it('a provider retry is one email, not two', async () => {
    const b = build(); await withBox(b);
    const m = mailOf({ attachments: [] });
    await b.svc.ingest(m as any, m.to, fetchOf({}) as any);
    await b.svc.ingest(m as any, m.to, fetchOf({}) as any);
    expect(b.t.store.medicalEmail).toHaveLength(1);
  });

  it('an unknown citizen, the wrong digits and a paused mailbox take nothing', async () => {
    const b = build();
    expect(await b.svc.ingest(mailOf() as any, ['medical.nobody4821@togethercity.app'], fetchOf({}) as any)).toEqual({ delivered: 0, errors: 0 });
    const box = await withBox(b);
    expect(await b.svc.ingest(mailOf() as any, ['medical.somen0000@togethercity.app'], fetchOf({}) as any)).toEqual({ delivered: 0, errors: 0 });
    // the digits are the key: a guess at somebody's handle is not their address
    expect(b.t.store.medicalEmail).toHaveLength(0);
    await b.prisma.medicalMailbox.update({ where: { id: box.id }, data: { status: 'paused' } });
    expect(await b.svc.ingest(mailOf() as any, [ADDR], fetchOf({}) as any)).toEqual({ delivered: 0, errors: 0 });
    expect(b.t.store.medicalEmail).toHaveLength(0);
  });
});

describe('the address follows the handle and keeps its number', () => {
  it('a renamed citizen keeps the digits; the old spelling stops working', async () => {
    const b = build(); await withBox(b);
    b.prisma.user.findUnique = async ({ where }: any) => (where.handle && where.handle !== 'somen_k' ? null : { id: 'u1', handle: 'somen_k', deletedAt: null });
    const box = await b.svc.ensureMailbox('u1');
    expect(box.address).toBe('medical.somen_k4821@togethercity.app');
    expect(await b.svc.ingest(mailOf({ attachments: [] }) as any, ['medical.somen_k4821@togethercity.app'], fetchOf({}) as any)).toEqual({ delivered: 1, errors: 0 });
    expect(await b.svc.ingest(mailOf({ attachments: [] }) as any, [ADDR], fetchOf({}) as any)).toEqual({ delivered: 0, errors: 0 });
  });
});

describe('§39 · the email never disappears because one step failed', () => {
  it('a download that fails leaves the email and a row that says so', async () => {
    const b = build(); await withBox(b);
    await b.svc.ingest(mailOf() as any, [ADDR], fetchOf({ 'blood_report.pdf': pdf('x') }, ['blood_report.pdf']) as any);
    expect(b.t.store.medicalEmail).toHaveLength(1);
    expect(b.t.store.medicalEmailAttachment[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/could not be downloaded/) });
    expect(b.put).toEqual([]);
  });
  it('a file that is not what it claims is refused at the gate, and the email stays', async () => {
    const b = build(); await withBox(b);
    await b.svc.ingest(mailOf() as any, [ADDR], fetchOf({ 'blood_report.pdf': Buffer.from('MZ this is not a pdf') }) as any);
    expect(b.t.store.medicalEmail).toHaveLength(1);
    expect(b.t.store.medicalEmailAttachment[0].status).toBe('failed');
    expect(b.put).toEqual([]);
  });
  it('a reader that throws leaves the file stored and says it was not filed', async () => {
    const b = build(); await withBox(b);
    (b.svc as any).medical.fileDocument = async () => { throw new Error('model down'); };
    await b.svc.ingest(mailOf() as any, [ADDR], fetchOf({ 'blood_report.pdf': pdf('x') }) as any);
    expect(b.t.store.medicalEmailAttachment[0]).toMatchObject({ status: 'stored', storageKey: 'health/u1/1.pdf', recordId: null, error: expect.stringMatching(/save it to Health Records yourself/) });
  });
});

describe('§47 · a doctor writes about dinner', () => {
  it('lands here by the sender rule and makes no record — even with a holiday PDF attached', async () => {
    const b = build(); await withBox(b);
    await b.prisma.medicalSenderRule.create({ data: { userId: 'u1', pattern: 'doctor@example.com', kind: 'address', rule: 'medical' } });
    const m = mailOf({ from: { addr: 'doctor@example.com', name: 'Dr. Rao' }, subject: 'Dinner plans', attachments: [{ id: 'a0', filename: 'beach.pdf', contentType: 'application/pdf' }] });
    await b.svc.ingest(m as any, m.to, fetchOf({ 'beach.pdf': pdf('sea') }) as any);
    expect(b.t.store.medicalEmail[0].classification).toBe('medical');
    expect(b.t.store.medicalEmailAttachment[0]).toMatchObject({ status: 'needs_review', recordId: null, storageKey: 'health/u1/1.pdf' });
    expect(b.t.store.medicalTimelineEvent.map((e) => e.eventType)).toEqual(['email_received']);
    expect(b.events.map((e) => e.name)).not.toContain('medical_record_created');
  });
});

describe('§48 · three attachments, three folders, one email', () => {
  it('stores all three, files each on its own, links all to the same email', async () => {
    const b = build(); await withBox(b);
    const m = mailOf({ subject: 'Your visit', attachments: [
      { id: 'a0', filename: 'blood_test.pdf', contentType: 'application/pdf' },
      { id: 'a1', filename: 'prescription.pdf', contentType: 'application/pdf' },
      { id: 'a2', filename: 'invoice.pdf', contentType: 'application/pdf' },
    ] });
    await b.svc.ingest(m as any, m.to, fetchOf({ 'blood_test.pdf': pdf('a'), 'prescription.pdf': pdf('b'), 'invoice.pdf': pdf('c') }) as any);
    const rows = b.t.store.medicalEmailAttachment;
    expect(rows.map((r) => [r.filename, r.documentType, r.status])).toEqual([
      ['blood_test.pdf', 'blood-test', 'analyzed'], ['prescription.pdf', 'prescription', 'stored'], ['invoice.pdf', 'hospital', 'stored'],
    ]);
    expect(new Set(rows.map((r) => r.emailId)).size).toBe(1);
    expect(new Set(rows.map((r) => r.recordId)).size).toBe(3);
    expect(b.put).toHaveLength(3);
  });
});

describe('§32 · the same PDF twice', () => {
  it('is stored once; the second email links the first record', async () => {
    const b = build(); await withBox(b);
    const same = pdf('identical');
    await b.svc.ingest(mailOf() as any, [ADDR], fetchOf({ 'blood_report.pdf': same }) as any);
    await b.svc.ingest(mailOf({ subject: 'Resending your report' }) as any, [ADDR], fetchOf({ 'blood_report.pdf': same }) as any);
    const [first, second] = b.t.store.medicalEmailAttachment;
    expect(b.put).toHaveLength(1);
    expect(second).toMatchObject({ status: 'duplicate', recordId: first.recordId, storageKey: null, sha256: first.sha256 });
    expect(b.t.store.medicalEmail).toHaveLength(2);
    expect(second.emailId).not.toBe(first.emailId);
  });
});

describe('the citizen’s switches', () => {
  it('with document processing off, files are stored and held, never read', async () => {
    const b = build(); const box = await withBox(b);
    await b.prisma.medicalMailbox.update({ where: { id: box.id }, data: { processDocuments: false } });
    await b.svc.ingest(mailOf() as any, [ADDR], fetchOf({ 'blood_report.pdf': pdf('x') }) as any);
    expect(b.t.store.medicalEmailAttachment[0]).toMatchObject({ status: 'needs_review', recordId: null });
  });
  it('with notifications off, nothing is pushed', async () => {
    const b = build(); const box = await withBox(b);
    await b.prisma.medicalMailbox.update({ where: { id: box.id }, data: { notify: false } });
    await b.svc.ingest(mailOf({ attachments: [] }) as any, [ADDR], fetchOf({}) as any);
    expect(b.notifications).toEqual([]);
  });
  it('"Save to Health Records" files a held file; "Move to Personal" hands the text to Together City Mail', async () => {
    const b = build(); const box = await withBox(b);
    await b.prisma.medicalMailbox.update({ where: { id: box.id }, data: { processDocuments: false } });
    b.prisma.user.findUnique = async () => ({ id: 'u1', deletedAt: null, handle: 'somen', name: 'Somen' });
    b.prisma.mailMessage = { create: async ({ data }: any) => ({ id: 'mm1', ...data }) };
    await b.svc.ingest(mailOf() as any, [ADDR], fetchOf({ 'blood_report.pdf': pdf('x') }) as any);
    const email = b.t.store.medicalEmail[0];
    const att = b.t.store.medicalEmailAttachment[0];
    expect(att.recordId).toBeNull();
    const after = await b.svc.saveAttachment('u1', email.id, att.id);
    expect(after.attachments[0].recordId).toBe('rec-1');
    const moved = await b.svc.moveToMail('u1', email.id, 'personal');
    expect(moved).toEqual({ mailMessageId: 'mm1' });
    expect(email.deletedAt).not.toBeNull();
    expect(b.t.store.medicalSenderRule[0]).toMatchObject({ pattern: 'someone@example.com'.replace('someone', 'hospital'), rule: 'personal' });
  });
});

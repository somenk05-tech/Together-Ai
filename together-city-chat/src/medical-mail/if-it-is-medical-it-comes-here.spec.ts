import { classify, explain, ruleFor } from './classify';
import { gateAttachment, resolveMime } from './attachment-gate';
import { medicalRecipient, mintMedicalAddress, MEDICAL_CATEGORIES } from './medical-mail.constants';

/**
 * ── IF IT IS MEDICAL, IT COMES HERE (owner, 16 Sep) ──────────────────────────
 *
 * "A user should be able to give this address to their doctor, hospital,
 * lab, pharmacy, insurance provider and know: if it is medical, it comes
 * here." The owner's four tests (§45–48), on paper, against the pure halves:
 * the address, the classifier, the attachment gate.
 */
const none = { rules: [], authenticated: null as boolean | null, attachments: [] as Array<{ filename: string; contentType: string }> };

describe('the address', () => {
  it('is medical.<20 hex>@togethercity.app — opaque, never the handle', () => {
    const a = mintMedicalAddress();
    expect(a).toMatch(/^medical\.[a-f0-9]{20}@togethercity\.app$/);
    expect(mintMedicalAddress()).not.toBe(a);
  });
  it('is recognised on the wire, case and legacy domain notwithstanding', () => {
    expect(medicalRecipient('Medical.0123456789abcdef0123@TogetherCity.app')).toBe('medical.0123456789abcdef0123@togethercity.app');
    expect(medicalRecipient('medical.0123456789abcdef0123@togethercity.tech')).toBe('medical.0123456789abcdef0123@togethercity.app');
    expect(medicalRecipient('medical.0123456789abcdef0123+lab@togethercity.app')).toBe('medical.0123456789abcdef0123@togethercity.app');
  });
  it('is not a handle, a project tag, or anybody off-domain', () => {
    expect(medicalRecipient('somen@togethercity.app')).toBeNull();
    expect(medicalRecipient('somen+medical@togethercity.app')).toBeNull();
    expect(medicalRecipient('medical.short@togethercity.app')).toBeNull();
    expect(medicalRecipient('medical.0123456789abcdef0123@gmail.com')).toBeNull();
  });
});

describe('§45 · a hospital sends a blood test report', () => {
  const v = classify({ ...none, from: { addr: 'reports@apollohospitals.com', name: 'Apollo Hospitals' }, subject: 'Your Blood Test Report', text: 'Dear patient, your report is attached.', attachments: [{ filename: 'blood_report.pdf', contentType: 'application/pdf' }] });
  it('is medical, and says why in words', () => {
    expect(v.classification).toBe('medical');
    expect(v.category).toBe('blood-test');
    expect(explain(v)).toMatch(/^Classified as Blood test: /);
    expect(v.reasons.join(' ')).toMatch(/apollohospitals\.com/);
    expect(v.reasons.join(' ')).toMatch(/blood_report\.pdf/);
  });
  it('is medical from an unknown hospital too — the words carry it', () => {
    const u = classify({ ...none, from: { addr: 'hospital@example.com', name: 'City Hospital' }, subject: 'Your Blood Test Report', text: '', attachments: [{ filename: 'blood_report.pdf', contentType: 'application/pdf' }] });
    expect(u.classification).toBe('medical');
    expect(u.category).toBe('blood-test');
  });
});

describe('§46 · a shop ships an order', () => {
  it('is not medical, however it is addressed', () => {
    const v = classify({ ...none, from: { addr: 'amazon@example.com', name: 'Amazon' }, subject: 'Your order has shipped', text: 'Your order has shipped. Tracking number 123.' });
    expect(['personal', 'unknown']).toContain(v.classification);
    expect(v.classification).not.toBe('medical');
  });
  it('a streaming bill from a known consumer domain is personal', () => {
    const v = classify({ ...none, from: { addr: 'netflix@email.netflix.com', name: 'Netflix' }, subject: 'Your monthly subscription', text: 'Your monthly subscription has renewed. Unsubscribe.' });
    expect(v.classification).toBe('personal');
  });
});

describe('§47 · a doctor writes about dinner', () => {
  it('a sender rule puts it in Medical Mail; nothing in it reads as a record', () => {
    const rules = [{ pattern: 'doctor@example.com', kind: 'address' as const, rule: 'medical' as const }];
    const v = classify({ ...none, rules, from: { addr: 'doctor@example.com', name: 'Dr. Rao' }, subject: 'Dinner plans', text: 'Are we still on for Friday?' });
    expect(v.classification).toBe('medical');
    expect(v.ruled).toBe('medical');
  });
  it('without a rule, a doctor’s name alone is not enough to be sure', () => {
    const v = classify({ ...none, from: { addr: 'doctor@example.com', name: 'Dr. Rao' }, subject: 'Dinner plans', text: 'Are we still on for Friday?' });
    expect(v.classification).not.toBe('medical');
  });
  it('the citizen’s "always personal" outranks every other sign', () => {
    const rules = [{ pattern: 'apollohospitals.com', kind: 'domain' as const, rule: 'personal' as const }];
    const v = classify({ ...none, rules, from: { addr: 'reports@apollohospitals.com', name: 'Apollo' }, subject: 'Your Blood Test Report', text: '' });
    expect(v.classification).toBe('personal');
    expect(v.ruled).toBe('personal');
  });
  it('a domain rule covers its subdomains', () => {
    const rules = [{ pattern: 'apollohospitals.com', kind: 'domain' as const, rule: 'medical' as const }];
    expect(ruleFor('noreply@mail.apollohospitals.com', rules)?.pattern).toBe('apollohospitals.com');
    expect(ruleFor('noreply@notapollohospitals.com', rules)).toBeNull();
  });
});

describe('§48 · three attachments, three kinds', () => {
  it('each file speaks for itself in the reasons; the email takes the strongest', () => {
    const v = classify({ ...none, from: { addr: 'billing@example.com', name: 'City Hospital' }, subject: 'Your visit on 12 Sep', text: 'Please find your documents attached.',
      attachments: [
        { filename: 'blood_test.pdf', contentType: 'application/pdf' },
        { filename: 'prescription.pdf', contentType: 'application/pdf' },
        { filename: 'invoice.pdf', contentType: 'application/pdf' },
      ] });
    expect(v.classification).toBe('medical');
    expect(v.reasons.join(' ')).toMatch(/blood_test\.pdf looks like a lab report/);
    expect(v.reasons.join(' ')).toMatch(/prescription\.pdf looks like a prescription/);
    expect(v.reasons.join(' ')).toMatch(/invoice\.pdf is named as a bill/);
  });
  it('what the vault reader said outranks the subject line', () => {
    const v = classify({ ...none, from: { addr: 'me@gmail.com', name: 'Somen' }, subject: 'fwd', text: '', attachments: [{ filename: 'scan0001.pdf', contentType: 'application/pdf' }],
      documents: [{ filename: 'scan0001.pdf', isMedical: true, kind: 'blood-test', sure: true }] });
    expect(v.classification).toBe('medical');
    expect(v.category).toBe('blood-test');
  });
});

describe('what is held rather than trusted (§40)', () => {
  it('a sender that failed DMARC is never more than likely-medical', () => {
    const v = classify({ ...none, authenticated: false, from: { addr: 'reports@apollohospitals.com', name: 'Apollo' }, subject: 'Your Blood Test Report', text: '' });
    expect(v.classification).toBe('likely-medical');
    expect(v.reasons.join(' ')).toMatch(/could not be verified/);
  });
  it('every category the classifier can name is one the page knows', () => {
    const v = classify({ ...none, from: { addr: 'claims@starhealth.in', name: 'Star Health' }, subject: 'Cashless pre-authorisation approved', text: '' });
    expect(MEDICAL_CATEGORIES).toContain(v.category);
    expect(v.category).toBe('insurance');
  });
});

describe('the attachment gate (§24)', () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(100, 1)]);
  it('stores a PDF that is a PDF', () => {
    expect(gateAttachment('report.pdf', 'application/pdf', pdf, 1 << 20)).toEqual({ ok: true, mimeType: 'application/pdf', ext: 'pdf' });
  });
  it('refuses a script wearing a PDF’s name', () => {
    expect(gateAttachment('report.pdf', 'application/pdf', Buffer.from('#!/bin/sh\nrm -rf /'), 1 << 20)).toMatchObject({ ok: false });
    expect(gateAttachment('report.pdf.exe', 'application/pdf', pdf, 1 << 20)).toMatchObject({ ok: false });
    expect(gateAttachment('report.html', 'text/html', Buffer.from('<script>'), 1 << 20)).toMatchObject({ ok: false });
  });
  it('refuses a PDF that carries JavaScript', () => {
    const bad = Buffer.from('%PDF-1.4\n1 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj');
    expect(gateAttachment('report.pdf', 'application/pdf', bad, 1 << 20)).toMatchObject({ ok: false, reason: expect.stringMatching(/script/) });
  });
  it('reads the type off the name when the sender’s client declared nothing', () => {
    expect(resolveMime('application/octet-stream', 'scan.JPG')).toBe('image/jpeg');
    expect(gateAttachment('scan.jpg', 'application/octet-stream', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 1 << 20)).toMatchObject({ ok: true, mimeType: 'image/jpeg' });
  });
  it('refuses what is empty, oversized, or of a type the vault does not hold', () => {
    expect(gateAttachment('a.pdf', 'application/pdf', Buffer.alloc(0), 10)).toMatchObject({ ok: false });
    expect(gateAttachment('a.pdf', 'application/pdf', pdf, 10)).toMatchObject({ ok: false, reason: expect.stringMatching(/Over/) });
    expect(gateAttachment('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK'), 1 << 20)).toMatchObject({ ok: false, reason: expect.stringMatching(/Unsupported/) });
  });
});

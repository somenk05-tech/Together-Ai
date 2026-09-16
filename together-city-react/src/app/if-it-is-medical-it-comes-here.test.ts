import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { HUBS } from '@/config/hubs';
import { CATEGORY_CHIPS, RECORD_KIND_LABEL } from '@/features/medical/mail/api';

const SRC = join(__dirname, '..');
const code = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * ── IF IT IS MEDICAL, IT COMES HERE (owner, 16 Sep) ──────────────────────────
 *
 * The web half of Medical Mail: a first-class room on the Medical rail, its
 * own routes, its own stylesheet, the hint on ordinary mail, the source line
 * on Health Records — and a separation the owner asked for in as many words:
 * "Do not mix the two inboxes."
 */
describe('Medical Mail on the Medical rail', () => {
  it('is room 02, between the vault and its analysis', () => {
    const it2 = HUBS.medical.items[1];
    expect(it2).toMatchObject({ index: '02', path: '/medical/mail', label: 'Medical Mail', sub: 'All medical emails & attachments' });
    expect(HUBS.medical.items.map((i) => i.index)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
  });

  it('has its four screens, all behind sign-in', () => {
    const r = code('app/router.tsx');
    for (const p of ['/medical/mail', '/medical/mail/settings', '/medical/mail/timeline', '/medical/mail/:id']) {
      expect(r).toMatch(new RegExp(`path: '${p.replace(/[/:]/g, (c) => `\\${c}`)}', element: <RequireAuth>`));
    }
  });

  it('is drawn by its own sheet, imported once, and writes no colour of its own', () => {
    expect(code('main.tsx')).toMatch(/import '\.\/styles\/medical-mail\.css'/);
    const css = code('styles/medical-mail.css');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsl\(/i);
    for (const f of ['MedicalMail', 'MedicalMailMessage', 'MedicalMailSettings', 'MedicalMailTimeline', 'MedicalHint', 'MedicalMailConsent']) {
      expect(code(`features/medical/mail/${f}.tsx`)).not.toMatch(/style=\{\{/);
    }
  });

  it('never composes: the inbox receives, and nothing on it sends', () => {
    const page = code('features/medical/mail/MedicalMail.tsx') + code('features/medical/mail/MedicalMailMessage.tsx');
    expect(page).not.toMatch(/Compose|Reply|Forward|\/mail\/compose/);
  });
});

describe('the two inboxes stay apart', () => {
  it('an ordinary message that looks medical is offered the move, never moved', () => {
    const view = code('features/mail/pages/MessageView.tsx');
    expect(view).toMatch(/m\.medicalHint && m\.folder === 'inbox' && <MedicalHint/);
    const hint = code('features/medical/mail/MedicalHint.tsx');
    expect(hint).toMatch(/Move to Medical Mail/);
    expect(hint).toMatch(/Not medical/);
    expect(hint).toMatch(/Never from this sender/);
  });

  it('Health Records keeps Medical Mail as a collapsed folder, and every mailed file opens its email', () => {
    const rec = code('features/medical/pages/Records.tsx');
    expect(rec).toMatch(/Source: Medical Mail/);
    expect(rec).toMatch(/key: '__mail', label: 'Medical Mail'/);
    expect(rec).not.toMatch(/From Medical Mail/);
    expect(rec).toMatch(/to=\{`\/medical\/mail\/\$\{r\.sourceEmailId\}`\}/);
  });

  it('the badge is the Medical rail’s and reads only inside the hub', () => {
    const side = code('layouts/Sidebar.tsx');
    expect(side).toMatch(/hub\.key === 'medical' && authed/);
    expect(side).toMatch(/it\.path === '\/medical\/mail' && unreadMedical > 0/);
    expect(code('layouts/Header.tsx')).not.toMatch(/medical/i);
  });

  it('the chips group every category the server can name, and the folder labels match the vault’s', () => {
    const named = new Set(CATEGORY_CHIPS.flatMap((c) => c.categories));
    for (const c of ['doctor', 'hospital', 'laboratory', 'pharmacy', 'insurance', 'appointment', 'prescription', 'diagnostic-report', 'blood-test', 'radiology', 'pathology', 'vaccination', 'medical-bill', 'other-medical']) {
      expect(named.has(c)).toBe(true);
    }
    const records = code('features/medical/pages/Records.tsx');
    for (const [k, label] of Object.entries(RECORD_KIND_LABEL)) {
      expect(records).toContain(`key: '${k}'`);
      expect(records).toContain(label);
    }
    expect(existsSync(join(SRC, 'features/medical/mail/switchRows.ts'))).toBe(true);
  });
});

import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
// The Medical Hub is the source of truth for health data, but the *interpretation*
// logic is the shared, cited clinical engine — so Nutrition, Beauty and Fitness all
// reason from the same evidence base.
import {
  CITATIONS, MARKER_RULES, criticalAlerts, evaluateMarker, flagsFor,
  supplementKit, triggeredConditions, ruleFor,
} from '../nutrition/clinical-engine';
import type { SaveBloodTestDto } from './dto/medical.dto';

const cite = (ids: string[]) => ids.map((id) => CITATIONS[id]).filter(Boolean);

/** Hubs that may read Medical biomarkers, and what each uses them for. */
export const CONSENT_HUBS = [
  { hub: 'nutrition', label: 'Nutrition', reads: 'Personalises meal plans, targets and supplements from your markers.' },
  { hub: 'beauty', label: 'Beauty', reads: 'Tailors skin/hair advice (e.g. vitamin D, ferritin, B12).' },
  { hub: 'fitness', label: 'Fitness', reads: 'Adjusts training load and recovery from iron, glucose and inflammation.' },
] as const;

@Injectable()
export class MedicalService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly financial: FinancialService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDoctors();
  }

  // ─────────────── blood tests (dated panels, with history) ───────────────
  async saveBloodTest(userId: string, dto: SaveBloodTestDto) {
    const test = await this.prisma.medicalBloodTest.create({
      data: {
        userId,
        takenOn: dto.takenOn ? new Date(dto.takenOn) : new Date(),
        lab: dto.lab ?? null,
        biomarkers: {
          create: Object.entries(dto.values)
            .filter(([, v]) => typeof v === 'number')
            .map(([key, value]) => ({ key, value: value as number })),
        },
      },
      include: { biomarkers: true },
    });
    return this.analyze(userId, test.id);
  }

  /** History of panels (newest first) with a compact summary of each. */
  async bloodTests(userId: string) {
    const tests = await this.prisma.medicalBloodTest.findMany({
      where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    return tests.map((t) => {
      const values = Object.fromEntries(t.biomarkers.map((b) => [b.key, b.value]));
      const flags = flagsFor(values);
      const abnormal = Object.entries(flags).filter(([, s]) => s !== 'normal');
      return {
        id: t.id, takenOn: t.takenOn.toISOString().slice(0, 10), lab: t.lab,
        markerCount: t.biomarkers.length,
        flagged: abnormal.map(([key, status]) => ({ key, label: ruleFor(key)?.label ?? key, status })),
        alertCount: criticalAlerts(values).length,
      };
    });
  }

  /** Full cited analysis of one panel + trend vs the previous panel. */
  async analyze(userId: string, testId: string) {
    const test = await this.prisma.medicalBloodTest.findFirst({
      where: { id: testId, userId }, include: { biomarkers: true },
    });
    if (!test) throw new NotFoundException('blood test not found');
    const values = Object.fromEntries(test.biomarkers.map((b) => [b.key, b.value]));
    const crp = values.crp;

    // previous panel for trend arrows
    const prev = await this.prisma.medicalBloodTest.findFirst({
      where: { userId, takenOn: { lt: test.takenOn } },
      orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    const prevValues = prev ? Object.fromEntries(prev.biomarkers.map((b) => [b.key, b.value])) : {};

    const markers = MARKER_RULES.filter((r) => r.key in values).map((rule) => {
      const value = values[rule.key];
      const ev = evaluateMarker(rule, value, crp);
      const before = prevValues[rule.key];
      const trend = typeof before === 'number'
        ? (value > before ? 'up' : value < before ? 'down' : 'flat')
        : null;
      return {
        key: rule.key, label: rule.label, unit: rule.unit, value, range: `${rule.min}–${rule.max}`,
        status: ev.status, advice: ev.advice, caveat: ev.caveat, citations: ev.citations,
        trend, previous: typeof before === 'number' ? before : null,
      };
    });

    const flags = flagsFor(values);
    return {
      testId: test.id, takenOn: test.takenOn.toISOString().slice(0, 10), lab: test.lab,
      markers,
      alerts: criticalAlerts(values),
      conditions: triggeredConditions(flags).map((c) => ({ key: c.key, name: c.name, principles: c.principles, citations: cite(c.citations) })),
      disclaimer: 'Medical Hub is the source of truth for your records. This analysis is educational, grounded in established clinical-nutrition guidance — not a diagnosis. Confirm with your doctor.',
      sharesWith: 'With your consent, Nutrition, Beauty and Fitness read these biomarkers to personalise your plans.',
    };
  }

  /** Latest panel analysed (or empty). */
  async latest(userId: string) {
    const test = await this.prisma.medicalBloodTest.findFirst({
      where: { userId }, orderBy: { takenOn: 'desc' },
    });
    if (!test) return { markers: [], alerts: [], conditions: [], takenOn: null };
    return this.analyze(userId, test.id);
  }

  // ─────────────── per-user supplementation (transparent reasoning) ───────────────
  /**
   * How supplementation is suggested for a single user: take the latest panel →
   * derive flags → the cited engine proposes a goal-matched kit, upgraded by each
   * abnormal marker. We return the full reasoning chain (basis → items with the exact
   * trigger + citation) so the recommendation is explainable, not a black box.
   */
  async supplementPlan(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const goal = pref?.goal ?? 'maintain';

    const latest = await this.prisma.medicalBloodTest.findFirst({
      where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    const values = latest ? Object.fromEntries(latest.biomarkers.map((b) => [b.key, b.value])) : {};
    const flags = flagsFor(values);

    // Human-readable trigger for each flag-driven supplement.
    const triggerFor = (name: string): string => {
      const low = (k: string) => flags[k] === 'low';
      if (name.startsWith('Vitamin D3')) return low('vitd') ? `Low vitamin D (${values.vitd} ng/mL)` : '';
      if (name.startsWith('Vitamin B12')) return low('b12') ? `Low B12 (${values.b12} pg/mL)` : '';
      if (name.startsWith('Folate')) return low('folate') ? `Low folate (${values.folate} ng/mL)` : '';
      if (name.startsWith('Iron')) return (low('ferritin') || low('hb')) ? `Low iron stores (ferritin ${values.ferritin ?? '—'} ng/mL)` : '';
      if (name.startsWith('Omega-3')) return flags.trig === 'high' || flags.ldl === 'high' ? `Raised lipids (LDL ${values.ldl ?? '—'})` : 'General cardiometabolic support';
      return '';
    };
    const foodFirst: Record<string, string> = {
      'Vitamin D3': 'Food-first: oily fish, fortified dairy, 15 min midday sun.',
      'Vitamin B12': 'Food-first: eggs, dairy, fish; essential to supplement if plant-based.',
      'Folate (with B12)': 'Food-first: fresh dark-green vegetables and legumes (heat destroys folate).',
      'Iron + Vitamin C': 'Food-first: lean red meat, liver, legumes + a vitamin-C source; avoid tea/coffee with meals.',
    };

    const kit = supplementKit(goal, flags);
    const items = kit.map((s) => {
      const trigger = triggerFor(s.name) || (goal !== 'maintain' ? `Goal: ${goal === 'lose' ? 'weight loss' : 'muscle gain'}` : 'Everyday baseline');
      const ffKey = Object.keys(foodFirst).find((k) => s.name.startsWith(k));
      return {
        name: s.name, purpose: s.purpose, dose: s.dose, timing: s.timing, priceInr: s.priceInr,
        trigger, foodFirst: ffKey ? foodFirst[ffKey] : null, reference: s.reference ?? null,
        citations: cite(s.citations),
      };
    });

    const abnormal = Object.entries(flags).filter(([, s]) => s !== 'normal');
    return {
      basis: {
        goal,
        hasBloodTest: Boolean(latest),
        takenOn: latest ? latest.takenOn.toISOString().slice(0, 10) : null,
        flags: abnormal.map(([key, status]) => ({ key, label: ruleFor(key)?.label ?? key, status, value: values[key] })),
      },
      items,
      totalInr: items.reduce((sum, i) => sum + i.priceInr, 0),
      safety: 'Suggestions are food-first and consumer-level, grounded in established clinical-nutrition guidance — not a prescription. Confirm doses with your doctor, especially with medication, pregnancy, or a diagnosed condition. Do not take iron if ferritin is high.',
    };
  }

  // ─────────────── medical records ───────────────
  async records(userId: string) {
    const rows = await this.prisma.medicalRecord.findMany({
      where: { userId }, orderBy: { recordedOn: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id, kind: r.kind, title: r.title, detail: r.detail, fileUrl: r.fileUrl,
      recordedOn: r.recordedOn.toISOString().slice(0, 10),
    }));
  }

  async addRecord(userId: string, dto: {
    kind: string; title: string; detail?: string; fileUrl?: string; recordedOn?: string;
  }) {
    await this.prisma.medicalRecord.create({
      data: {
        userId, kind: dto.kind, title: dto.title, detail: dto.detail ?? null, fileUrl: dto.fileUrl ?? null,
        recordedOn: dto.recordedOn ? new Date(dto.recordedOn) : new Date(),
      },
    });
    return this.records(userId);
  }

  // ─────────────── consults (book a doctor → real chat) ───────────────
  async doctors() {
    const rows = await this.prisma.doctor.findMany({
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });
    return rows.map((d) => ({
      id: d.id, name: d.user.name, handle: d.user.handle, specialty: d.specialty,
      hospital: d.hospital, languages: d.languages.split(',').filter(Boolean), rating: d.rating, priceInr: d.priceInr,
    }));
  }

  async consults(userId: string) {
    const rows = await this.prisma.consult.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
      include: { doctor: { include: { user: { select: { name: true } } } } },
    });
    return rows.map((c) => ({
      id: c.id, doctorName: c.doctor.user.name, specialty: c.doctor.specialty,
      reason: c.reason, status: c.status, conversationId: c.conversationId,
      scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /** Booking creates an ACCEPTED DOCTOR_PATIENT connection and opens the chat. */
  async bookConsult(userId: string, dto: { doctorId: string; reason?: string; scheduledAt?: string; method?: 'wallet' | 'card' }) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: dto.doctorId } });
    if (!doctor) throw new NotFoundException('doctor not found');
    const [userOneId, userTwoId] = [userId, doctor.userId].sort();
    await this.prisma.connection.upsert({
      where: { userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType: 'DOCTOR_PATIENT' } },
      update: { status: 'ACCEPTED' },
      create: { userOneId, userTwoId, connectionType: 'DOCTOR_PATIENT', status: 'ACCEPTED', requestedById: userId },
    });
    // Unified payment: charge the consult fee to the one city wallet.
    await this.financial.charge(userId, { hub: 'Medical', category: 'medical', label: `Consult — ${doctor.specialty.split(' ·')[0]}`, amountInr: doctor.priceInr, method: dto.method });
    const conversation = await this.conversations.startDirect(userId, doctor.userId);
    const consult = await this.prisma.consult.create({
      data: {
        userId, doctorId: doctor.id, reason: dto.reason ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null, conversationId: conversation.id,
      },
    });
    return { consultId: consult.id, conversationId: conversation.id };
  }

  // ─────────────── consent core ───────────────
  /** Consent per hub (defaults created granted=true the first time). */
  async consents(userId: string) {
    const existing = await this.prisma.medicalConsent.findMany({ where: { userId } });
    const byHub = new Map(existing.map((c) => [c.hub, c]));
    const out = [];
    for (const h of CONSENT_HUBS) {
      let row = byHub.get(h.hub);
      if (!row) row = await this.prisma.medicalConsent.create({ data: { userId, hub: h.hub, granted: true } });
      out.push({ hub: h.hub, label: h.label, reads: h.reads, granted: row.granted, updatedAt: row.updatedAt.toISOString() });
    }
    return out;
  }

  async setConsent(userId: string, hub: string, granted: boolean) {
    await this.prisma.medicalConsent.upsert({
      where: { userId_hub: { userId, hub } },
      update: { granted },
      create: { userId, hub, granted },
    });
    return this.consents(userId);
  }

  /** The consent gate other hubs call: returns biomarkers only if the hub is permitted. */
  async sharedBiomarkers(userId: string, hub: string) {
    const consent = await this.prisma.medicalConsent.findUnique({ where: { userId_hub: { userId, hub } } });
    const granted = consent ? consent.granted : true; // default-allow same-app hubs until revoked
    if (!granted) throw new ForbiddenException(`${hub} does not have consent to read your medical biomarkers`);
    const latest = await this.prisma.medicalBloodTest.findFirst({
      where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    return {
      hub, granted: true,
      takenOn: latest ? latest.takenOn.toISOString().slice(0, 10) : null,
      values: latest ? Object.fromEntries(latest.biomarkers.map((b) => [b.key, b.value])) : {},
    };
  }

  private async ensureDoctors(): Promise<void> {
    // Demo doctors are fake people (real User accounts). Off by default so the
    // consult list is empty until real providers are added. Set SEED_DEMO=true to restore.
    if (process.env.SEED_DEMO !== 'true') return;
    try {
      if ((await this.prisma.doctor.count()) > 0) return;
    } catch { return; }
    const seed = [
      { handle: 'dr_narang', name: 'Dr. Anjali Narang', specialty: 'General physician · internal medicine', hospital: 'Fortis', languages: 'English,Hindi', rating: 4.9, priceInr: 699 },
      { handle: 'dr_iyer', name: 'Dr. Rohan Iyer', specialty: 'Endocrinology · diabetes & thyroid', hospital: 'Apollo', languages: 'English,Hindi,Tamil', rating: 4.8, priceInr: 1199 },
      { handle: 'dr_khan', name: 'Dr. Sara Khan', specialty: 'Haematology · anaemia & iron', hospital: 'Manipal', languages: 'English,Hindi,Urdu', rating: 4.9, priceInr: 1099 },
    ];
    for (const d of seed) {
      const user = await this.prisma.user.upsert({
        where: { handle: d.handle }, update: {},
        create: { handle: d.handle, name: d.name, passwordHash: randomBytes(24).toString('hex') },
      });
      await this.prisma.doctor.create({
        data: { userId: user.id, specialty: d.specialty, hospital: d.hospital, languages: d.languages, rating: d.rating, priceInr: d.priceInr },
      });
    }
  }
}

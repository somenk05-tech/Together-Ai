import type { HealthFlag } from './gem-remedy-content';
import type { PrismaService } from '../shared/prisma/prisma.service';

/**
 * What we know about a citizen's body, for deciding which observances are safe
 * to suggest.
 *
 * Read straight from the tables rather than through the nutrition or medical
 * services, because the Astrology Zone has no business depending on either
 * module — and a circular module graph is a worse problem than one query.
 *
 * Deliberately conservative in both directions: a flag we cannot establish is
 * simply absent, and everything the citizen HAS told us is honoured. The filter
 * this feeds only ever removes suggestions, so a missed flag means a practice is
 * offered that perhaps should not have been — which is exactly why the surface
 * also carries the disclaimer, and why fasting is the only bodily practice in
 * the set that is gated at all.
 */

/** Conditions text → flags. Matches the vocabulary the nutrition hub already uses. */
const CONDITION_PATTERNS: Array<[RegExp, HealthFlag]> = [
  [/pregnan/i, 'pregnancy'],
  [/breastfeed|lactat|nursing/i, 'breastfeeding'],
  [/diabet|hba1c|insulin/i, 'diabetes'],
  [/eating disorder|anorexi|bulimi/i, 'eating-disorder'],
  [/kidney|renal|ckd|dialysis/i, 'kidney'],
  [/heart|cardiac|angina|arrhythmi/i, 'heart'],
];

export async function healthFlagsFor(prisma: PrismaService, userId: string): Promise<HealthFlag[]> {
  const flags = new Set<HealthFlag>();

  const pref = await prisma.foodPref.findUnique({ where: { userId } }).catch(() => null);
  if (pref) {
    // Conditions live in the same JSON blob the nutrition hub reads them from.
    let conditions = '';
    try {
      const extras = JSON.parse((pref as { extras?: string | null }).extras ?? '{}') as Record<string, unknown>;
      const raw = extras.conditions;
      conditions = Array.isArray(raw) ? raw.join(' ') : String(raw ?? '');
    } catch { conditions = ''; }
    for (const [re, flag] of CONDITION_PATTERNS) if (re.test(conditions)) flags.add(flag);

    if (pref.age != null && pref.age < 18) flags.add('minor');
    const bmi = bmiOf(pref.heightCm, pref.weightKg);
    if (bmi !== null && bmi < 18.5) flags.add('underweight');
  }

  const master = await prisma.masterProfile.findUnique({ where: { userId } }).catch(() => null);
  if (master) {
    const age = ageFrom(master.dateOfBirth);
    if (age !== null && age < 18) flags.add('minor');
    const bmi = bmiOf(master.heightCm, master.weightKg);
    if (bmi !== null && bmi < 18.5) flags.add('underweight');
  }

  return [...flags];
}

function bmiOf(heightCm?: number | null, weightKg?: number | null): number | null {
  if (!heightCm || !weightKg || heightCm < 50) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

function ageFrom(dob?: Date | null): number | null {
  if (!dob) return null;
  const ms = Date.now() - dob.getTime();
  if (ms <= 0) return null;
  return Math.floor(ms / (365.2425 * 24 * 3600 * 1000));
}

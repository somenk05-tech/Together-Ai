import { allergensIn, type AllergenKey } from './allergens';
import { swallowed } from './swallow';
import type { PrismaService } from './prisma/prisma.service';

/**
 * Medical's kind:'allergy' records, read as FOOD allergen terms. (P1-5.)
 *
 * These records are free text — "Penicillin", "nuts", "reacts badly to
 * shellfish", "dust" — and a drug allergy is not a food claim, so they cannot
 * be merged into the food union wholesale. A record joins only when the same
 * matcher the city already trusts (allergensIn) finds a known FOOD family in
 * it; the family key is itself a declared term every consumer resolves.
 * Everything else — drugs, dust, latex — stays in Medical and surfaces on the
 * prescription screen, where it already has a home.
 *
 * NOTHING IS WRITTEN BACK into the master's foodAllergens. The citizen owns
 * that record in Medical; this is a read, unioned at match time, so deleting
 * the record in Medical removes the constraint everywhere the same day.
 *
 * Deliberately a plain function over a Prisma client (the dating-conversations
 * pattern): nutrition, restaurants and the household merge all need it, and
 * none of them should need MedicalModule injected for a read.
 */
export async function medicalFoodAllergenTerms(prisma: PrismaService, userId: string): Promise<string[]> {
  type Row = { title: string | null };
  const rows = await (prisma as unknown as {
    medicalRecord: { findMany(a: unknown): Promise<Row[]> };
  }).medicalRecord
    // unbounded: their allergy records — citizen-scale, and a SAFETY union
    // must be complete; a truncated one un-declares an allergy
    .findMany({ where: { userId, kind: 'allergy' }, select: { title: true } })
    .catch(swallowed('shared.medicalFoodAllergenTerms', [] as Row[], { userId }));
  const out = new Set<AllergenKey>();
  for (const r of rows) for (const k of allergensIn(String(r.title ?? ''))) out.add(k);
  return [...out].sort();
}

import { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http';

/**
 * ── A CHILD, ON THE WIRE ────────────────────────────────────────────────────
 *
 * Four fields, and the shortness is the point. This record exists so that a
 * shelf can know a birthday; it is not a place to keep a child's medical
 * history, and every field somebody might reach for next — weight, allergies,
 * vaccinations, school — is deliberately absent. The Pet District learned the
 * other lesson the hard way and wrote it into its own model: a column that
 * nothing reads is a promise the application has to keep forever.
 *
 * `notes` is the one free-text box, and its contract is written on the form as
 * well as here: NOTHING READS IT. Not the shelf, not the checklist, not a
 * recommendation. A parent who types "eczema, fragrance-free only" has told the
 * city something true, and a store that started filtering a catalogue on that
 * sentence would be making a clinical decision out of a text field.
 *
 * PLAIN ASYNC FUNCTIONS, matching `pets.api.ts` rather than the daybook's
 * react-query hooks: `features/babycare/store.ts` is the single owner of this
 * list, because the shelf, the checklist and the rail all read the same child
 * and must not be able to hold three ages between them.
 */

export const ChildRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** ISO YYYY-MM-DD. Nullable: "we did not ask" and "born today" are different
   *  facts, and only one of them belongs on a shelf. */
  dob: z.string().nullable(),
  notes: z.string(),
  createdAt: z.string(),
});
export type ChildRow = z.infer<typeof ChildRowSchema>;

const ChildListSchema = z.array(ChildRowSchema);

/** What may be written. Partial: a create sends the form, an edit sends the one
 *  box that changed, and the server merges rather than replaces. */
export interface ChildPatch {
  name?: string;
  dob?: string | null;
  notes?: string;
}

export const babycareApi = {
  list: () => apiGet('/babycare/children', ChildListSchema),
  create: (child: ChildPatch) => apiPost('/babycare/children', child, ChildRowSchema),
  update: (id: string, patch: ChildPatch) => apiPatch(`/babycare/children/${id}`, patch, ChildRowSchema),
  remove: (id: string) => apiDelete(`/babycare/children/${id}`, z.object({ removed: z.string() })),
};

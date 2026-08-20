import { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http';
import { mediaApi } from '@/api/media.api';

/**
 * ── A PET, ON THE WIRE ──────────────────────────────────────────────────────
 *
 * The Pet District kept its animals in a zustand store and said so in its own
 * README: a reload started the demo again. This is the other end of that
 * sentence. `features/pets/store.ts` is still what every page reads — the pages
 * did not change — and it now loads from here and writes through to here.
 *
 * PLAIN ASYNC FUNCTIONS RATHER THAN REACT-QUERY HOOKS, which is a departure
 * from `daybook.api.ts` and a deliberate one. The daybook's screens read the
 * server directly. The Pet District's seventeen screens read a store that also
 * holds a thirty-day plan, a grocery list and a cart, all DERIVED from the pet
 * — so a second cache beside that store would be two answers to "how much does
 * this dog weigh", and the plan would be built from whichever one the component
 * happened to ask. One owner, one answer.
 *
 * EVERY FIELD OF THE V1 ROW IS REQUIRED, which is the opposite of the rule
 * `daybook.api.ts` argues for at length — and for a reason that does not
 * contradict it. That rule protects the window where a new web build talks to
 * an API that predates it. There is no API that has `/pets` but not `breed`:
 * the endpoint and these fields shipped in one migration. An older server does
 * not answer this route at all, which is a 404 and a different branch. Fields
 * added AFTER today go in optional, like everywhere else in this directory.
 *
 * WHAT IS NOT HERE: the plan, the grocery list and the cart. They are computed
 * from the pet by `engine/plan.ts` and rebuilt on load, so there is nothing to
 * store and nothing that can disagree with the weight it was calculated from.
 */

/** A photograph, as a browser is allowed to see one: an id to remove it by, its
 *  place in the order, and a LINK THAT EXPIRES. Never the object key — the key
 *  is what proves ownership to the API and has no business here.
 *
 *  `url` is nullable because storage may be unconfigured, and the honest answer
 *  then is "there is a photograph here and we cannot show it to you" rather
 *  than a broken frame. */
export const PetPhotoRowSchema = z.object({
  id: z.string(),
  url: z.string().nullable(),
  position: z.number(),
  createdAt: z.string(),
});
export type PetPhotoRow = z.infer<typeof PetPhotoRowSchema>;

export const PetRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string(),
  breed: z.string(),
  dob: z.string().nullable(),
  ageMonths: z.number().nullable(),
  sex: z.string().nullable(),
  weightKg: z.number().nullable(),
  targetWeightKg: z.number().nullable(),
  bodyCondition: z.string(),
  activity: z.string(),
  housing: z.string(),
  sterilised: z.boolean().nullable(),
  allergies: z.array(z.string()),
  sensitivities: z.array(z.string()),
  restrictions: z.array(z.string()),
  currentFood: z.string(),
  dietStyle: z.string(),
  goal: z.string(),
  healthNotes: z.string(),
  /** The nine boxes a vet asks for. A flat map of strings, STORED AND NEVER
   *  INTERPRETED — nothing on either side of this wire reads a key of it. */
  medical: z.record(z.string()),
  portrait: z.string(),
  photos: z.array(PetPhotoRowSchema),
  createdAt: z.string(),
});
export type PetRow = z.infer<typeof PetRowSchema>;

const PetListSchema = z.array(PetRowSchema);

/** What may be written. Partial by design: a create sends the form, an edit
 *  sends the box that changed, and the server merges rather than replaces — so
 *  the medical card cannot overwrite a weight the profile page just saved. */
export interface PetPatch {
  name?: string;
  species?: string;
  breed?: string;
  dob?: string | null;
  ageMonths?: number | null;
  sex?: string | null;
  weightKg?: number | null;
  targetWeightKg?: number | null;
  bodyCondition?: string;
  activity?: string;
  housing?: string;
  sterilised?: boolean | null;
  allergies?: string[];
  sensitivities?: string[];
  restrictions?: string[];
  currentFood?: string;
  dietStyle?: string;
  goal?: string;
  healthNotes?: string;
  medical?: Record<string, string>;
  portrait?: string;
}

export const petsApi = {
  list: () => apiGet('/pets', PetListSchema),
  create: (pet: PetPatch) => apiPost('/pets', pet, PetRowSchema),
  update: (id: string, patch: PetPatch) => apiPatch(`/pets/${id}`, patch, PetRowSchema),
  remove: (id: string) => apiDelete(`/pets/${id}`, z.object({ removed: z.string() })),

  /**
   * KEEP A PHOTOGRAPH OF THIS ANIMAL. Two round trips behind one function: the
   * bytes go straight from the browser to the private vault, and only then is
   * the key filed against the pet. Both live here so that no caller can do the
   * first without the second and leave an orphan in a bucket.
   */
  async addPhoto(petId: string, file: File): Promise<PetRow> {
    const up = await mediaApi.uploadPet(file);
    return apiPost(`/pets/${petId}/photos`, up, PetRowSchema);
  },
  removePhoto: (photoId: string) => apiDelete(`/pets/photos/${photoId}`, PetRowSchema),
  /** Make one the face. The server renumbers the whole gallery — see its
   *  service — so two photographs can never tie for first. */
  makeMainPhoto: (photoId: string) => apiPost(`/pets/photos/${photoId}/first`, {}, PetRowSchema),
};

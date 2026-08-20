/**
 * ── THE HUB'S STATE, IN ONE STORE ───────────────────────────────────────────
 *
 * Zustand, matching the rest of the application. This file used to open by
 * explaining that a pet profile belongs on the server behind the citizen's
 * account and did not live there yet — a reload started the demo again. It
 * lives there now: `api/pets.api.ts` is the wire, `src/pets` on the NestJS side
 * is the record, and this store loads from it and writes through to it.
 *
 * ── TWO KINDS OF STATE, AND ONLY ONE OF THEM IS SAVED ──────────────────────
 *
 * KEPT: the pet. Name, species, breed, birthday, weight, target weight, body
 * condition, activity, housing, the three lists of the owner's own words, the
 * current food, the diet style, the goal, the medical record and up to five
 * photographs. This is the citizen's record and it is on their account.
 *
 * DERIVED: the thirty-day plan, the grocery list and the cart. All three are
 * computed from the pet by `engine/plan.ts` and `engine/shopping.ts` and are
 * rebuilt on load, so there is nothing to store — and, more to the point,
 * nothing that can drift out of agreement with the weight it was calculated
 * from. A plan saved beside a weight is a plan that can be wrong about it.
 *
 * ── WHY THE PAGES DID NOT CHANGE ───────────────────────────────────────────
 *
 * Seventeen screens read this store. The five actions that touch the pet
 * record became async and server-backed; every other action, and every
 * selector, is what it was. Each of the five writes to local state FIRST so
 * the interface answers immediately, then sends the change, then either
 * replaces the optimistic row with the server's or PUTS THE PREVIOUS STATE
 * BACK and files the reason in `error`. A save that failed must not look like
 * a save that worked — that is the whole reason the rollback is here rather
 * than a hopeful `void petsApi.update(...)`.
 */

import { create } from 'zustand';
import { petsApi, type PetPatch, type PetRow } from '@/api/pets.api';
import type {
  ActivityEntry, CartLine, DayPlan, NutritionPlan, Pet, PetPhoto, ShoppingItem,
  WellnessEntry,
} from './types';
import { buildPlan, regenerateMeal } from './engine/plan';
import { shoppingForHousehold } from './engine/shopping';
import { EMPTY_MEDICAL } from './engine/medical';
import { photoFile } from './engine/photos';

/* ── THE TWO VOCABULARIES, AND THE TWO FUNCTIONS BETWEEN THEM ──────────────
   The wire speaks in loose strings because the API must not fall over when a
   species it has never heard of arrives from a newer build; the hub speaks in
   unions because a `Goal` decides which calorie equation runs. These two
   functions are the only place either assumption is made, and they are private
   to this file — a pet is converted here or nowhere. */

/**
 * WHAT THE SERVER IS NOT ASKED TO REMEMBER ABOUT A PHOTOGRAPH.
 *
 * `fingerprint` is `name:size:mtime` — the original filename and the moment the
 * file was last edited on somebody's own disk — and `removed` is the list of
 * things the scrubber took out of it. Neither is a fact about the picture;
 * both are facts about the citizen's computer, and the city has no business
 * holding either. So they stay here, in memory, keyed by the id the account
 * gave the photograph.
 *
 * What that buys: "you already added that one" keeps working after an upload,
 * and the privacy notice can still say how many photos carried coordinates. It
 * is lost on a reload, and that is the correct amount of loss — after a reload
 * the honest answer to "was this one scrubbed?" is that we no longer know, and
 * the notice says nothing rather than saying no.
 */
const thisSession = new Map<string, { fingerprint: string; name: string; removed: string[] }>();

/** A row from the server, as the hub's own Pet. Anything the row cannot
 *  justify falls back to the same default the blank form uses, so a value the
 *  API adds tomorrow cannot land in a union that has no branch for it. */
function fromRow(row: PetRow): Pet {
  const species: Pet['species'] = row.species === 'cat' ? 'cat' : 'dog';
  const one = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
  return {
    id: row.id,
    name: row.name,
    species,
    breed: row.breed,
    dob: row.dob,
    ageMonths: row.ageMonths,
    sex: row.sex === 'male' || row.sex === 'female' ? row.sex : null,
    weightKg: row.weightKg,
    targetWeightKg: row.targetWeightKg,
    bodyCondition: one(row.bodyCondition, ['under', 'ideal', 'over'] as const, 'ideal'),
    activity: one(row.activity, ['low', 'moderate', 'high'] as const, 'moderate'),
    housing: one(row.housing, ['indoor', 'outdoor', 'both'] as const, 'indoor'),
    sterilised: row.sterilised,
    allergies: row.allergies,
    sensitivities: row.sensitivities,
    restrictions: row.restrictions,
    currentFood: row.currentFood,
    dietStyle: one(row.dietStyle, ['commercial', 'home-cooked', 'mixed'] as const, 'commercial'),
    goal: one(row.goal, ['maintain', 'weight-loss', 'weight-gain', 'growth', 'senior', 'wellness'] as const, 'maintain'),
    healthNotes: row.healthNotes,
    /* Spread over the empty record rather than cast: a column written by an
       older build is missing keys the form renders, and `undefined` in an
       `<input value>` is what turns a controlled field uncontrolled. */
    medical: { ...EMPTY_MEDICAL, ...row.medical },
    photos: row.photos.map((p) => ({
      id: p.id,
      /* Null means storage is unconfigured. The portrait takes over, which is
         a truer answer than a broken frame. */
      url: p.url ?? '',
      bytes: 0,
      addedAt: p.createdAt,
      saved: true,
      /* Empty unless this browser was the one that uploaded it — see
         `thisSession` above, and the notes on PetPhoto in types.ts. */
      name: '',
      fingerprint: '',
      removed: [],
      ...thisSession.get(p.id),
    })).filter((p) => p.url),
    /* `portrait` is the drawn fallback's key and the key is the species —
       see `blank()` on the profile page and `PetPortrait`. A row that predates
       the column falls back to the species rather than to an empty string,
       which would draw nothing at all. */
    portrait: row.portrait || species,
    createdAt: row.createdAt,
  };
}

/** The hub's Pet as the fields the API accepts. `id`, `photos` and `createdAt`
 *  are the server's to decide and are not sent. */
function toPatch(pet: Partial<Pet>): PetPatch {
  const patch: PetPatch = {};
  const keys = [
    'name', 'species', 'breed', 'dob', 'ageMonths', 'sex', 'weightKg', 'targetWeightKg',
    'bodyCondition', 'activity', 'housing', 'sterilised', 'allergies', 'sensitivities',
    'restrictions', 'currentFood', 'dietStyle', 'goal', 'healthNotes', 'medical', 'portrait',
  ] as const;
  for (const key of keys) {
    if (pet[key] !== undefined) (patch as Record<string, unknown>)[key] = pet[key];
  }
  return patch;
}

/** What a citizen is told when a save did not happen. Never the raw exception:
 *  "Request failed with status code 500" is not a sentence about their cat. */
function why(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof message === 'string' && message.length < 200) return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  return fallback;
}

export interface PetsState {
  pets: Pet[];
  activePetId: string | null;
  plans: Record<string, NutritionPlan>;
  favourites: string[];
  cart: CartLine[];
  wishlist: string[];
  compare: string[];
  shopping: ShoppingItem[];
  wellness: WellnessEntry[];
  activity: ActivityEntry[];
  loading: boolean;
  error: string | null;

  /** Whether the citizen's own pets have been fetched yet. Separate from
   *  `loading`, because "no pets" and "not asked yet" are different screens and
   *  showing the empty state during the first request is how a citizen with
   *  three dogs is told they have none. */
  loaded: boolean;

  clearAll: () => void;
  /** Fetch this account's pets and rebuild every plan from them. Idempotent —
   *  the boot component calls it on mount and a second mount must not refetch
   *  over an edit in progress. */
  loadPets: () => Promise<void>;
  addPet: (pet: Pet) => Promise<Pet | null>;
  setPhotos: (id: string, photos: PetPhoto[]) => Promise<void>;
  updatePet: (id: string, patch: Partial<Pet>) => Promise<Pet | null>;
  removePet: (id: string) => Promise<void>;
  setActive: (id: string) => void;

  generatePlan: (petId: string) => void;
  setDay: (petId: string, day: DayPlan) => void;
  toggleMealDone: (petId: string, date: string, mealId: string) => void;
  regenerate: (petId: string, date: string, mealId: string) => void;
  toggleFavourite: (id: string) => void;

  /**
   * Rebuild the grocery list for EVERY pet in the house, merged.
   *
   * No argument, and that is the change: the list used to be the active pet's
   * and switching pets replaced it, so a two-animal home could only ever shop
   * for one of them at a time. One list, one cart, one order.
   */
  buildShopping: () => void;
  toggleShopping: (id: string) => void;
  addShoppingItem: (label: string, qty: string) => void;
  setShoppingQty: (id: string, qty: string) => void;

  addToCart: (productId: string, variantIndex: number) => void;
  setCartQty: (productId: string, variantIndex: number, qty: number) => void;
  clearCart: () => void;
  toggleWishlist: (id: string) => void;
  toggleCompare: (id: string) => void;

  addWellness: (entry: WellnessEntry) => void;
  toggleWellness: (id: string) => void;
  addActivity: (entry: ActivityEntry) => void;

  setError: (message: string | null) => void;
  setLoading: (on: boolean) => void;
}

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const usePets = create<PetsState>((set, get) => ({
  pets: [],
  activePetId: null,
  plans: {},
  favourites: [],
  cart: [],
  wishlist: [],
  compare: [],
  shopping: [],
  wellness: [],
  activity: [],
  loading: false,
  loaded: false,
  error: null,

  /* `loadSamples` used to sit here and fill the district with two invented
     pets. scripts/nav-audit.mjs counts invented data in a shipped screen as a
     defect, and the prototype seeds the same two through addPet/generatePlan
     instead — which exercises the real path rather than a fixture. */
  clearAll: () => set({
    pets: [], activePetId: null, plans: {}, shopping: [], cart: [], wishlist: [],
    compare: [], wellness: [], activity: [], favourites: [], loaded: false,
  }),

  /**
   * THE CITIZEN'S OWN ANIMALS, AND A PLAN FOR EACH OF THEM.
   *
   * The plans are rebuilt here rather than fetched because they are derived —
   * see the note at the top of this file — and rebuilding them at load is what
   * makes the diet planner's promise true: a citizen who saved a profile last
   * week opens the hub to a month of meals without pressing anything.
   *
   * A pet with no weight gets no plan and no error: `buildPlan` needs a weight
   * to run a calorie equation, and the planner already has a screen that says
   * so and links to the field.
   */
  loadPets: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const rows = await petsApi.list();
      const pets = rows.map(fromRow);
      const plans: Record<string, NutritionPlan> = {};
      for (const pet of pets) {
        if (pet.weightKg) plans[pet.id] = buildPlan(pet);
      }
      set((s) => ({
        pets,
        plans,
        /* An id the citizen chose in this session survives a refetch; otherwise
           the first pet is the one the district is about. */
        activePetId: pets.some((p) => p.id === s.activePetId) ? s.activePetId : pets[0]?.id ?? null,
        loading: false,
        loaded: true,
      }));
      get().buildShopping();
    } catch (err) {
      set({ loading: false, loaded: true, error: why(err, 'Your pets could not be loaded. Check your connection and try again.') });
    }
  },

  /**
   * A NEW ANIMAL ON THE ACCOUNT.
   *
   * The optimistic row carries the id the form invented, and the saved row
   * carries the server's — so the swap is a REPLACE keyed on the old id, not a
   * merge. Returning the saved pet is what lets the profile page build the plan
   * against the id that will still exist after a refresh; building it against
   * the temporary one would produce a plan that vanishes on the next load.
   */
  addPet: async (pet) => {
    set((s) => ({ pets: [...s.pets, pet], activePetId: pet.id, error: null }));
    try {
      const saved = fromRow(await petsApi.create(toPatch(pet)));
      set((s) => ({
        pets: s.pets.map((p) => (p.id === pet.id ? saved : p)),
        activePetId: s.activePetId === pet.id ? saved.id : s.activePetId,
      }));
      return saved;
    } catch (err) {
      set((s) => ({
        pets: s.pets.filter((p) => p.id !== pet.id),
        activePetId: s.activePetId === pet.id ? s.pets.find((p) => p.id !== pet.id)?.id ?? null : s.activePetId,
        error: why(err, `${pet.name || 'That pet'} could not be saved. Nothing was lost — try again.`),
      }));
      return null;
    }
  },

  /* Photos are a field on the pet like any other, so this is `updatePet` with a
     narrower door. It exists because the gallery is used on screens that do not
     own the whole draft, and passing a whole Pet around to change one array is
     how two screens end up disagreeing about the rest of it.

     ── ONE GALLERY, THREE SERVER CALLS, AND A DIFF TO CHOOSE BETWEEN THEM ──

     `PetPhotos` hands back the array it wants to exist and knows nothing about
     endpoints, which is the seam worth keeping: it is the same contract it had
     when this was a store in memory. So the change is worked out here, and the
     component makes exactly one kind of change per call — it appends, it
     removes, or it moves one to the front — which is why a diff is enough and
     a general reconciliation is not.

     A photograph is uploaded before it can be promoted, and the component
     awaits this function while its spinner is up, so `saved` is true by the
     time anybody can click "Make main". */
  setPhotos: async (id, photos) => {
    const before = get().pets.find((p) => p.id === id)?.photos ?? [];
    set((s) => ({ pets: s.pets.map((p) => (p.id === id ? { ...p, photos } : p)), error: null }));
    const keeping = new Set(photos.map((p) => p.id));
    const gone = before.filter((p) => !keeping.has(p.id));
    const fresh = photos.filter((p) => !p.saved);
    const promoted = photos[0] && photos[0].saved && photos[0].id !== before[0]?.id ? photos[0].id : null;
    if (!gone.length && !fresh.length && !promoted) return;
    try {
      let row: PetRow | null = null;
      for (const photo of gone) row = await petsApi.removePhoto(photo.id);
      for (const photo of fresh) row = await petsApi.addPhoto(id, photoFile(photo));
      if (promoted) row = await petsApi.makeMainPhoto(promoted);
      if (row) {
        /* Match the photographs the account did not have before against the
           files we just uploaded, in order — the server appends in the order it
           was given — so each one keeps the fingerprint and the scrub result
           that belong to it. See `thisSession`. */
        const had = new Set(before.map((p) => p.id));
        row.photos
          .filter((p) => !had.has(p.id))
          .forEach((p, i) => {
            const from = fresh[i];
            if (from) thisSession.set(p.id, { fingerprint: from.fingerprint, name: from.name, removed: from.removed });
          });
        const saved = fromRow(row);
        set((s) => ({ pets: s.pets.map((p) => (p.id === id ? { ...p, photos: saved.photos } : p)) }));
      }
    } catch (err) {
      set((s) => ({
        pets: s.pets.map((p) => (p.id === id ? { ...p, photos: before } : p)),
        error: why(err, 'That photo could not be saved. Nothing was changed — try again.'),
      }));
    }
  },

  /**
   * AN EDIT, SENT AS THE FIELDS THAT CHANGED.
   *
   * `patch` rather than the whole pet, because the profile page and the medical
   * card are two forms over one row: a page that posted the object it happened
   * to be holding would overwrite whatever the other one saved while it was
   * open. The server merges; `toPatch` drops every key that is `undefined`.
   */
  updatePet: async (id, patch) => {
    const before = get().pets.find((p) => p.id === id) ?? null;
    if (!before) return null;
    set((s) => ({ pets: s.pets.map((p) => (p.id === id ? { ...p, ...patch } : p)), error: null }));
    try {
      const saved = fromRow(await petsApi.update(id, toPatch(patch)));
      set((s) => ({ pets: s.pets.map((p) => (p.id === id ? saved : p)) }));
      return saved;
    } catch (err) {
      set((s) => ({
        pets: s.pets.map((p) => (p.id === id ? before : p)),
        error: why(err, `The change to ${before.name || 'that pet'} was not saved. Your last saved version is shown.`),
      }));
      return null;
    }
  },

  removePet: async (id) => {
    const before = get().pets;
    const beforePlans = get().plans;
    set((s) => {
      const pets = s.pets.filter((p) => p.id !== id);
      // Omit-by-destructuring leaves a binding nobody reads, which this repo's
      // lint counts as an error rather than a style. A copy and a delete says the
      // same thing and says it to the linter too.
      const plans = { ...s.plans };
      delete plans[id];
      return { pets, plans, activePetId: s.activePetId === id ? pets[0]?.id ?? null : s.activePetId, error: null };
    });
    try {
      await petsApi.remove(id);
    } catch (err) {
      /* Put the animal back. A delete that did not happen must not look like
         one that did — the next screen would offer to re-add a pet the account
         still has, and the citizen would end up with two. */
      set({
        pets: before,
        plans: beforePlans,
        error: why(err, 'That pet was not removed. Nothing was deleted — try again.'),
      });
    }
  },
  setActive: (id) => set({ activePetId: id }),

  generatePlan: (petId) => {
    const pet = get().pets.find((p) => p.id === petId);
    if (!pet) return;
    set((s) => ({ plans: { ...s.plans, [petId]: buildPlan(pet) } }));
  },

  setDay: (petId, day) => set((s) => {
    const plan = s.plans[petId];
    if (!plan) return {};
    return { plans: { ...s.plans, [petId]: { ...plan, days: plan.days.map((d) => (d.date === day.date ? day : d)) } } };
  }),

  toggleMealDone: (petId, date, mealId) => set((s) => {
    const plan = s.plans[petId];
    if (!plan) return {};
    return {
      plans: {
        ...s.plans,
        [petId]: {
          ...plan,
          days: plan.days.map((d) => d.date !== date ? d : {
            ...d, meals: d.meals.map((m) => (m.id === mealId ? { ...m, done: !m.done } : m)),
          }),
        },
      },
    };
  }),

  regenerate: (petId, date, mealId) => {
    const { pets, plans } = get();
    const pet = pets.find((p) => p.id === petId);
    const plan = plans[petId];
    const day = plan?.days.find((d) => d.date === date);
    if (!pet || !plan || !day) return;
    const next = regenerateMeal(pet, day, mealId, Date.now() % 997);
    get().setDay(petId, next);
  },

  toggleFavourite: (id) => set((s) => ({
    favourites: s.favourites.includes(id) ? s.favourites.filter((f) => f !== id) : [...s.favourites, id],
  })),

  buildShopping: () => {
    const { pets, plans, shopping } = get();
    const entries = pets
      .map((pet) => ({ pet, plan: plans[pet.id] }))
      .filter((e): e is { pet: Pet; plan: NutritionPlan } => Boolean(e.plan));
    /* Items somebody typed in themselves survive a rebuild. They are not
       derived from any plan, so regenerating the list must not be how a person
       loses the litter and the shampoo they added by hand. */
    const own = shopping.filter((i) => i.custom);
    /* And ticks survive it too: a rebuild is triggered by saving a profile, and
       coming back from the shop to find everything unchecked is the kind of
       small betrayal that stops a list being used. */
    const ticked = new Set(shopping.filter((i) => i.checked).map((i) => i.id));
    set({
      shopping: [
        ...shoppingForHousehold(entries).map((i) => (ticked.has(i.id) ? { ...i, checked: true } : i)),
        ...own,
      ],
    });
  },
  toggleShopping: (id) => set((s) => ({
    shopping: s.shopping.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
  })),
  addShoppingItem: (label, qty) => set((s) => ({
    shopping: [...s.shopping, { id: uid('custom'), label, qty, source: 'home-kitchen', productId: null, checked: false, custom: true, forPets: [] }],
  })),
  setShoppingQty: (id, qty) => set((s) => ({
    shopping: s.shopping.map((i) => (i.id === id ? { ...i, qty } : i)),
  })),

  addToCart: (productId, variantIndex) => set((s) => {
    const found = s.cart.find((l) => l.productId === productId && l.variantIndex === variantIndex);
    return found
      ? { cart: s.cart.map((l) => (l === found ? { ...l, qty: l.qty + 1 } : l)) }
      : { cart: [...s.cart, { productId, variantIndex, qty: 1 }] };
  }),
  setCartQty: (productId, variantIndex, qty) => set((s) => ({
    cart: qty <= 0
      ? s.cart.filter((l) => !(l.productId === productId && l.variantIndex === variantIndex))
      : s.cart.map((l) => (l.productId === productId && l.variantIndex === variantIndex ? { ...l, qty } : l)),
  })),
  clearCart: () => set({ cart: [] }),

  toggleWishlist: (id) => set((s) => ({
    wishlist: s.wishlist.includes(id) ? s.wishlist.filter((w) => w !== id) : [...s.wishlist, id],
  })),
  toggleCompare: (id) => set((s) => ({
    compare: s.compare.includes(id)
      ? s.compare.filter((c) => c !== id)
      : s.compare.length >= 3 ? [...s.compare.slice(1), id] : [...s.compare, id],
  })),

  addWellness: (entry) => set((s) => ({ wellness: [...s.wellness, entry] })),
  toggleWellness: (id) => set((s) => ({
    wellness: s.wellness.map((w) => (w.id === id ? { ...w, done: !w.done } : w)),
  })),
  addActivity: (entry) => set((s) => ({ activity: [...s.activity, entry] })),

  setError: (message) => set({ error: message }),
  setLoading: (on) => set({ loading: on }),
}));

export const newPetId = () => uid('pet');
export const newEntryId = (p: string) => uid(p);

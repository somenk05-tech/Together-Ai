/**
 * ── THE HUB'S STATE, IN ONE STORE ───────────────────────────────────────────
 *
 * Zustand, matching the rest of the application, and deliberately IN MEMORY.
 * Nothing here writes to localStorage: a pet profile is the citizen's record
 * and belongs on the server behind their account, not in a browser store that
 * one device knows about and the next does not. `api.ts` is the seam where the
 * NestJS endpoints replace these actions; the shape of every action is already
 * the shape of the call that will replace it.
 *
 * WHAT THIS MEANS TODAY: a reload starts the demo again with the two sample
 * pets. That is a truthful prototype rather than a hidden dependency on a
 * storage layer nobody signed off.
 */

import { create } from 'zustand';
import type {
  ActivityEntry, CartLine, DayPlan, NutritionPlan, Pet, PetPhoto, ShoppingItem,
  WellnessEntry,
} from './types';
import { buildPlan, regenerateMeal } from './engine/plan';
import { shoppingFor } from './engine/shopping';

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

  clearAll: () => void;
  addPet: (pet: Pet) => void;
  setPhotos: (id: string, photos: PetPhoto[]) => void;
  updatePet: (id: string, patch: Partial<Pet>) => void;
  removePet: (id: string) => void;
  setActive: (id: string) => void;

  generatePlan: (petId: string) => void;
  setDay: (petId: string, day: DayPlan) => void;
  toggleMealDone: (petId: string, date: string, mealId: string) => void;
  regenerate: (petId: string, date: string, mealId: string) => void;
  toggleFavourite: (id: string) => void;

  buildShopping: (petId: string) => void;
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
  error: null,

  /* `loadSamples` used to sit here and fill the district with two invented
     pets. scripts/nav-audit.mjs counts invented data in a shipped screen as a
     defect, and the prototype seeds the same two through addPet/generatePlan
     instead — which exercises the real path rather than a fixture. */
  clearAll: () => set({
    pets: [], activePetId: null, plans: {}, shopping: [], cart: [], wishlist: [],
    compare: [], wellness: [], activity: [], favourites: [],
  }),

  addPet: (pet) => set((s) => ({ pets: [...s.pets, pet], activePetId: pet.id })),
  /* Photos are a field on the pet like any other, so this is `updatePet` with a
     narrower door. It exists because the gallery is used on screens that do not
     own the whole draft, and passing a whole Pet around to change one array is
     how two screens end up disagreeing about the rest of it. */
  setPhotos: (id, photos) => set((s) => ({
    pets: s.pets.map((p) => (p.id === id ? { ...p, photos } : p)),
  })),
  updatePet: (id, patch) => set((s) => ({ pets: s.pets.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removePet: (id) => set((s) => {
    const pets = s.pets.filter((p) => p.id !== id);
    // Omit-by-destructuring leaves a binding nobody reads, which this repo's
    // lint counts as an error rather than a style. A copy and a delete says the
    // same thing and says it to the linter too.
    const plans = { ...s.plans };
    delete plans[id];
    return { pets, plans, activePetId: s.activePetId === id ? pets[0]?.id ?? null : s.activePetId };
  }),
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

  buildShopping: (petId) => {
    const { pets, plans } = get();
    const pet = pets.find((p) => p.id === petId);
    const plan = plans[petId];
    if (!pet || !plan) return;
    set({ shopping: shoppingFor(pet, plan) });
  },
  toggleShopping: (id) => set((s) => ({
    shopping: s.shopping.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
  })),
  addShoppingItem: (label, qty) => set((s) => ({
    shopping: [...s.shopping, { id: uid('custom'), label, qty, source: 'home-kitchen', productId: null, checked: false, custom: true }],
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

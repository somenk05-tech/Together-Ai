import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

export interface OwnIngredient { name: string; grams: number }
export interface OwnNutrition { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

export interface OwnRecipeInput {
  name: string; country: string; slot: 'b' | 'l' | 's' | 'd';
  minutes: number; servings: number;
  ingredients: OwnIngredient[];
  steps: string[];
  /** All five or none — the API refuses a partial override. */
  nutrition?: OwnNutrition;
}

export interface MyRecipe {
  id: string; name: string; country: string; slot: string; diet: string;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  minutes: number; gramsPerServing: number;
  nutritionSource: 'computed' | 'author';
  coveragePct: number;
}

export interface SavedOwnRecipe {
  recipe: MyRecipe;
  /** Things worth telling them — a wide gap between their figure and ours, a
   *  serving count we re-declared, an implausible value. Never swallowed. */
  notes: string[];
  /** What the ingredients came to, even when their own figures won. */
  computed: OwnNutrition | null;
}

const KEY = ['nutrition', 'my-recipes'] as const;

export function useMyRecipes() {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<MyRecipe[]>('/nutrition/recipes/own').then((r) => r.data) });
}

export function useSaveOwnRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; input: OwnRecipeInput }) =>
      (v.id
        ? api.patch<SavedOwnRecipe>(`/nutrition/recipes/own/${v.id}`, v.input)
        : api.post<SavedOwnRecipe>('/nutrition/recipes/own', v.input)
      ).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      // Their dishes are in the library and in the planner's pool now.
      void qc.invalidateQueries({ queryKey: ['nutrition', 'library'] });
    },
  });
}

export interface DeletedOwnRecipe {
  deleted: boolean;
  /** How many plan slots this dish was the citizen's own choice for. */
  slotsFreed: number;
  /** Plain-language consequence, when there is one. Shown, not swallowed. */
  note: string | null;
}

export function useDeleteOwnRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<DeletedOwnRecipe>(`/nutrition/recipes/own/${id}`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'library'] });
      // Deleting can clear pins, so the plan the citizen is looking at may have
      // changed underneath them.
      void qc.invalidateQueries({ queryKey: ['nutrition', 'composed'] });
    },
  });
}

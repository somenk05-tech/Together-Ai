import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http as api } from '@/api/client';

export interface RecipeCard {
  id: string; name: string; cuisine: string;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  minutes: number; servings: number; difficulty: string; diet: string;
  healthScore: number | null; healthGrade: string | null; imageUrl: string | null;
  badges: { diabetes: boolean; kidney: boolean; heart: boolean; vegan: boolean; vegetarian: boolean };
}
export interface LibraryResult {
  items: RecipeCard[]; total: number; page: number; pageSize: number; pages: number;
  cuisines: Array<{ name: string; count: number }>;
}
export interface LibraryQuery {
  search?: string; cuisine?: string; mealType?: string; diet?: string; sort?: string; page?: number;
}

export function useRecipeLibrary(q: LibraryQuery, enabled = true) {
  return useQuery({
    queryKey: ['nutrition', 'library', q],
    queryFn: () => api.get<LibraryResult>('/nutrition/recipes/library', { params: q }).then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
  });
}

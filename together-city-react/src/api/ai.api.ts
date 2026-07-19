import { useQuery } from '@tanstack/react-query';
import { http as api } from './client';

export type AiKind = 'recipes' | 'astrology' | 'beauty' | 'fitness';

export interface AiSuggestion { title: string; detail: string; tag?: string }
export interface AiSuggestions {
  aiPowered: boolean;
  intro: string;
  items: AiSuggestion[];
  note?: string;
}

export const aiApi = {
  suggestions: (kind: AiKind): Promise<AiSuggestions> =>
    api.get<AiSuggestions>(`/ai/${kind}`).then((r) => r.data),
};

export function useAiSuggestions(kind: AiKind, enabled = true) {
  return useQuery({
    queryKey: ['ai', kind],
    queryFn: () => aiApi.suggestions(kind),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

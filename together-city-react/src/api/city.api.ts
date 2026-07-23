import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './http';

export const CityHeaderSchema = z.object({
  city: z.string(),
  region: z.string().nullable().optional(),
  temperatureC: z.number().nullable(),
  feelsLikeC: z.number().nullable(),
  code: z.number().nullable(),
  description: z.string().nullable(),
  icon: z.string(),
  source: z.enum(['device', 'profile', 'default']),
  lat: z.number(),
  lng: z.number(),
});
export type CityHeader = z.infer<typeof CityHeaderSchema>;

export const cityApi = {
  header: (coords?: { lat: number; lng: number }): Promise<CityHeader> =>
    apiGet('/city/header', CityHeaderSchema, { params: coords ? { lat: coords.lat, lng: coords.lng } : undefined }),
};

/** Live city header — refreshes weather every 20 minutes. */
export function useCityHeader(coords?: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ['city', 'header', coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : 'profile'],
    queryFn: () => cityApi.header(coords ?? undefined),
    refetchInterval: 20 * 60 * 1000,
    staleTime: 15 * 60 * 1000,
  });
}

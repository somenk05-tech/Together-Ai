import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Category { key: string; label: string; icon: string }
export interface Tier { name: string; priceInr: number; perks: string }
export interface PackageCard {
  id: string; title: string; destination: string; country: string; category: string; categoryLabel: string; icon: string;
  nights: number; days: number; priceFromInr: number; summary: string; heroUrl: string;
}
export interface PackageDetail extends PackageCard {
  highlights: string[]; inclusions: string[]; itinerary: { day: number; title: string; detail: string }[]; tiers: Tier[];
}
export interface Airport { code: string; city: string; name: string; intl: boolean }
export interface FlightResult {
  id: string; airlineCode: string; airline: string; flightNo: string; from: string; to: string;
  departTime: string; arriveTime: string; durationMins: number; durationLabel: string; stops: number; stopLabel: string; nextDay: boolean;
  cabin: string; priceInr: number; cheapest?: boolean; fastest?: boolean; best?: boolean;
}
export interface FlightSearchResult { from: Airport | null; to: Airport | null; date: string; pax: number; cabin: string; count: number; flights: FlightResult[] }
export interface Trip {
  id: string; kind: string; title: string; subtitle: string; tier: string; pax: number; totalInr: number; code: string; status: string;
  icon: string; detail: Record<string, unknown>; bookedOn: string;
}
export interface FlightSearchInput { from: string; to: string; date: string; pax: number; cabin: string }

export const travelApi = {
  categories: () => api.get<Category[]>('/travel/categories').then((r) => r.data),
  packages: (category?: string) => api.get<PackageCard[]>('/travel/packages', { params: { category } }).then((r) => r.data),
  package: (id: string) => api.get<PackageDetail>(`/travel/packages/${id}`).then((r) => r.data),
  bookPackage: (id: string, input: { tier: string; pax: number; method: 'wallet' | 'card' }) =>
    api.post<Trip[]>(`/travel/packages/${id}/book`, input).then((r) => r.data),
  airports: () => api.get<Airport[]>('/travel/airports').then((r) => r.data),
  flightSearch: (q: FlightSearchInput) => api.get<FlightSearchResult>('/travel/flights/search', { params: q }).then((r) => r.data),
  bookFlight: (input: FlightSearchInput & { flightId: string; method: 'wallet' | 'card' }) =>
    api.post<Trip[]>('/travel/flights/book', input).then((r) => r.data),
  trips: () => api.get<Trip[]>('/travel/trips').then((r) => r.data),
};

export function useCategories() { return useQuery({ queryKey: ['travel', 'categories'], queryFn: () => travelApi.categories() }); }
export function usePackages(category?: string) { return useQuery({ queryKey: ['travel', 'packages', category], queryFn: () => travelApi.packages(category) }); }
export function usePackage(id: string) { return useQuery({ queryKey: ['travel', 'package', id], queryFn: () => travelApi.package(id), enabled: !!id }); }
export function useBookPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; tier: string; pax: number; method: 'wallet' | 'card' }) => travelApi.bookPackage(v.id, { tier: v.tier, pax: v.pax, method: v.method }),
    onSuccess: (trips) => { qc.setQueryData(['travel', 'trips'], trips); void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}
export function useAirports() { return useQuery({ queryKey: ['travel', 'airports'], queryFn: () => travelApi.airports() }); }
export function useFlightSearch(q: FlightSearchInput | null) {
  return useQuery({ queryKey: ['travel', 'flights', q], queryFn: () => travelApi.flightSearch(q!), enabled: !!q && q.from !== q.to });
}
export function useBookFlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: FlightSearchInput & { flightId: string; method: 'wallet' | 'card' }) => travelApi.bookFlight(v),
    onSuccess: (trips) => { qc.setQueryData(['travel', 'trips'], trips); void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}
export function useMyTrips() { return useQuery({ queryKey: ['travel', 'trips'], queryFn: () => travelApi.trips() }); }

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

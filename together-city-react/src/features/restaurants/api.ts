import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Cuisine { key: string; label: string; icon: string }
export interface RestaurantCard {
  id: string; name: string; cuisine: string; cuisineLabel: string; icon: string;
  area: string; city: string; rating: number; priceForTwoInr: number;
  tagline: string; openHours: string; vegFriendly: boolean; heroUrl: string;
  dietFitCount?: number; dietTotal?: number; dietLabel?: string;
}
export interface Dish {
  id: string; name: string; desc: string; priceInr: number; diet: string; dietLabel: string;
  section: string; bestseller?: boolean; spicy?: boolean; fitsYourDiet: boolean | null;
}
export interface MenuSection { section: string; items: Dish[] }
export interface PopularDish { name: string; priceInr: number; diet: string; dietLabel: string; desc: string; bestseller: boolean }
export interface QualityBreakdown { tcScore: number; food: number; hygiene: number; value: number; googleRating: number }
export interface RestaurantDetail extends RestaurantCard {
  dietProfile: string | null; sections: MenuSection[];
  category?: string; priceCategory?: string; openNow?: boolean; distanceKm?: number; etaMins?: number;
  menuAvailable?: boolean; breakdown?: QualityBreakdown; amenities?: string[]; popularDishes?: PopularDish[];
}

/** A curated card (Top 25 / collections / search) — carries the TC Score + signals. */
export interface CuratedCard extends RestaurantCard {
  category: string; tcScore: number; qualityScore: number; hygiene: number; valueScore: number;
  distanceKm: number; etaMins: number; priceCategory: string; openNow: boolean;
  menuAvailable: boolean; ordersOnline: boolean; reservations: boolean;
  pureVeg: boolean; vegan: boolean; jain: boolean; outdoor: boolean; petFriendly: boolean; familyFriendly: boolean;
  tcChecked: boolean; ratingsCount: number | null; placeId: string | null; source: 'places' | 'seed';
  reasons: string[]; rank?: number;
}
export interface TopResult { live: boolean; source: string; locality: string | null; count: number; restaurants: CuratedCard[] }
export interface Collection { key: string; title: string; subtitle: string; items: CuratedCard[] }
export interface CollectionsResult { live: boolean; source: string; collections: Collection[] }
export interface SearchResult { query: string; results: CuratedCard[] }
export interface RestaurantOverview { aiPowered: boolean; highlights: string[]; tryThese: string[]; bestFor: string; note: string }

/** Decision engine — today's meal target + dish matches. */
export interface MealTarget { slot: string; slotLabel: string; kcal: number; protein: number; carbs: number; fat: number; cuisine: string; diet: string; recipeName: string }
export interface DishMatch {
  dishId: string; dishName: string; desc: string; priceInr: number; diet: string; dietLabel: string; bestseller: boolean;
  kcal: number; protein: number; carbs: number; fat: number; estimated: boolean; matchScore: number; why: string[];
  restaurantId: string; restaurantName: string; area: string; heroUrl: string; icon: string; cuisineLabel: string; distanceKm: number; etaMins: number;
}
export interface MealMatchResult { hasPlan: boolean; slot: string; slotLabel: string; target: MealTarget | null; matches: DishMatch[] }

export interface OrderLine { dishId: string; name: string; qty: number; priceInr: number; lineInr: number }
export interface DiningOrder {
  id: string; restaurantId: string; restaurantName: string; area: string; mode: string;
  items: OrderLine[]; subtotalInr: number; packingInr: number; taxInr: number; totalInr: number;
  code: string; status: string; placedOn: string;
}
export interface Reservation {
  id: string; restaurantId: string; restaurantName: string; area: string;
  date: string; time: string; partySize: number; guestName: string; notes: string; code: string; status: string;
}

export interface BrowseQuery { cuisine?: string; vegOnly?: boolean }
export type PayMethod = 'wallet' | 'card';

/** AI discovery (Explore) — a personalised, ranked pick of nearby restaurants. */
export interface DiscoverQuery {
  lat?: number; lng?: number; city?: string; radiusKm?: number; cuisine?: string;
  maxPriceForTwo?: number; minRating?: number; openNow?: boolean;
  pureVeg?: boolean; vegan?: boolean; jain?: boolean; outdoor?: boolean; pet?: boolean; family?: boolean;
}
export interface DiscoverCard extends RestaurantCard {
  matchScore: number; qualityScore: number; hygiene: number; distanceKm: number; etaMins: number;
  priceCategory: string; openNow: boolean; reasons: string[]; tcChecked: boolean;
  pureVeg: boolean; vegan: boolean; jain: boolean; outdoor: boolean; petFriendly: boolean; familyFriendly: boolean;
  source: 'places' | 'seed'; placeId: string | null; ratingsCount: number | null; mapsUrl: string | null;
}
export interface DiscoverResult {
  live: boolean; source: 'places' | 'seed'; count: number; restaurants: DiscoverCard[];
}

export const restApi = {
  cuisines: () => api.get<Cuisine[]>('/restaurants/cuisines').then((r) => r.data),
  browse: (q: BrowseQuery) => api.get<RestaurantCard[]>('/restaurants', { params: q }).then((r) => r.data),
  detail: (id: string) => api.get<RestaurantDetail>(`/restaurants/${id}`).then((r) => r.data),
  order: (id: string, input: { mode: 'delivery' | 'dinein'; items: { dishId: string; qty: number }[]; method: PayMethod }) =>
    api.post<DiningOrder[]>(`/restaurants/${id}/order`, input).then((r) => r.data),
  reserve: (id: string, input: { date: string; time: string; partySize: number; name: string; notes?: string }) =>
    api.post<Reservation[]>(`/restaurants/${id}/reserve`, input).then((r) => r.data),
  orders: () => api.get<DiningOrder[]>('/restaurants/orders').then((r) => r.data),
  reservations: () => api.get<Reservation[]>('/restaurants/reservations').then((r) => r.data),
  discover: (q: DiscoverQuery) => api.get<DiscoverResult>('/restaurants/discover', { params: q }).then((r) => r.data),
  top: (q: DiscoverQuery & { area?: string; limit?: number }) => api.get<TopResult>('/restaurants/top', { params: q }).then((r) => r.data),
  collections: (q: { lat?: number; lng?: number; city?: string; radiusKm?: number }) => api.get<CollectionsResult>('/restaurants/collections', { params: q }).then((r) => r.data),
  search: (q: string) => api.get<SearchResult>('/restaurants/search', { params: { q } }).then((r) => r.data),
  overview: (id: string) => api.get<RestaurantOverview>(`/restaurants/${id}/overview`).then((r) => r.data),
  mealMatch: (q: { lat?: number; lng?: number; slot?: string; limit?: number }) => api.get<MealMatchResult>('/restaurants/meal-match', { params: q }).then((r) => r.data),
};

export function useCuisines() {
  return useQuery({ queryKey: ['rest', 'cuisines'], queryFn: () => restApi.cuisines() });
}
export function useRestaurants(q: BrowseQuery) {
  return useQuery({ queryKey: ['rest', 'list', q], queryFn: () => restApi.browse(q) });
}
export function useRestaurant(id: string) {
  return useQuery({ queryKey: ['rest', 'detail', id], queryFn: () => restApi.detail(id), enabled: !!id });
}
/**
 * Explore discovery. Keyed by the whole query so filter changes refetch, but the
 * backend serves live Places from a ~20-min per-cell cache, so only a real
 * location move or cache expiry actually calls Google. `enabled` gates until we
 * have either a GPS fix or a manual city.
 */
export function useDiscover(q: DiscoverQuery, enabled: boolean) {
  return useQuery({
    queryKey: ['rest', 'discover', q],
    queryFn: () => restApi.discover(q),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
export function useTopByLocality(q: DiscoverQuery & { area?: string; limit?: number }, enabled: boolean) {
  return useQuery({ queryKey: ['rest', 'top', q], queryFn: () => restApi.top(q), enabled, staleTime: 5 * 60 * 1000 });
}
export function useCollections(q: { lat?: number; lng?: number; city?: string; radiusKm?: number }, enabled: boolean) {
  return useQuery({ queryKey: ['rest', 'collections', q], queryFn: () => restApi.collections(q), enabled, staleTime: 5 * 60 * 1000 });
}
export function useRestaurantSearch(term: string) {
  return useQuery({ queryKey: ['rest', 'search', term.trim().toLowerCase()], queryFn: () => restApi.search(term), enabled: term.trim().length >= 2, staleTime: 60 * 1000 });
}
export function useRestaurantOverview(id: string) {
  return useQuery({ queryKey: ['rest', 'overview', id], queryFn: () => restApi.overview(id), enabled: !!id, staleTime: 30 * 60 * 1000 });
}
export function useMealMatch(q: { lat?: number; lng?: number; slot?: string }, enabled: boolean) {
  return useQuery({ queryKey: ['rest', 'meal-match', q], queryFn: () => restApi.mealMatch(q), enabled, staleTime: 5 * 60 * 1000 });
}
export function useMyOrders() {
  return useQuery({ queryKey: ['rest', 'orders'], queryFn: () => restApi.orders() });
}
export function useMyReservations() {
  return useQuery({ queryKey: ['rest', 'reservations'], queryFn: () => restApi.reservations() });
}
export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; mode: 'delivery' | 'dinein'; items: { dishId: string; qty: number }[]; method: PayMethod }) =>
      restApi.order(v.id, { mode: v.mode, items: v.items, method: v.method }),
    onSuccess: (orders) => { qc.setQueryData(['rest', 'orders'], orders); void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}
export function useReserve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; date: string; time: string; partySize: number; name: string; notes?: string }) =>
      restApi.reserve(v.id, { date: v.date, time: v.time, partySize: v.partySize, name: v.name, notes: v.notes }),
    onSuccess: (rows) => { qc.setQueryData(['rest', 'reservations'], rows); },
  });
}

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
export const dietDot = (diet: string): string => ({ veg: '#2e7d32', vegan: '#1b8f3a', jain: '#2e7d32', egg: '#c9a227', nonveg: '#c62828', pesc: '#1565c0' } as Record<string, string>)[diet] ?? '#777';

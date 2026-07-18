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
export interface RestaurantDetail extends RestaurantCard { dietProfile: string | null; sections: MenuSection[] }

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

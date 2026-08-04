import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Photo { url: string; caption?: string }
export interface FloorPlan { label: string; url: string }
export interface Milestone { label: string; pct: number; note?: string }
export interface Amenity { key: string; label: string }

export interface Verified { rera: boolean; photo: boolean; listedBy: string }
export interface PriceInsight { pricePerSqft: number; areaAvgPerSqft: number; deltaPct: number; sampleSize: number }
export interface NearbyPoint { label: string; kind: string; distanceKm: number }

export interface PropertyCard {
  id: string; listingType: string; propertyType: string; status: string;
  title: string; city: string; locality: string; priceInr: number; areaSqft: number;
  bedrooms: number; bathrooms: number; furnishing: string | null; facing: string | null;
  coverPhoto: string | null; photoCount: number; pricePerSqft: number; verified: Verified;
  projectName: string | null; developer: string | null; possessionDate: string | null; progressPct: number | null;
  postedByYou: boolean; createdOn: string;
  moderation: 'approved' | 'pending' | 'rejected' | 'review' | 'removed';
  moderationReasons: string[];
}

export interface ModerationCheck { name: string; pass: boolean; severity: 'hard' | 'soft'; detail: string }
export interface ModerationResult { decision: 'approved' | 'rejected' | 'review'; confidence: number; score: number; checks: ModerationCheck[]; reasons: string[]; decidedAt: string }
export interface PostPropertyResult extends PropertyDetail {
  moderation: 'approved' | 'pending' | 'rejected' | 'review' | 'removed';
  moderationResult: ModerationResult;
  notice: string;
}
export interface QueueItem extends PropertyCard { result: ModerationResult | null }
export interface PropertyDetail extends PropertyCard {
  photos: Photo[]; floor: number | null; totalFloors: number | null; description: string | null;
  amenities: Amenity[]; reraId: string | null; floorPlans: FloorPlan[]; milestones: Milestone[];
  insight: PriceInsight; neighbourhood: NearbyPoint[]; livabilityScore: number;
  /** What livabilityScore counted. Optional — older cached responses lack it. */
  livabilityBasis?: string;
}

export interface PostPropertyInput {
  listingType: string; propertyType: string; status: string; title: string; city: string; locality: string;
  priceInr: number; areaSqft: number; bedrooms: number; bathrooms: number; furnishing?: string;
  floor?: number; totalFloors?: number; facing?: string; amenities: string[]; description?: string;
  photos: Photo[];
  projectName?: string; developer?: string; reraId?: string; possessionDate?: string; progressPct?: number;
  floorPlans?: FloorPlan[]; milestones?: Milestone[];
}

export interface ListingQuery { city?: string; propertyType?: string; listingType?: string; minBedrooms?: number; maxPriceInr?: number }

export const realestateApi = {
  listings: (q: ListingQuery) => api.get<PropertyCard[]>('/realestate/listings', { params: q }).then((r) => r.data),
  underConstruction: () => api.get<PropertyDetail[]>('/realestate/under-construction').then((r) => r.data),
  myListings: () => api.get<PropertyCard[]>('/realestate/my-listings').then((r) => r.data),
  property: (id: string) => api.get<PropertyDetail>(`/realestate/properties/${id}`).then((r) => r.data),
  post: (input: PostPropertyInput) => api.post<PostPropertyResult>('/realestate/properties', input).then((r) => r.data),
  moderationQueue: () => api.get<QueueItem[]>('/realestate/moderation/queue').then((r) => r.data),
  moderationDecide: (id: string, decision: 'approved' | 'rejected', reason?: string) =>
    api.post<{ id: string; moderation: string }>(`/realestate/moderation/${id}/decision`, { decision, reason }).then((r) => r.data),
  enquire: (id: string, message?: string) =>
    api.post<{ conversationId: string; alreadyOpen: boolean }>(`/realestate/properties/${id}/enquire`, { message }).then((r) => r.data),
  update: (id: string, input: PostPropertyInput) =>
    api.put<PostPropertyResult>(`/realestate/properties/${id}`, input).then((r) => r.data),
  close: (id: string) =>
    api.delete<{ id: string; moderation: string }>(`/realestate/properties/${id}`).then((r) => r.data),
};

export function useListings(q: ListingQuery) {
  return useQuery({ queryKey: ['realestate', 'listings', q], queryFn: () => realestateApi.listings(q) });
}
export function useUnderConstruction() {
  return useQuery({ queryKey: ['realestate', 'uc'], queryFn: () => realestateApi.underConstruction() });
}
export function useMyListings() {
  return useQuery({ queryKey: ['realestate', 'mine'], queryFn: () => realestateApi.myListings() });
}
export function useProperty(id: string) {
  return useQuery({ queryKey: ['realestate', 'property', id], queryFn: () => realestateApi.property(id), enabled: !!id });
}
/** Connect with the seller — opens (or reuses) the chat and returns its id. */
export function useEnquire() {
  return useMutation({ mutationFn: ({ id, message }: { id: string; message?: string }) => realestateApi.enquire(id, message) });
}
/** Edit a listing — the edited content re-runs moderation. */
export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PostPropertyInput }) => realestateApi.update(id, input),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['realestate'] }); },
  });
}
/** Close a listing (sold / rented / withdrawn). Edit & save relists it. */
export function useCloseProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => realestateApi.close(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['realestate'] }); },
  });
}
export function usePostProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: realestateApi.post,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['realestate'] }); },
  });
}

/** ₹ formatting — sale prices as Cr/Lakh, rent as monthly. */
export function priceLabel(priceInr: number, listingType: string): string {
  if (listingType === 'rent') return `₹${priceInr.toLocaleString('en-IN')}/mo`;
  if (priceInr >= 1_00_00_000) return `₹${(priceInr / 1_00_00_000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (priceInr >= 1_00_000) return `₹${(priceInr / 1_00_000).toFixed(2).replace(/\.00$/, '')} L`;
  return `₹${priceInr.toLocaleString('en-IN')}`;
}
export const bhkLabel = (p: { bedrooms: number; propertyType: string }) =>
  p.propertyType === 'plot' ? 'Plot' : p.propertyType === 'commercial' ? 'Commercial' : `${p.bedrooms} BHK`;

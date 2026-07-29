/**
 * Together City — Real Estate constants.
 * Shared vocabulary for property listings (types, furnishing, facings, amenities).
 */

export const PROPERTY_TYPES = ['apartment', 'villa', 'plot', 'commercial'] as const;
export const LISTING_TYPES = ['sale', 'rent'] as const;
export const STATUSES = ['ready', 'under_construction'] as const;
export const FURNISHINGS = ['unfurnished', 'semi', 'furnished'] as const;
export const FACINGS = ['east', 'west', 'north', 'south', 'north-east', 'north-west', 'south-east', 'south-west'] as const;

export const AMENITIES = [
  'lift', 'parking', 'power-backup', 'security', 'gym', 'pool', 'clubhouse',
  'park', 'gas-pipeline', 'water-supply', 'kids-play', 'cctv',
] as const;
export const AMENITY_LABEL: Record<string, string> = {
  lift: 'Lift', parking: 'Covered parking', 'power-backup': 'Power backup', security: '24×7 security',
  gym: 'Gym', pool: 'Swimming pool', clubhouse: 'Clubhouse', park: 'Park', 'gas-pipeline': 'Gas pipeline',
  'water-supply': '24×7 water', 'kids-play': "Kids' play area", cctv: 'CCTV',
};


/**
 * How well-served a listing is — NOT a judgement of how good it is to live there.
 *
 * The old formula started every listing at 52 out of 100 for having nothing at
 * all, then added 3.2 per amenity and 6 per nearby facility. The 52 was the
 * problem: it made an empty listing look middling rather than unfurnished, and
 * no part of it corresponded to anything real. A number that starts at 52 for
 * no reason is decoration wearing the costume of a measurement.
 *
 * Now it is a plain count against a realistic ceiling, starting at zero. Ten
 * amenities and five nearby facilities within 2 km reaches 100; nothing reaches
 * nothing. The caller pairs it with livabilityBasis() so the citizen is told
 * what was counted rather than left to assume a survey happened.
 */
const AMENITY_CEILING = 10;   // a well-appointed development lists about this many
const NEARBY_CEILING = 5;     // schools, clinics, transport, shops, parks
const NEARBY_RADIUS_KM = 2;

export function livabilityScore(amenitiesCsv: string, neighbourhood: { distanceKm: number }[]): number {
  const amenityCount = amenitiesCsv ? amenitiesCsv.split(',').filter(Boolean).length : 0;
  const nearCount = neighbourhood.filter((n) => n.distanceKm <= NEARBY_RADIUS_KM).length;
  // Weighted 60/40 toward what is inside the property, since that is what the
  // seller is actually offering; nearby facilities are a property of the area.
  const amenityShare = Math.min(1, amenityCount / AMENITY_CEILING) * 60;
  const nearShare = Math.min(1, nearCount / NEARBY_CEILING) * 40;
  return Math.round(amenityShare + nearShare);
}

/** Says what the number counted, in the citizen's words. Shipped alongside it. */
export function livabilityBasis(amenitiesCsv: string, neighbourhood: { distanceKm: number }[]): string {
  const amenityCount = amenitiesCsv ? amenitiesCsv.split(',').filter(Boolean).length : 0;
  const nearCount = neighbourhood.filter((n) => n.distanceKm <= NEARBY_RADIUS_KM).length;
  return `Counts ${amenityCount} listed amenit${amenityCount === 1 ? 'y' : 'ies'} and `
    + `${nearCount} facilit${nearCount === 1 ? 'y' : 'ies'} within ${NEARBY_RADIUS_KM} km, `
    + `as reported by the seller. It is not a survey, an inspection, or a rating of the area.`;
}


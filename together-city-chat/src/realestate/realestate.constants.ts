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


export function livabilityScore(amenitiesCsv: string, neighbourhood: { distanceKm: number }[]): number {
  const amenityCount = amenitiesCsv ? amenitiesCsv.split(',').filter(Boolean).length : 0;
  const nearBonus = neighbourhood.filter((n) => n.distanceKm <= 2).length * 6;
  return Math.min(100, Math.round(52 + amenityCount * 3.2 + nearBonus));
}


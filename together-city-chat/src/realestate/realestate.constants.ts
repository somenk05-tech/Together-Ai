/**
 * Together City — Real Estate constants.
 * Shared vocabulary for property listings (types, furnishing, facings, amenities)
 * and the seed catalogue used to populate the browse + under-construction tabs.
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

/** Seeded neighbourhood points (metro/school/hospital/mall) for the livability layer. */
export const NEIGHBOURHOODS: Record<string, { label: string; kind: string; distanceKm: number }[]> = {
  re_ready_1: [{ label: 'Whitefield Metro', kind: 'metro', distanceKm: 1.2 }, { label: 'Vydehi School', kind: 'school', distanceKm: 0.8 }, { label: 'Manipal Hospital', kind: 'hospital', distanceKm: 2.1 }, { label: 'Phoenix Mall', kind: 'mall', distanceKm: 1.6 }],
  re_ready_2: [{ label: 'Powai Metro (planned)', kind: 'metro', distanceKm: 0.9 }, { label: 'Hiranandani School', kind: 'school', distanceKm: 0.6 }, { label: 'Hiranandani Hospital', kind: 'hospital', distanceKm: 1.0 }, { label: 'R City Mall', kind: 'mall', distanceKm: 2.4 }],
  re_ready_3: [{ label: 'Gachibowli ORR', kind: 'metro', distanceKm: 2.0 }, { label: 'DPS School', kind: 'school', distanceKm: 1.1 }, { label: 'Continental Hospital', kind: 'hospital', distanceKm: 1.8 }],
  re_uc_1: [{ label: 'Hebbal Metro (u/c)', kind: 'metro', distanceKm: 1.4 }, { label: 'Vidyaniketan School', kind: 'school', distanceKm: 1.0 }, { label: 'Baptist Hospital', kind: 'hospital', distanceKm: 2.3 }, { label: 'Esteem Mall', kind: 'mall', distanceKm: 1.2 }],
  re_uc_2: [{ label: 'Hinjewadi Metro (u/c)', kind: 'metro', distanceKm: 1.1 }, { label: 'Blue Ridge School', kind: 'school', distanceKm: 0.7 }, { label: 'Ruby Hall Clinic', kind: 'hospital', distanceKm: 2.6 }],
};

export function livabilityScore(amenitiesCsv: string, neighbourhood: { distanceKm: number }[]): number {
  const amenityCount = amenitiesCsv ? amenitiesCsv.split(',').filter(Boolean).length : 0;
  const nearBonus = neighbourhood.filter((n) => n.distanceKm <= 2).length * 6;
  return Math.min(100, Math.round(52 + amenityCount * 3.2 + nearBonus));
}

/** A tiny inline SVG cover so seeds render without external assets. */
export const seedPhoto = (label: string, hue: number): string =>
  `data:image/svg+xml;utf8,` + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='520'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},45%,72%)'/><stop offset='1' stop-color='hsl(${hue + 30},50%,52%)'/></linearGradient></defs>` +
    `<rect width='800' height='520' fill='url(#g)'/>` +
    `<text x='40' y='470' font-family='Georgia' font-size='34' fill='rgba(255,255,255,.92)'>${label}</text></svg>`,
  );

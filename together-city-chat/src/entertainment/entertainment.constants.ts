/**
 * Together City — Entertainment constants & seed catalogue.
 * Categories, a poster generator, and the seeded events that populate Discover.
 */

export const CATEGORIES = [
  { key: 'movies', label: 'Movies', icon: '🎬', hue: 265 },
  { key: 'concerts', label: 'Concerts', icon: '🎵', hue: 320 },
  { key: 'comedy', label: 'Comedy', icon: '🎤', hue: 35 },
  { key: 'theatre', label: 'Theatre', icon: '🎭', hue: 210 },
  { key: 'sports', label: 'Sports', icon: '🏏', hue: 140 },
  { key: 'experiences', label: 'Experiences', icon: '✨', hue: 190 },
] as const;
export const CATEGORY_META: Record<string, { label: string; icon: string; hue: number }> =
  Object.fromEntries(CATEGORIES.map((c) => [c.key, { label: c.label, icon: c.icon, hue: c.hue }]));

/** Inline SVG poster so seeds render with no external assets. */
export const poster = (title: string, hue: number): string =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='860'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},60%,32%)'/><stop offset='1' stop-color='hsl(${hue + 40},70%,18%)'/></linearGradient></defs>` +
    `<rect width='640' height='860' fill='url(#g)'/>` +
    `<text x='40' y='790' font-family='Georgia' font-size='40' fill='rgba(255,255,255,.95)'>${title}</text></svg>`,
  );

export interface EventSeed {
  id: string; title: string; category: string; venue: string; city: string;
  date: string; time: string; description: string; priceFromInr: number;
  tiers: { name: string; priceInr: number; available: number }[];
}

export const EVENT_SEEDS: EventSeed[] = [
  { id: 'ev_arijit', title: 'Arijit Singh Live', category: 'concerts', venue: 'DY Patil Stadium', city: 'Mumbai', date: '2026-08-22', time: '7:00 PM', description: 'An evening of soul-stirring melodies with India’s most-loved playback voice, backed by a 20-piece live band.', priceFromInr: 1999, tiers: [{ name: 'Silver', priceInr: 1999, available: 500 }, { name: 'Gold', priceInr: 3499, available: 220 }, { name: 'Platinum (Fan Pit)', priceInr: 5999, available: 60 }] },
  { id: 'ev_dune', title: 'Dune: Part Three (IMAX)', category: 'movies', venue: 'PVR IMAX Orion', city: 'Bengaluru', date: '2026-08-02', time: '9:30 PM', description: 'The saga concludes on the largest IMAX screen in the city. Dolby Atmos, recliner seating.', priceFromInr: 350, tiers: [{ name: 'Standard', priceInr: 350, available: 120 }, { name: 'Premium Recliner', priceInr: 750, available: 40 }] },
  { id: 'ev_zakir', title: 'Zakir Khan — Tathastu', category: 'comedy', venue: 'Good Shepherd Auditorium', city: 'Bengaluru', date: '2026-08-09', time: '8:00 PM', description: 'Storytelling stand-up that feels like a heart-to-heart with an old friend. Hindi.', priceFromInr: 799, tiers: [{ name: 'Balcony', priceInr: 799, available: 180 }, { name: 'Lower', priceInr: 1299, available: 90 }, { name: 'Front Rows', priceInr: 1999, available: 30 }] },
  { id: 'ev_mughal', title: 'Mughal-e-Azam — The Musical', category: 'theatre', venue: 'Jamshed Bhabha Theatre', city: 'Mumbai', date: '2026-08-16', time: '7:30 PM', description: 'A grand Broadway-style staging of the epic, with live orchestra and 100+ performers.', priceFromInr: 1500, tiers: [{ name: 'Rear Stalls', priceInr: 1500, available: 200 }, { name: 'Mid Stalls', priceInr: 2500, available: 120 }, { name: 'Premium', priceInr: 4000, available: 50 }] },
  { id: 'ev_rcbmi', title: 'RCB vs MI — T20 Night', category: 'sports', venue: 'M. Chinnaswamy Stadium', city: 'Bengaluru', date: '2026-08-28', time: '7:30 PM', description: 'Marquee T20 clash under lights. Bring the noise.', priceFromInr: 1200, tiers: [{ name: 'General', priceInr: 1200, available: 4000 }, { name: 'Premium Stand', priceInr: 3000, available: 800 }, { name: 'Corporate Box', priceInr: 8000, available: 60 }] },
  { id: 'ev_hotair', title: 'Sunrise Hot-Air Balloon', category: 'experiences', venue: 'Nandi Hills', city: 'Bengaluru', date: '2026-08-10', time: '5:30 AM', description: 'A 60-minute sunrise flight over the hills, with breakfast on landing.', priceFromInr: 8500, tiers: [{ name: 'Shared Basket', priceInr: 8500, available: 24 }, { name: 'Private (2 pax)', priceInr: 22000, available: 6 }] },
  { id: 'ev_indie', title: 'Indie Night: The Local Train', category: 'concerts', venue: 'Phoenix Marketcity', city: 'Pune', date: '2026-08-14', time: '8:00 PM', description: 'The best of Hindi indie-rock, live and loud.', priceFromInr: 999, tiers: [{ name: 'GA Standing', priceInr: 999, available: 700 }, { name: 'Gold Standing', priceInr: 1799, available: 200 }] },
  { id: 'ev_kunal', title: 'Kunal Kamra — New Material', category: 'comedy', venue: 'St. Andrew’s Auditorium', city: 'Mumbai', date: '2026-08-19', time: '9:00 PM', description: 'Sharp, topical stand-up. English/Hindi.', priceFromInr: 999, tiers: [{ name: 'Balcony', priceInr: 999, available: 150 }, { name: 'Orchestra', priceInr: 1599, available: 80 }] },
];

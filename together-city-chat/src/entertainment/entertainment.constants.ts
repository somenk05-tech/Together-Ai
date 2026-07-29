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

/* EVENT_SEEDS removed 2026-07-29.
 * It listed ticketed events under the names of real performers, real venues,
 * a real fixture and a real film, with prices and seat counts — none of which
 * existed. Nothing imported it, so no behaviour changes here; EntertainmentService
 * clears any rows an earlier deploy created. Event listings must come from a
 * ticketing provider or from organisers posting them, never from a constant.
 * Removed ids: ev_arijit, ev_dune, ev_zakir, ev_mughal, ev_rcbmi, ev_hotair, ev_indie, ev_kunal
 */

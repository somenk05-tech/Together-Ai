/**
 * Together City — Travel constants & seed catalogue.
 * Categories, a hero-image generator, and the seeded curated packages.
 */

export const CATEGORIES = [
  { key: 'beach', label: 'Beaches', icon: '🏖', hue: 195 },
  { key: 'mountains', label: 'Mountains', icon: '⛰', hue: 210 },
  { key: 'heritage', label: 'Heritage', icon: '🏛', hue: 35 },
  { key: 'international', label: 'International', icon: '✈️', hue: 265 },
  { key: 'weekend', label: 'Weekend', icon: '🧳', hue: 140 },
  { key: 'wildlife', label: 'Wildlife', icon: '🐯', hue: 95 },
] as const;
export const CATEGORY_META: Record<string, { label: string; icon: string; hue: number }> =
  Object.fromEntries(CATEGORIES.map((c) => [c.key, { label: c.label, icon: c.icon, hue: c.hue }]));

export const hero = (_title: string, hue: number): string =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='560'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},55%,60%)'/><stop offset='1' stop-color='hsl(${hue + 35},60%,38%)'/></linearGradient></defs>` +
    `<rect width='900' height='560' fill='url(#g)'/>` +
    `<circle cx='740' cy='120' r='90' fill='rgba(255,255,255,.10)'/>` +
    `<circle cx='120' cy='470' r='140' fill='rgba(0,0,0,.08)'/></svg>`,
  );

export interface PackageSeed {
  id: string; title: string; destination: string; country: string; category: string;
  nights: number; days: number; priceFromInr: number; summary: string;
  highlights: string[]; inclusions: string[];
  itinerary: { day: number; title: string; detail: string }[];
  tiers: { name: string; priceInr: number; perks: string }[];
}

export const PACKAGE_SEEDS: PackageSeed[] = [
  {
    id: 'tp_bali', title: 'Bali Bliss', destination: 'Bali', country: 'Indonesia', category: 'international',
    nights: 5, days: 6, priceFromInr: 62000, summary: 'Rice terraces, temples and beach clubs — the classic Bali escape.',
    highlights: ['Ubud rice terraces', 'Uluwatu sunset & Kecak dance', 'Nusa Penida day trip', 'Seminyak beach clubs'],
    inclusions: ['5 nights stay', 'Daily breakfast', 'Airport transfers', 'Nusa Penida tour', 'Return flights'],
    itinerary: [
      { day: 1, title: 'Arrive in Denpasar', detail: 'Transfer to Seminyak, evening at the beach.' },
      { day: 2, title: 'Ubud & rice terraces', detail: 'Tegallalang, Monkey Forest, art villages.' },
      { day: 3, title: 'Nusa Penida', detail: 'Kelingking Beach, snorkelling at Crystal Bay.' },
      { day: 4, title: 'Uluwatu', detail: 'Cliff temple, Kecak fire dance at sunset.' },
      { day: 5, title: 'Free day', detail: 'Spa, surf lessons or beach-club lounging.' },
      { day: 6, title: 'Departure', detail: 'Transfer to the airport.' },
    ],
    tiers: [{ name: 'Standard', priceInr: 62000, perks: '4★ hotels, group tours' }, { name: 'Deluxe', priceInr: 92000, perks: '5★ resort, private tours' }, { name: 'Luxury', priceInr: 148000, perks: 'Private pool villa, butler, seaplane' }],
  },
  {
    id: 'tp_ladakh', title: 'Ladakh Adventure', destination: 'Leh–Ladakh', country: 'India', category: 'mountains',
    nights: 6, days: 7, priceFromInr: 38000, summary: 'High passes, turquoise lakes and monasteries in the Himalayas.',
    highlights: ['Pangong Lake', 'Nubra Valley & Khardung La', 'Thiksey Monastery', 'Magnetic Hill'],
    inclusions: ['6 nights stay', 'All meals', 'Inner-line permits', 'Oxygen support', 'SUV with driver'],
    itinerary: [
      { day: 1, title: 'Arrive Leh', detail: 'Acclimatisation day, easy walk in old town.' },
      { day: 2, title: 'Leh sightseeing', detail: 'Shanti Stupa, Leh Palace, Magnetic Hill.' },
      { day: 3, title: 'Nubra Valley', detail: 'Over Khardung La to the sand dunes of Hunder.' },
      { day: 4, title: 'Pangong Lake', detail: 'Scenic drive to the famous blue lake.' },
      { day: 5, title: 'Monasteries', detail: 'Thiksey and Hemis; return to Leh.' },
      { day: 6, title: 'Free day', detail: 'Cafés, shopping, optional rafting.' },
      { day: 7, title: 'Departure', detail: 'Transfer to Leh airport.' },
    ],
    tiers: [{ name: 'Standard', priceInr: 38000, perks: 'Guesthouses, shared SUV' }, { name: 'Deluxe', priceInr: 56000, perks: 'Boutique stays, private SUV' }, { name: 'Luxury', priceInr: 92000, perks: 'Luxury camps, premium SUV' }],
  },
  {
    id: 'tp_kerala', title: 'Kerala Backwaters', destination: 'Kerala', country: 'India', category: 'beach',
    nights: 4, days: 5, priceFromInr: 28000, summary: 'Houseboats, tea hills and Arabian-sea beaches.',
    highlights: ['Alleppey houseboat night', 'Munnar tea gardens', 'Kathakali performance', 'Kovalam beach'],
    inclusions: ['4 nights stay', 'Houseboat with meals', 'Daily breakfast', 'Airport transfers'],
    itinerary: [
      { day: 1, title: 'Kochi', detail: 'Fort Kochi, Chinese fishing nets, Kathakali show.' },
      { day: 2, title: 'Munnar', detail: 'Tea plantations and misty viewpoints.' },
      { day: 3, title: 'Alleppey', detail: 'Overnight on a private houseboat.' },
      { day: 4, title: 'Kovalam', detail: 'Relax on the beach; Ayurvedic spa.' },
      { day: 5, title: 'Departure', detail: 'Transfer to Trivandrum airport.' },
    ],
    tiers: [{ name: 'Standard', priceInr: 28000, perks: '3★ stays, shared houseboat' }, { name: 'Deluxe', priceInr: 44000, perks: '4★ resorts, private houseboat' }, { name: 'Luxury', priceInr: 72000, perks: '5★ backwater resort, premium boat' }],
  },
  {
    id: 'tp_rajasthan', title: 'Royal Rajasthan', destination: 'Jaipur–Udaipur', country: 'India', category: 'heritage',
    nights: 5, days: 6, priceFromInr: 34000, summary: 'Forts, palaces and lake sunsets across the land of kings.',
    highlights: ['Amber Fort', 'City Palace, Udaipur', 'Lake Pichola boat ride', 'Desert dinner'],
    inclusions: ['5 nights stay', 'Daily breakfast', 'Heritage entry passes', 'AC car with driver'],
    itinerary: [
      { day: 1, title: 'Jaipur', detail: 'Hawa Mahal, local bazaars.' },
      { day: 2, title: 'Amber Fort', detail: 'Fort, Jal Mahal, City Palace.' },
      { day: 3, title: 'Pushkar', detail: 'Brahma temple and the holy lake.' },
      { day: 4, title: 'Udaipur', detail: 'City Palace and Lake Pichola cruise.' },
      { day: 5, title: 'Kumbhalgarh', detail: 'The great wall of India; folk dinner.' },
      { day: 6, title: 'Departure', detail: 'Transfer to Udaipur airport.' },
    ],
    tiers: [{ name: 'Standard', priceInr: 34000, perks: 'Heritage hotels 3★' }, { name: 'Deluxe', priceInr: 52000, perks: 'Palace-style 4★' }, { name: 'Luxury', priceInr: 98000, perks: 'Royal palace suites' }],
  },
  {
    id: 'tp_coorg', title: 'Coorg Weekend', destination: 'Coorg', country: 'India', category: 'weekend',
    nights: 2, days: 3, priceFromInr: 12000, summary: 'Coffee estates, waterfalls and misty mornings — a quick reset.',
    highlights: ['Abbey Falls', 'Coffee estate walk', 'Raja’s Seat sunset', 'Dubare elephant camp'],
    inclusions: ['2 nights stay', 'Daily breakfast', 'Estate tour', 'Transfers'],
    itinerary: [
      { day: 1, title: 'Arrive Coorg', detail: 'Estate check-in, evening at Raja’s Seat.' },
      { day: 2, title: 'Falls & camp', detail: 'Abbey Falls, Dubare elephant camp, coffee tasting.' },
      { day: 3, title: 'Departure', detail: 'Leisurely breakfast and drive back.' },
    ],
    tiers: [{ name: 'Standard', priceInr: 12000, perks: 'Homestay' }, { name: 'Deluxe', priceInr: 20000, perks: 'Estate resort' }, { name: 'Luxury', priceInr: 34000, perks: 'Private villa, spa' }],
  },
  {
    id: 'tp_dubai', title: 'Dubai Getaway', destination: 'Dubai', country: 'UAE', category: 'international',
    nights: 4, days: 5, priceFromInr: 58000, summary: 'Skyline, desert and gold — the glitziest short-haul escape.',
    highlights: ['Burj Khalifa', 'Desert safari', 'Dhow cruise dinner', 'Palm Jumeirah'],
    inclusions: ['4 nights stay', 'Daily breakfast', 'Desert safari', 'Burj Khalifa tickets', 'Return flights'],
    itinerary: [
      { day: 1, title: 'Arrive Dubai', detail: 'Marina walk, evening at Dubai Mall fountains.' },
      { day: 2, title: 'City tour', detail: 'Burj Khalifa, old Dubai souks, Frame.' },
      { day: 3, title: 'Desert safari', detail: 'Dune bashing, BBQ dinner, belly dance.' },
      { day: 4, title: 'Leisure', detail: 'Palm Jumeirah, Atlantis, dhow cruise.' },
      { day: 5, title: 'Departure', detail: 'Transfer to the airport.' },
    ],
    tiers: [{ name: 'Standard', priceInr: 58000, perks: '4★ hotel, group tours' }, { name: 'Deluxe', priceInr: 88000, perks: '5★ hotel, private tours' }, { name: 'Luxury', priceInr: 156000, perks: 'Palm resort, yacht evening' }],
  },
  {
    id: 'tp_ranthambore', title: 'Ranthambore Wild', destination: 'Ranthambore', country: 'India', category: 'wildlife',
    nights: 2, days: 3, priceFromInr: 22000, summary: 'Big-cat country — safaris in one of India’s best tiger reserves.',
    highlights: ['Two jungle safaris', 'Ranthambore Fort', 'Birdwatching', 'Naturalist guide'],
    inclusions: ['2 nights stay', 'All meals', '2 safaris', 'Park fees & guide'],
    itinerary: [
      { day: 1, title: 'Arrive & evening safari', detail: 'Check-in, afternoon jeep safari.' },
      { day: 2, title: 'Morning safari & fort', detail: 'Dawn safari, then the historic fort.' },
      { day: 3, title: 'Departure', detail: 'Breakfast and transfer out.' },
    ],
    tiers: [{ name: 'Standard', priceInr: 22000, perks: 'Lodge, shared jeep' }, { name: 'Deluxe', priceInr: 34000, perks: 'Resort, private jeep' }, { name: 'Luxury', priceInr: 58000, perks: 'Luxury tented camp, private naturalist' }],
  },
];

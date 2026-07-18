/**
 * Restaurants Hub — constants.
 * Cuisines, a hero-image generator, a diet-compatibility map (shared with Nutrition),
 * and the seeded restaurants with full menus.
 */

export interface CuisineMeta { key: string; label: string; icon: string; hue: number; }
export const CUISINES: CuisineMeta[] = [
  { key: 'north-indian', label: 'North Indian', icon: '🍛', hue: 28 },
  { key: 'south-indian', label: 'South Indian', icon: '🥞', hue: 45 },
  { key: 'italian', label: 'Italian', icon: '🍝', hue: 8 },
  { key: 'chinese', label: 'Chinese', icon: '🥡', hue: 350 },
  { key: 'japanese', label: 'Japanese', icon: '🍣', hue: 200 },
  { key: 'cafe', label: 'Café', icon: '☕', hue: 22 },
  { key: 'biryani', label: 'Biryani', icon: '🍚', hue: 34 },
  { key: 'street', label: 'Street Food', icon: '🌮', hue: 15 },
];
export const CUISINE_META: Record<string, CuisineMeta> = Object.fromEntries(CUISINES.map((c) => [c.key, c]));

/** Diet compatibility — mirrors Nutrition's allow-map. A user with diet X can eat these dish diets. */
export const DIET_ALLOW: Record<string, string[]> = {
  everything: ['veg', 'nonveg', 'pesc', 'egg', 'vegan', 'jain'],
  nonveg: ['veg', 'nonveg', 'pesc', 'egg', 'vegan', 'jain'],
  pesc: ['veg', 'pesc', 'egg', 'vegan', 'jain'],
  egg: ['veg', 'egg', 'vegan', 'jain'],
  veg: ['veg', 'vegan', 'jain'],
  vegan: ['vegan'],
  jain: ['jain', 'vegan'],
};
export const DIET_LABEL: Record<string, string> = {
  veg: 'Veg', nonveg: 'Non-veg', pesc: 'Seafood', egg: 'Egg', vegan: 'Vegan', jain: 'Jain',
};

/** Generated gradient hero (no external images/API). */
export const hero = (_name: string, hue: number): string =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='540'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},62%,58%)'/><stop offset='1' stop-color='hsl(${hue + 24},58%,36%)'/></linearGradient></defs>` +
    `<rect width='900' height='540' fill='url(#g)'/>` +
    `<circle cx='730' cy='120' r='96' fill='rgba(255,255,255,.10)'/>` +
    `<circle cx='140' cy='450' r='150' fill='rgba(0,0,0,.08)'/></svg>`,
  );

export interface Dish { id: string; name: string; desc: string; priceInr: number; diet: string; section: string; bestseller?: boolean; spicy?: boolean; }
export interface RestaurantSeed {
  id: string; name: string; cuisine: string; area: string; city: string;
  rating: number; priceForTwoInr: number; tagline: string; openHours: string;
  vegFriendly: boolean; menu: Dish[];
}

const S = (section: string) => section; // readability

export const RESTAURANT_SEEDS: RestaurantSeed[] = [
  {
    id: 'rst_saffron', name: 'Saffron House', cuisine: 'north-indian', area: 'Indiranagar', city: 'Bengaluru',
    rating: 4.6, priceForTwoInr: 1400, tagline: 'Slow-cooked Mughlai & tandoor classics', openHours: '12:00–23:00', vegFriendly: true,
    menu: [
      { id: 'd1', name: 'Dal Makhani', desc: 'Black lentils simmered overnight, finished with cream', priceInr: 340, diet: 'veg', section: S('Mains'), bestseller: true },
      { id: 'd2', name: 'Paneer Tikka', desc: 'Char-grilled cottage cheese, mint chutney', priceInr: 380, diet: 'veg', section: S('Starters') },
      { id: 'd3', name: 'Butter Chicken', desc: 'Tandoori chicken in a silky tomato-butter gravy', priceInr: 460, diet: 'nonveg', section: S('Mains'), bestseller: true },
      { id: 'd4', name: 'Mutton Rogan Josh', desc: 'Kashmiri-spiced slow-braised mutton', priceInr: 520, diet: 'nonveg', section: S('Mains'), spicy: true },
      { id: 'd5', name: 'Garlic Naan', desc: 'Clay-oven flatbread, roasted garlic', priceInr: 90, diet: 'veg', section: S('Breads') },
      { id: 'd6', name: 'Gulab Jamun', desc: 'Warm milk dumplings in rose syrup', priceInr: 160, diet: 'veg', section: S('Dessert') },
    ],
  },
  {
    id: 'rst_dosa', name: 'Dakshin Tiffin', cuisine: 'south-indian', area: 'Malleshwaram', city: 'Bengaluru',
    rating: 4.7, priceForTwoInr: 600, tagline: 'Crisp dosas & filter coffee, all day', openHours: '07:00–22:00', vegFriendly: true,
    menu: [
      { id: 'd1', name: 'Masala Dosa', desc: 'Crisp rice crêpe, potato masala, two chutneys', priceInr: 150, diet: 'veg', section: S('Dosas'), bestseller: true },
      { id: 'd2', name: 'Idli Vada Combo', desc: 'Two idlis, one vada, sambar', priceInr: 130, diet: 'veg', section: S('Tiffin') },
      { id: 'd3', name: 'Ghee Podi Idli', desc: 'Idli tossed in gunpowder & ghee', priceInr: 160, diet: 'veg', section: S('Tiffin'), spicy: true },
      { id: 'd4', name: 'Rava Kesari', desc: 'Saffron semolina halwa', priceInr: 90, diet: 'veg', section: S('Dessert') },
      { id: 'd5', name: 'Filter Coffee', desc: 'Chicory-blend, steel tumbler', priceInr: 60, diet: 'vegan', section: S('Drinks'), bestseller: true },
    ],
  },
  {
    id: 'rst_trattoria', name: 'Trattoria Nova', cuisine: 'italian', area: 'Koramangala', city: 'Bengaluru',
    rating: 4.5, priceForTwoInr: 1800, tagline: 'Wood-fired pizza & fresh pasta', openHours: '12:30–23:30', vegFriendly: true,
    menu: [
      { id: 'd1', name: 'Margherita', desc: 'San Marzano, fior di latte, basil', priceInr: 480, diet: 'veg', section: S('Pizza'), bestseller: true },
      { id: 'd2', name: 'Penne Arrabbiata', desc: 'Chilli-garlic tomato, pecorino', priceInr: 440, diet: 'vegan', section: S('Pasta'), spicy: true },
      { id: 'd3', name: 'Spaghetti Carbonara', desc: 'Guanciale, egg, black pepper', priceInr: 560, diet: 'egg', section: S('Pasta') },
      { id: 'd4', name: 'Prawn Aglio e Olio', desc: 'Garlic, olive oil, chilli, prawns', priceInr: 640, diet: 'pesc', section: S('Pasta') },
      { id: 'd5', name: 'Tiramisu', desc: 'Mascarpone, espresso, cocoa', priceInr: 300, diet: 'egg', section: S('Dessert'), bestseller: true },
    ],
  },
  {
    id: 'rst_wok', name: 'Golden Wok', cuisine: 'chinese', area: 'HSR Layout', city: 'Bengaluru',
    rating: 4.3, priceForTwoInr: 1100, tagline: 'Cantonese & Sichuan, high-heat wok', openHours: '12:00–23:00', vegFriendly: true,
    menu: [
      { id: 'd1', name: 'Veg Hakka Noodles', desc: 'Wok-tossed noodles, julienne veg', priceInr: 260, diet: 'veg', section: S('Noodles'), bestseller: true },
      { id: 'd2', name: 'Chilli Paneer', desc: 'Crisp paneer, capsicum, spring onion', priceInr: 320, diet: 'veg', section: S('Starters'), spicy: true },
      { id: 'd3', name: 'Kung Pao Chicken', desc: 'Peanuts, dried chilli, Sichuan pepper', priceInr: 380, diet: 'nonveg', section: S('Mains'), spicy: true },
      { id: 'd4', name: 'Prawn Fried Rice', desc: 'Egg, prawns, scallion', priceInr: 360, diet: 'pesc', section: S('Rice') },
      { id: 'd5', name: 'Darsaan', desc: 'Honey-glazed noodles, vanilla ice cream', priceInr: 220, diet: 'egg', section: S('Dessert') },
    ],
  },
  {
    id: 'rst_sushi', name: 'Umi Omakase', cuisine: 'japanese', area: 'UB City', city: 'Bengaluru',
    rating: 4.8, priceForTwoInr: 3200, tagline: 'Edomae sushi & robata, chef-led', openHours: '18:00–23:30', vegFriendly: true,
    menu: [
      { id: 'd1', name: 'Edamame', desc: 'Steamed, sea salt', priceInr: 260, diet: 'vegan', section: S('Small Plates') },
      { id: 'd2', name: 'Avocado Maki', desc: 'Six-piece, nori, sushi rice', priceInr: 420, diet: 'vegan', section: S('Sushi'), bestseller: true },
      { id: 'd3', name: 'Salmon Nigiri', desc: 'Two-piece, Norwegian salmon', priceInr: 520, diet: 'pesc', section: S('Sushi'), bestseller: true },
      { id: 'd4', name: 'Chicken Teriyaki', desc: 'Robata-grilled, tare glaze', priceInr: 560, diet: 'nonveg', section: S('Robata') },
      { id: 'd5', name: 'Matcha Cheesecake', desc: 'Uji matcha, cream cheese', priceInr: 340, diet: 'egg', section: S('Dessert') },
    ],
  },
  {
    id: 'rst_cafe', name: 'Ellis & Co.', cuisine: 'cafe', area: 'Church Street', city: 'Bengaluru',
    rating: 4.4, priceForTwoInr: 900, tagline: 'Specialty coffee & all-day brunch', openHours: '08:00–22:30', vegFriendly: true,
    menu: [
      { id: 'd1', name: 'Avocado Toast', desc: 'Sourdough, smashed avo, chilli flakes', priceInr: 320, diet: 'vegan', section: S('Brunch'), bestseller: true },
      { id: 'd2', name: 'Big Breakfast', desc: 'Eggs, sausage, hash, beans, toast', priceInr: 440, diet: 'nonveg', section: S('Brunch') },
      { id: 'd3', name: 'Shakshuka', desc: 'Baked eggs, spiced tomato, feta', priceInr: 380, diet: 'egg', section: S('Brunch'), spicy: true },
      { id: 'd4', name: 'Flat White', desc: 'Double ristretto, silky milk', priceInr: 240, diet: 'veg', section: S('Coffee'), bestseller: true },
      { id: 'd5', name: 'Vegan Banana Bread', desc: 'Walnut, dark chocolate', priceInr: 220, diet: 'vegan', section: S('Bakery') },
    ],
  },
  {
    id: 'rst_biryani', name: 'Nizam Biryani House', cuisine: 'biryani', area: 'Frazer Town', city: 'Bengaluru',
    rating: 4.6, priceForTwoInr: 800, tagline: 'Dum-cooked Hyderabadi biryani', openHours: '11:30–23:00', vegFriendly: true,
    menu: [
      { id: 'd1', name: 'Chicken Dum Biryani', desc: 'Sealed-pot, saffron, fried onion', priceInr: 320, diet: 'nonveg', section: S('Biryani'), bestseller: true, spicy: true },
      { id: 'd2', name: 'Mutton Biryani', desc: 'Slow-dum, bone-in mutton', priceInr: 420, diet: 'nonveg', section: S('Biryani'), spicy: true },
      { id: 'd3', name: 'Veg Dum Biryani', desc: 'Basmati, seasonal veg, mint', priceInr: 260, diet: 'veg', section: S('Biryani') },
      { id: 'd4', name: 'Prawn Biryani', desc: 'Coastal-spiced prawns, basmati', priceInr: 460, diet: 'pesc', section: S('Biryani') },
      { id: 'd5', name: 'Double Ka Meetha', desc: 'Saffron bread pudding', priceInr: 150, diet: 'veg', section: S('Dessert') },
    ],
  },
  {
    id: 'rst_chaat', name: 'Chowpatty Chaat Bar', cuisine: 'street', area: 'Jayanagar', city: 'Bengaluru',
    rating: 4.2, priceForTwoInr: 400, tagline: 'Mumbai street food, done clean', openHours: '16:00–23:00', vegFriendly: true,
    menu: [
      { id: 'd1', name: 'Pani Puri', desc: 'Six-piece, spiced water, tamarind', priceInr: 90, diet: 'vegan', section: S('Chaat'), bestseller: true, spicy: true },
      { id: 'd2', name: 'Sev Puri', desc: 'Crisp puris, chutneys, sev', priceInr: 110, diet: 'veg', section: S('Chaat') },
      { id: 'd3', name: 'Vada Pav', desc: 'Batata vada, garlic chutney, pav', priceInr: 70, diet: 'veg', section: S('Snacks'), bestseller: true },
      { id: 'd4', name: 'Pav Bhaji', desc: 'Buttery mash, toasted pav', priceInr: 160, diet: 'veg', section: S('Snacks'), spicy: true },
      { id: 'd5', name: 'Kulfi Falooda', desc: 'Saffron kulfi, vermicelli, rose', priceInr: 130, diet: 'veg', section: S('Dessert') },
    ],
  },
];

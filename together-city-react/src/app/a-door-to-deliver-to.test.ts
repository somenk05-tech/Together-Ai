import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A DOOR TO DELIVER TO, AND EVERYTHING BOUGHT IN ONE LIST ─────────────────
 *
 * Owner, 7 Sep: "add a detailed delivery address to be saved, and show the
 * delivery address if it is already saved; also create a page for all past
 * orders."
 *
 * Four things this holds. The cart asks for a door and will not take money
 * without one. The door is saved WHOLE — name, phone, street, landmark, city,
 * state, PIN — under one page of the book the city already keeps, and shown
 * back when it exists. Every till's order carries the door's label, so the
 * server can keep a snapshot on the receipt. And the orders page is a view
 * over each shop's own history, in the store's own look, saying where each
 * one went.
 */
describe('the cart asks for a door', () => {
  const cart = code('features/ecommerce/pages/CityCart.tsx');
  const door = code('features/ecommerce/store/DeliveryAddress.tsx');

  it('draws the address block above the total, and Pay waits for a chosen door', () => {
    expect(cart.indexOf('<DeliveryAddress chosen={door} onChoose={setDoor} />')).toBeLessThan(cart.indexOf('className="st-sum"'));
    expect(cart).toMatch(/disabled=\{cart\.paying \|\| door === null\}/);
    expect(cart).toMatch(/cart\.payAll\(method, door \?\? undefined\)/);
  });

  it('asks for the whole door, in the book\'s own fields, and saves it under one label', () => {
    for (const field of ['name', 'phone', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode']) {
      expect({ field, asked: new RegExp(`onChange=\\{set\\('${field}'\\)\\}`).test(door) }).toEqual({ field, asked: true });
    }
    expect(door).toMatch(/save\.mutate\(\{ label, address: draft \}/);
    expect(code('features/profile/api.ts')).toMatch(/api\.put<\{ addresses: SavedAddressView\[\] \}>\(`\/profile\/addresses\/\$\{label\}`, dto\)/);
    // The three pages of the book, and nothing else — the server refuses a fourth.
    expect(door).toMatch(/\{ key: 'home', word: 'Home' \},\s*\{ key: 'work', word: 'Work' \},\s*\{ key: 'other', word: 'Other' \}/);
  });

  it('shows a saved door back, chosen for them when there is one', () => {
    expect(door).toMatch(/<span className="sf-door-text">\{d\.addressText\}<\/span>/);
    expect(door).toMatch(/if \(chosen === null && first && editing === null\) onChoose\(first\);/);
    // And says what the server would refuse before the round trip.
    expect(door).toMatch(/\/\^\[1-9\]\[0-9\]\{5\}\$\//);
  });

  it('sends the door\'s label with every till\'s order, and never with the gem quote', () => {
    const city = code('features/ecommerce/store/useCityCart.ts');
    expect(city).toMatch(/const payAll = \(method: PayMethodChoice, addressLabel\?: string\) =>/);
    expect(city.match(/addressLabel/g)?.length).toBe(4);
    expect(city).toMatch(/await gemQuote\.mutateAsync\(\);/);
    expect(code('features/beauty/api.ts')).toMatch(/\{ items, method, addressLabel \}/);
    expect(code('api/store.api.ts')).toMatch(/addressLabel: v\.addressLabel/);
  });
});

describe('everything bought, in one list', () => {
  const page = code('features/ecommerce/pages/CityOrders.tsx');

  it('is the fourth room of the district, routed in the store\'s own look, and on the bar beside the cart', () => {
    expect(HUBS.ecommerce.items[3]?.path).toBe('/ecommerce/orders');
    const router = code('app/router.tsx');
    expect(router.indexOf("path: '/ecommerce/orders'")).toBeLessThan(router.indexOf('<HubLayout hub='));
    expect(page).toMatch(/useHubTheme\(null\)/);
    expect(page).toMatch(/<FloorPage floor=\{floor\} baglet=\{false\}>/);
    const floorFile = code('features/ecommerce/store/Floor.tsx');
    expect(floorFile).toMatch(/<Link to=\{ORDERS\.path\} className="st-bar-bag sf-orders-link"/);
    // The citizen's own two sit together at the right edge (owner, 7 Sep).
    expect(floorFile).toMatch(/<div className="sf-bar-mine">\s*<Link to=\{ORDERS\.path\}[\s\S]*?<Link to=\{CART\.path\}/);
    expect(read('styles/layout.css')).toMatch(/\.sf-bar-mine \{[^}]*margin-left: auto/);
  });

  /**
   * A DAY IS THE UNIT (owner, 7 Sep: "make the orders collapsible and
   * expandable based on the date"). Native <details>, the latest day open,
   * every other day one press away; each day says how many and how much.
   */
  it('folds the orders by the day they were placed, latest day open', () => {
    expect(page).toMatch(/<details key=\{day\.key\} className="sf-day" open=\{i === 0\}>/);
    expect(page).toMatch(/<summary className="sf-day-head">/);
    expect(page).toMatch(/\[\.\.\.days\.values\(\)\]\.sort\(\(a, b\) => b\.key\.localeCompare\(a\.key\)\)/);
    expect(page).toMatch(/\{day\.orders\.length\} order\{day\.orders\.length === 1 \? '' : 's'\}/);
    expect(page).toMatch(/\{rupees\(day\.totalInr\)\}/);
    // No checkout bar on a page about what is already bought.
    expect(page.match(/<FloorPage floor=\{floor\} baglet=\{false\}>/g)?.length).toBe(2);
  });

  it('reads each shop\'s own history and keeps nothing of its own', () => {
    expect(page).toMatch(/useBeautyOrders\(\)/);
    expect(page).toMatch(/useOrders\(\)/);
    expect(page).not.toMatch(/localStorage|useMutation|api\.post/);
    // Newest first, across shops.
    expect(page).toMatch(/\.sort\(\(a, b\) => b\.createdAt\.localeCompare\(a\.createdAt\)\)/);
  });

  it('says where each order went, from the receipt\'s own snapshot, or nothing', () => {
    expect(page).toMatch(/\{o\.address && \(/);
    expect(page).toMatch(/\{o\.address\.addressText\}/);
    expect(page).toMatch(/<p className="sf-order-door">/);
    // The shape the server keeps: a label, a name, a phone and the line.
    expect(code('features/beauty/api.ts')).toMatch(/export interface OrderAddress \{ label: string; name: string \| null; phone: string \| null; addressText: string \}/);
    expect(code('api/store.api.ts')).toMatch(/address: z\.object\(\{\s*label: z\.string\(\), name: z\.string\(\)\.nullable\(\), phone: z\.string\(\)\.nullable\(\), addressText: z\.string\(\),\s*\}\)\.nullable\(\)\.optional\(\)/);
  });

  it('every room of the district is declared once, in the storefront block', () => {
    const files = ['app/router.tsx', ...readdirSync(join(SRC, 'features'))
      .map((f) => `features/${f}/routes.tsx`)
      .filter((f) => existsSync(join(SRC, f)))];
    const declared = new Set(files.flatMap((f) => [...read(f).matchAll(/path: '([^']+)'/g)].map((m) => m[1])));
    for (const room of HUBS.ecommerce.items) {
      expect({ path: room.path, routed: declared.has(room.path) }).toEqual({ path: room.path, routed: true });
    }
  });
});

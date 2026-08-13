import type { ShareCard } from '@/api';

/** The shape a meal must have to be sent. Structurally the composer's
 *  ComposedMeal, declared narrowly so this file imports no page's types. */
export interface ShareableMeal {
  title: string;
  label: string;
  components: Array<{ name: string; recipeId: string; kcal: number }>;
  totals: { kcal: number; protein: number; carbs: number; fat: number };
}

/* ------------------------------------------------------------------ *
 * Shared-meal payload — a self-contained snapshot of a meal card that
 * travels inside the share deep link, so a recipient can open the WHOLE
 * meal on its own page (image, name, macros, every dish) and click each
 * dish through to its detailed recipe — without needing the sender's plan
 * or any server lookup.
 * ------------------------------------------------------------------ */

export interface SharedMealPayload {
  t: string;                             // meal title (e.g. "Grilled Peanut Butter Chicken Thali")
  l?: string;                            // meal label (Breakfast / Lunch / Dinner …)
  i?: string | null;                     // hero image url
  k?: number;                            // total kcal
  m?: string[];                          // macro chips (e.g. ["65g protein", …])
  d: Array<[string, string, number]>;    // dishes: [name, recipeId, kcal]
}

function toB64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode a meal into the compact token used in `/nutrition/shared-meal?d=<token>`. */
export function encodeMeal(p: SharedMealPayload): string {
  return toB64Url(JSON.stringify(p));
}

/* ══ THE CARD BUILDERS ═══════════════════════════════════════════════════════
   Every "send to chat" in this hub builds its card here, so a meal sent from a
   card, from a printed course and from the family sheet is the SAME card. This
   was already true of the meal builder in spirit — it lived in
   ComposedMealCard.tsx and the printed day, which replaced that card on both
   planners, had no send at all. A share affordance that exists on one surface
   and not on the surface that replaced it is worse than never having had it.
   ══════════════════════════════════════════════════════════════════════════ */

/** Build a rich, shareable card from a meal — its headline dish photo, the
 *  meal's name, calories and macros, deep-linked to the self-contained shared
 *  meal page so a recipient needs neither the sender's plan nor a lookup. */
export function mealShareCard(meal: ShareableMeal, master: { imageUrl?: string | null } | null): ShareCard {
  const t = meal.totals;
  const macros = [
    `${Math.round(t.kcal)} kcal`,
    `P ${Math.round(t.protein)}g`,
    `C ${Math.round(t.carbs)}g`,
    `F ${Math.round(t.fat)}g`,
  ];
  const token = encodeMeal({
    t: meal.title,
    l: meal.label,
    i: master?.imageUrl ?? null,
    k: Math.round(t.kcal),
    m: macros.slice(1),          // P/C/F only — kcal is rendered from `k`
    d: meal.components.map((c) => [c.name, c.recipeId, Math.round(c.kcal)] as [string, string, number]),
  });
  return {
    kind: 'recipe',
    title: meal.title,
    subtitle: `${meal.label} · ${meal.components.length} ${meal.components.length === 1 ? 'dish' : 'dishes'}`,
    image: master?.imageUrl ?? null,
    meta: macros,
    items: meal.components.map((c) => `${c.name} · ${Math.round(c.kcal)} kcal`),
    deepLink: `/nutrition/shared-meal?d=${token}`,
  };
}

/**
 * A whole day, as a card. NO DEEP LINK, and that is the honest answer rather
 * than a missing one: there is no self-contained page for a day, and the only
 * link available — /nutrition/weekly — would open the RECIPIENT'S own plan
 * while claiming to be the sender's day. The card carries the menu itself, so
 * what was sent is what is read; each course can still be sent on its own, and
 * that one does deep-link, because a meal has a page that needs nothing.
 */
export function dayShareCard(opts: {
  dateLabel: string;
  meals: ShareableMeal[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  image?: string | null;
  household?: number;
}): ShareCard {
  const { dateLabel, meals, totals, image, household } = opts;
  return {
    kind: 'recipe',
    hub: household ? 'Family menu' : 'Menu',
    title: dateLabel,
    subtitle: household
      ? `${meals.length} ${meals.length === 1 ? 'course' : 'courses'} · cooked once for ${household}`
      : `${meals.length} ${meals.length === 1 ? 'course' : 'courses'}`,
    image: image ?? null,
    meta: [
      `${Math.round(totals.kcal).toLocaleString('en-IN')} kcal`,
      `P ${Math.round(totals.protein)}g`,
      `C ${Math.round(totals.carbs)}g`,
      `F ${Math.round(totals.fat)}g`,
    ],
    items: meals.map((m) => `${m.label} · ${m.title}`),
  };
}

/** How many lines of a list a chat card can carry before it stops being a card
 *  and becomes a scroll. The rest are counted, never silently dropped. */
const LIST_LINES = 12;

/**
 * A grocery list, as a card. No deep link, for the day card's reason: a link to
 * /nutrition/grocery opens the recipient's OWN basket. The lines travel in the
 * card, capped — and the cap is SAID, because a list that quietly stops at
 * twelve is a list somebody shops from and comes home short.
 */
export function groceryShareCard(opts: {
  title: string;
  lines: string[];
  itemCount: number;
  people?: number;
  household?: boolean;
}): ShareCard {
  const { title, lines, itemCount, people, household } = opts;
  const shown = lines.slice(0, LIST_LINES);
  const rest = lines.length - shown.length;
  return {
    kind: 'product',
    hub: 'Grocery list',
    title,
    subtitle: `${itemCount} ${itemCount === 1 ? 'item' : 'items'} from the menus locked${
      household ? ' — portioned per member' : people && people > 1 ? ` — cooking for ${people}` : ''}`,
    meta: [`${itemCount} ${itemCount === 1 ? 'item' : 'items'}`],
    items: rest > 0 ? [...shown, `+${rest} more`] : shown,
  };
}

/** Decode the token back into a meal payload; null if malformed. */
export function decodeMeal(token: string): SharedMealPayload | null {
  try {
    const p = JSON.parse(fromB64Url(token)) as unknown;
    if (p && typeof (p as SharedMealPayload).t === 'string' && Array.isArray((p as SharedMealPayload).d)) {
      return p as SharedMealPayload;
    }
    return null;
  } catch {
    return null;
  }
}

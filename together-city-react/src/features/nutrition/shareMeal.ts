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

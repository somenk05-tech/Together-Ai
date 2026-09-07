import { z } from 'zod';

/**
 * ── A DOOR TO DELIVER TO ────────────────────────────────────────────────────
 *
 * Owner, 7 Sep: "add a detailed delivery address to be saved, and show the
 * delivery address if it is already saved."
 *
 * The address book (SavedAddress, 24 Aug) held one line of text per label,
 * dictated at a local-services checkout. A parcel needs more than a line: a
 * name on the door, a phone the rider can call, the building, the street, a
 * landmark, the city, the state and a PIN. So the book's rows grow those
 * fields, and the one-line `addressText` every older reader still uses is
 * COMPOSED from them here, once, rather than typed a second time.
 *
 * THE SAME SHAPE EVERYWHERE. The checkout form, the PUT that saves it, the
 * snapshot an order keeps and the line an order history prints all come off
 * this file. A second copy of "what is an address" in a controller would be
 * the second copy this city keeps paying for.
 */

export const ADDRESS_LABELS = ['home', 'work', 'other'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export const DeliveryAddressSchema = z.object({
  name: z.string().trim().min(2).max(80),
  /** An Indian mobile or landline, as people write them: digits, +, spaces, dashes. */
  phone: z.string().trim().regex(/^\+?[0-9][0-9 -]{7,15}$/, 'a phone number the rider can call'),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional().default(''),
  landmark: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  /** An Indian PIN: six digits, never starting with 0. */
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'a six-digit PIN'),
}).strict();
export type DeliveryAddressDto = z.infer<typeof DeliveryAddressSchema>;

/** The one line older readers keep reading — the profile, the map, the rider's card. */
export function addressText(a: DeliveryAddressDto): string {
  return [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`]
    .map((s) => s.trim()).filter(Boolean).join(', ');
}

/**
 * WHAT AN ORDER KEEPS. A snapshot, not a reference: the book can be edited
 * or forgotten tomorrow, and the receipt for a parcel already sent must still
 * say where it went.
 */
export interface AddressSnapshot {
  label: string;
  name: string | null;
  phone: string | null;
  addressText: string;
}

export function parseAddress(json: string | null | undefined): AddressSnapshot | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<AddressSnapshot>;
    return v && typeof v.addressText === 'string'
      ? { label: v.label ?? 'home', name: v.name ?? null, phone: v.phone ?? null, addressText: v.addressText }
      : null;
  } catch { return null; }
}

/** The row as the book stores it — the fields above plus the composed line. */
export interface SavedAddressRow {
  label: string;
  addressText: string;
  name: string | null;
  phone: string | null;
  line1: string | null;
  line2: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
}

export function snapshotOf(row: SavedAddressRow): AddressSnapshot {
  return { label: row.label, name: row.name, phone: row.phone, addressText: row.addressText };
}

/**
 * THE EIGHT SKINS A CITIZEN MAY PUT ON A ROOM.
 *
 * Owner, 20 Aug: white and black stays the default, and Mail and Chat may be
 * re-coloured. This file is the ONE list — the picker reads it, the store
 * validates against it, and `a-room-can-be-reskinned` measures every entry
 * against the CSS in tokens.css and fails if the two disagree.
 *
 * WHY A LIST AND NOT A LOOKUP FROM THE CSS: the label and the two swatches are
 * editorial. "Rolex green & gold" is a name somebody chose, and the swatches
 * are the two colours worth showing in a 40px chip — not the same thing as the
 * four ink values the room actually uses.
 */

export interface Skin {
  /** the value of `data-skin` on <html>, and the CSS block's selector */
  key: string;
  label: string;
  /** what the picker paints in the chip: ground, then lamp */
  chip: [string, string];
  /** a dark room reverses the ink; the picker says so rather than surprising */
  dark: boolean;
}

/**
 * DEFAULT IS AN ABSENCE, NOT AN ENTRY. `null` means no `data-skin` attribute at
 * all — the room is exactly the city's, byte for byte, with no rule of this
 * feature's touching it. An entry called "white" that re-declared the root
 * values would be a second copy of the default and would drift from it.
 *
 * This was `export const NO_SKIN = null`, imported by nothing since it was
 * written. The rule is the paragraph; the constant was a name for `null` that
 * no caller needed, and an exported one is a road with no traffic.
 */

export const SKINS: readonly Skin[] = [
  { key: 'burgundy', label: 'Deep burgundy',           chip: ['#681d2c', '#f0d3d9'], dark: true },
  { key: 'truffle',  label: 'Soft truffle',            chip: ['#4b3237', '#e8d5cc'], dark: true },
  { key: 'rolex',    label: 'Rolex green & gold',      chip: ['#08231a', '#d9b64a'], dark: true },
  { key: 'jaguar',   label: 'Jaguar oxblood & chrome', chip: ['#4a0e0c', '#dfe3e7'], dark: true },
  { key: 'sanmarino',label: 'San Marino',              chip: ['#1c2e46', '#476d9e'], dark: true },
  { key: 'sugar',    label: 'Sugar blue',              chip: ['#d2e2ed', '#1b4560'], dark: false },
  { key: 'ruby',     label: 'Ruby chocolate',          chip: ['#ddd0d1', '#6d2434'], dark: false },
  { key: 'mocha',    label: 'Mocha fudge',             chip: ['#e2d6d4', '#5e4747'], dark: false },
  { key: 'zephyr',   label: 'Currant zephyr',          chip: ['#dfd9d6', '#5a3f43'], dark: false },
] as const;

/**
 * THE TWO ROOMS THAT MAY BE RE-SKINNED, and the allow-list is the feature's
 * whole blast radius. Mail and Chat are the two hubs whose content is entirely
 * the citizen's own — everywhere else the palette is the city telling you which
 * room you are standing in, and a citizen who repainted Medical to match their
 * inbox would have taken that signal away from themselves.
 */
export const SKINNABLE = ['mail', 'chat'] as const;
export type SkinnableHub = (typeof SKINNABLE)[number];

export const isSkinnable = (hub: string | null): hub is SkinnableHub =>
  hub !== null && (SKINNABLE as readonly string[]).includes(hub);

export const skinByKey = (key: string | null): Skin | null =>
  key === null ? null : SKINS.find((s) => s.key === key) ?? null;

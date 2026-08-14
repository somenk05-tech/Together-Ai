import { SetMetadata } from '@nestjs/common';

/** What a capability can cost. Every entry in the manifest carries exactly one. */
export type Risk =
  /** Reads. Changes nothing. */
  | 'R0'
  /** A reversible draft — a cart, an unsent message, a filled but unsubmitted form. */
  | 'R1'
  /** Someone else sees it, or it is a real commitment. */
  | 'R2'
  /** Money moves. */
  | 'R3'
  /** Irreversible, or about someone's body. Never done on a spoken word alone. */
  | 'R4';

export interface MiraCapability {
  /** What this does, in the citizen's terms — not the route's. */
  intent: string;
  /** Things people actually say that mean this. Seeds the router; not exhaustive. */
  utterances?: string[];
  risk: Risk;
  /** Argument names the caller must supply. */
  needs?: string[];
  /**
   * The sentence Mira says before doing it. Required at R2 and R3.
   *
   * It restates the CONSEQUENCE, never the request: "Table for four at Ekaa,
   * 8pm Saturday. Book it?" is a check; "Booking a table" is a parrot, and a
   * parrot cannot catch a misheard sentence.
   *
   * Not required at R4 — those never confirm by voice at all, they hand over
   * to the screen.
   */
  confirm?: string;
}

export const MIRA_CAPABILITY = 'mira:capability';

/**
 * Marks a route as something Mira is allowed to want.
 *
 * The decorator is the opt-in. 386 routes handed to a model as free text is a
 * promise that one day it POSTs to something nobody meant it to; this list is
 * the set it may choose from, and it grows one deliberate decision at a time.
 *
 * The metadata is also read from source by `manifest.ts` rather than only at
 * runtime — same choice `route-inventory.ts` makes, and for the same reason:
 * the invariants are about what is WRITTEN, so the build can fail on a missing
 * decision instead of a request failing later.
 */
export const Mira = (cap: MiraCapability) => SetMetadata(MIRA_CAPABILITY, cap);

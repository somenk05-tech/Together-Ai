import { SetMetadata } from '@nestjs/common';

export const ROOM_ROUTE = 'tc:room';

/**
 * ── WHICH ROOM THIS ROUTE BELONGS TO ────────────────────────────────────────
 *
 * Owner, 9 Sep: "Create kill switches for each tab."
 *
 * A HUB's kill switch can be a prefix match, because a hub owns a prefix:
 * everything under /api/astrology is Astrology and nothing else. A ROOM cannot.
 * All six Astrology rooms live under that one prefix, and some routes are read
 * by several of them — /astrology/profile is asked for by the letter, the
 * gemstone shelf and the profile page. A prefix match, or a path pattern
 * guessed from the room's URL, would close rooms nobody pressed.
 *
 * So the route says which room it is for, beside the handler, where the person
 * who knows the answer is standing. There is no table to drift, no pattern to
 * be clever about, and a route with no decorator is NEVER gated by a room —
 * which is the honest default for every shared endpoint in the API.
 *
 * ── ONE ROOM PER ROUTE, AND ONLY WHEN IT IS TRUE ────────────────────────────
 *
 * The rule for putting this on a handler is not "which room uses it" but
 * "which room is the ONLY one that uses it". A route two rooms read has no
 * owner and gets no decorator; the room's switch then closes its PAGE and says
 * out loud that it refuses nothing, which is the E-Commerce precedent in
 * feature-flags.ts — a switch that describes itself accurately is worth more
 * than one that overstates and takes a neighbour down.
 *
 * The key is the room's PATH, the same identity ROOM_FLAGS uses.
 * room-routes.spec.ts fails when a decorator names a room that does not exist.
 */
export const Room = (key: string) => SetMetadata(ROOM_ROUTE, key);

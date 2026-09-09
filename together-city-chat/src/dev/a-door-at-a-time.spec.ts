import {
  ROOM_FLAGS, ROOM_KEYS, isRoomKey, roomFlag, roomsOf,
  PAGE_VISIBILITY_PREFIX, VISIBILITY_PREFIX, VISIBILITY_KEYS, isVisibilityKey,
  FLAG_KEYS, isFlagKey, flagForPath, NEVER_FLAGGABLE,
} from './feature-flags';

/**
 * ── ONE DOOR AT A TIME ──────────────────────────────────────────────────────
 *
 * Owner, 9 Sep: "Give me a hide-from-city button for each hub and each side hub
 * tab — for example Ask the Astrologer — all 01-06 in Astrology, the same for
 * the entire site and all hubs."
 *
 * A hundred and eight new switches is a hundred and eight new ways to be wrong,
 * and only one of those ways matters: a room switch that turns out to refuse an
 * API. This file spends most of its length proving it cannot, from four
 * directions, because a comment saying "these only hide doors" is worth nothing
 * the first time somebody adds a prefix to the wrong list.
 */
describe('a room switch can never close anything', () => {
  it('never gates a request path, whatever the room is called', () => {
    /* THE LOAD-BEARING TEST. flagForPath is the only input to the request gate,
       and it is built from FLAGS alone. Every room key put through it must come
       back with either nothing or the KILL switch that already governed that
       hub before rooms existed — never a gate the room itself invented. */
    for (const room of ROOM_FLAGS) {
      const hit = flagForPath(room.key);
      expect(hit === null || FLAG_KEYS.includes(hit.key)).toBe(true);
      expect(isFlagKey(room.key)).toBe(false);
    }
  });

  it('stores under the door-hider prefix, one level in', () => {
    for (const room of ROOM_FLAGS) {
      expect(room.storeKey).toBe(`${PAGE_VISIBILITY_PREFIX}${room.key}`);
      expect(room.storeKey.startsWith(VISIBILITY_PREFIX)).toBe(true);
      /* A room is not a sector: `isVisibilityKey` must not match one, or the
         two writers become reachable from each other's keys. */
      expect(isVisibilityKey(room.key)).toBe(false);
    }
  });

  it('names no prefix that may never be flagged', () => {
    /* Mail and Chat have rooms, and their rooms are doors like any other — but
       nothing here may look like a gate on those prefixes. */
    for (const key of ROOM_KEYS) {
      const head = key.replace(/^\//, '').split('/')[0];
      expect(FLAG_KEYS.includes(head) && NEVER_FLAGGABLE.includes(head)).toBe(false);
    }
  });

  it('keeps one row per room, and the key is the path', () => {
    expect(new Set(ROOM_KEYS).size).toBe(ROOM_KEYS.length);
    for (const room of ROOM_FLAGS) expect(room.key).toMatch(/^\/[a-z0-9/-]+$/);
    expect(isRoomKey('/astrology/ask')).toBe(true);
    expect(isRoomKey('/astrology/nonsense')).toBe(false);
    expect(isRoomKey('astrology')).toBe(false);
    expect(roomFlag('/astrology/ask')?.label).toBe('Ask the Astrologer');
  });
});

describe('every room hangs under a sector that has its own switch', () => {
  it('has no orphans', () => {
    /* A room whose hub is not a visibility key would draw on the operator's
       page under a card that is not there. */
    for (const room of ROOM_FLAGS) expect(VISIBILITY_KEYS).toContain(room.hub);
  });

  it('groups in rail order, the way the page reads them', () => {
    const astro = roomsOf('astrology');
    expect(astro.map((r) => r.index)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(astro.map((r) => r.label)).toEqual([
      'This Month', 'Ask the Astrologer', 'Tarot', 'Gemstones', 'Checkout', 'Astrology Profile',
    ]);
  });

  it('says, in every room, that the room keeps answering', () => {
    /* The whole contract of this kind of switch, in the sentence the operator
       reads before pressing. It is generated rather than typed, so this is a
       check on the generator, which is the only place it can go wrong. */
    for (const room of ROOM_FLAGS) {
      expect(room.hides).toContain('keeps answering');
      expect(room.hides).toContain(room.label);
    }
  });
});

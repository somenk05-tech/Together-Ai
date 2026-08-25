import { DESIGNABLE_HUBS, normalizeHiddenHubs, parseHiddenHubs } from './design-your-services';

describe('design your services', () => {
  describe('the designable list', () => {
    it('never lists the citizen’s own doors', () => {
      // Mail and Personal are not services — they are the citizen's own inbox
      // and drawer, and a profile section offering to remove your own inbox is
      // a control that punishes curiosity.
      for (const key of ['mail', 'personal']) {
        expect({ key, designable: (DESIGNABLE_HUBS as readonly string[]).includes(key) })
          .toEqual({ key, designable: false });
      }
    });

    it('never lists a hub with no street surface', () => {
      // Travel left the street entirely (owner, 15 Aug). A toggle for a hub
      // with no door anywhere would be a switch wired to nothing.
      expect((DESIGNABLE_HUBS as readonly string[]).includes('travel')).toBe(false);
    });

    it('is alphabetical, so the section reads the way the header does', () => {
      const sorted = [...DESIGNABLE_HUBS].sort((a, b) => a.localeCompare(b));
      expect([...DESIGNABLE_HUBS]).toEqual(sorted);
    });
  });

  describe('normalizeHiddenHubs', () => {
    it('drops keys the city does not know', () => {
      expect(normalizeHiddenHubs(['fitness', 'blockchain', 'mail', 'personal', 'travel']))
        .toEqual(['fitness']);
    });

    it('de-duplicates and returns canonical order regardless of click order', () => {
      expect(normalizeHiddenHubs(['social', 'astrology', 'social', 'fitness']))
        .toEqual(['astrology', 'fitness', 'social']);
    });

    it('can hide the whole street — the citizen is allowed a quiet city', () => {
      expect(normalizeHiddenHubs([...DESIGNABLE_HUBS])).toEqual([...DESIGNABLE_HUBS]);
    });
  });

  describe('parseHiddenHubs', () => {
    it('reads null — a citizen who never designed — as the whole city', () => {
      expect(parseHiddenHubs(null)).toEqual([]);
      expect(parseHiddenHubs(undefined)).toEqual([]);
    });

    it('reads an empty design as the whole city too', () => {
      expect(parseHiddenHubs('[]')).toEqual([]);
    });

    it('reads a stored design back', () => {
      expect(parseHiddenHubs('["astrology","pets"]')).toEqual(['astrology', 'pets']);
    });

    it('never lets a bad column break a page — corruption reads as the whole city', () => {
      expect(parseHiddenHubs('not json')).toEqual([]);
      expect(parseHiddenHubs('{"hidden":true}')).toEqual([]);
      expect(parseHiddenHubs('[1,2,3]')).toEqual([]);
    });

    it('drops a key a retired hub left behind rather than refusing the rest', () => {
      expect(parseHiddenHubs('["fitness","cars"]')).toEqual(['fitness']);
    });
  });
});

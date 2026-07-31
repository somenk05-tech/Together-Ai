import {
  allowedHubsFor,
  isFamily,
  isFamilyOnlyHub,
  isStatedNonFamily,
  mayReadHub,
  resolveGrants,
  withheldMessage,
} from './hub-grants';
import { FAMILY_ONLY_SLUGS, PERMISSIONED_SLUGS, UNIVERSAL_SLUGS } from './hubs.registry';

describe('hub access — the family-only rule, in the server rather than the markup', () => {
  describe('allowedHubsFor', () => {
    it('gives family every permissioned hub', () => {
      expect(allowedHubsFor('family').sort()).toEqual([...PERMISSIONED_SLUGS].sort());
    });

    it('withholds the family-only hubs from a friend', () => {
      const allowed = allowedHubsFor('friend');
      for (const slug of FAMILY_ONLY_SLUGS) expect(allowed).not.toContain(slug);
      expect(allowed).toContain('social');
      expect(allowed).toContain('fitness');
    });

    it('treats every other stated relationship exactly like a friend', () => {
      // The DTO accepts partner | colleague | other, and the browser's array only
      // ever knew about family and friend — so an unrecognised relationship used
      // to fall through to "show everything".
      for (const rel of ['partner', 'colleague', 'other', 'nonsense']) {
        expect(allowedHubsFor(rel).sort()).toEqual(allowedHubsFor('friend').sort());
      }
    });

    it('treats an unstated relationship as not-family on the write side', () => {
      expect(allowedHubsFor(null).sort()).toEqual(allowedHubsFor('friend').sort());
      expect(allowedHubsFor(undefined).sort()).toEqual(allowedHubsFor('friend').sort());
    });

    it('never lists a universal hub — those are not grants', () => {
      for (const slug of UNIVERSAL_SLUGS) {
        expect(allowedHubsFor('family')).not.toContain(slug);
        expect(allowedHubsFor('friend')).not.toContain(slug);
      }
    });
  });

  describe('resolveGrants', () => {
    it('keeps a family-only hub for family and reports nothing withheld', () => {
      const g = resolveGrants(['medical', 'social'], 'family');
      expect(g.modules).toContain('medical');
      expect(g.modules).toContain('social');
      expect(g.withheld).toEqual([]);
    });

    it('drops a family-only hub for a friend and says which', () => {
      const g = resolveGrants(['medical', 'social'], 'friend');
      expect(g.modules).not.toContain('medical');
      expect(g.modules).toContain('social');
      expect(g.withheld).toEqual(['medical']);
    });

    it('drops every family-only hub asked for at once', () => {
      const g = resolveGrants([...FAMILY_ONLY_SLUGS, 'fitness'], 'friend');
      expect(g.withheld.sort()).toEqual([...FAMILY_ONLY_SLUGS].sort());
      expect(g.modules).toContain('fitness');
    });

    it('always includes the universal hubs, whatever was asked for', () => {
      for (const rel of ['family', 'friend', null]) {
        const g = resolveGrants([], rel);
        for (const slug of UNIVERSAL_SLUGS) expect(g.modules).toContain(slug);
      }
    });

    it('ignores universal hubs passed in as if they were grants', () => {
      const g = resolveGrants([...UNIVERSAL_SLUGS], 'friend');
      expect(g.withheld).toEqual([]);
      expect(g.modules.sort()).toEqual([...UNIVERSAL_SLUGS].sort());
    });

    it('drops retired hubs without calling them withheld — nothing was refused', () => {
      const g = resolveGrants(['grocery', 'pantry', 'calendar', 'social'], 'family');
      expect(g.modules).toEqual(expect.not.arrayContaining(['grocery', 'pantry', 'calendar']));
      expect(g.withheld).toEqual([]);
      expect(g.modules).toContain('social');
    });

    it('de-duplicates a repeated grant', () => {
      const g = resolveGrants(['social', 'social', 'social'], 'friend');
      expect(g.modules.filter((m) => m === 'social')).toHaveLength(1);
    });

    it('handles null and undefined without throwing', () => {
      expect(resolveGrants(null, 'family').modules.sort()).toEqual([...UNIVERSAL_SLUGS].sort());
      expect(resolveGrants(undefined, null).withheld).toEqual([]);
    });

    it('REVOKES on downgrade: the same set, re-saved as a friend, loses the family hubs', () => {
      // This is the path that matters most in practice — a connection made as
      // family and later changed to friend. The grant has to follow the change.
      const asFamily = resolveGrants(['medical', 'nutrition', 'social'], 'family');
      const downgraded = resolveGrants(asFamily.modules, 'friend');
      expect(downgraded.modules).not.toContain('medical');
      expect(downgraded.modules).not.toContain('nutrition');
      expect(downgraded.modules).toContain('social');
      expect(downgraded.withheld.sort()).toEqual(['medical', 'nutrition']);
    });

    it('is idempotent — resolving an already-resolved set changes nothing', () => {
      const once = resolveGrants(['medical', 'social'], 'friend');
      const twice = resolveGrants(once.modules, 'friend');
      expect(twice.modules.sort()).toEqual(once.modules.sort());
      expect(twice.withheld).toEqual([]);
    });
  });

  describe('mayReadHub', () => {
    it('always allows a hub that is not family-only', () => {
      for (const rel of ['family', 'friend', 'colleague', null]) {
        expect(mayReadHub('social', rel)).toBe(true);
        expect(mayReadHub('fitness', rel)).toBe(true);
      }
    });

    it('allows family-only hubs for family', () => {
      for (const slug of FAMILY_ONLY_SLUGS) expect(mayReadHub(slug, 'family')).toBe(true);
    });

    it('refuses family-only hubs once the relationship states it is not family', () => {
      for (const slug of FAMILY_ONLY_SLUGS) {
        expect(mayReadHub(slug, 'friend')).toBe(false);
        expect(mayReadHub(slug, 'colleague')).toBe(false);
      }
    });

    it('leaves rows written before this rule existed alone', () => {
      // relationship === null predates the question being asked. Revoking these
      // would take away access a family is using today, on no evidence.
      for (const slug of FAMILY_ONLY_SLUGS) {
        expect(mayReadHub(slug, null)).toBe(true);
        expect(mayReadHub(slug, undefined)).toBe(true);
        expect(mayReadHub(slug, '')).toBe(true);
      }
    });
  });

  describe('the small predicates', () => {
    it('isFamily is exact', () => {
      expect(isFamily('family')).toBe(true);
      expect(isFamily('Family')).toBe(false);
      expect(isFamily('friend')).toBe(false);
      expect(isFamily(null)).toBe(false);
    });

    it('isStatedNonFamily separates "not family" from "not stated"', () => {
      expect(isStatedNonFamily('friend')).toBe(true);
      expect(isStatedNonFamily('family')).toBe(false);
      expect(isStatedNonFamily(null)).toBe(false);
      expect(isStatedNonFamily(undefined)).toBe(false);
      expect(isStatedNonFamily('')).toBe(false);
    });

    it('isFamilyOnlyHub agrees with the registry', () => {
      expect(isFamilyOnlyHub('medical')).toBe(true);
      expect(isFamilyOnlyHub('social')).toBe(false);
    });
  });

  describe('withheldMessage', () => {
    it('says nothing when nothing was withheld', () => {
      expect(withheldMessage([])).toBe('');
    });

    it('uses the registry name, never the slug', () => {
      const msg = withheldMessage(['medical']);
      expect(msg).toContain('Medical Hub');
      expect(msg).not.toContain('medical');
    });

    it('lists several readably and stays singular/plural correct', () => {
      const one = withheldMessage(['medical']);
      expect(one).toContain(' is shared with family only');
      expect(one).toContain('so it stayed off');
      const many = withheldMessage(['medical', 'financial']);
      expect(many).toContain(' and ');
      expect(many).toContain(' are shared with family only');
      expect(many).toContain('so they stayed off');
    });

    it('tells the citizen the way out, not just the refusal', () => {
      expect(withheldMessage(['medical'])).toContain('change the relationship to Family');
    });
  });
});

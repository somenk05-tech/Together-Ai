import {
  HUBS, HUB_SLUGS, UNIVERSAL_SLUGS, PERMISSIONED_SLUGS, FAMILY_ONLY_SLUGS,
  isHub, isUniversalHub, hubDef,
} from './hubs.registry';

describe('hubs registry (single source of truth)', () => {
  it('contains exactly the real Together City hubs', () => {
    expect(HUB_SLUGS.sort()).toEqual(
      ['chat', 'mail', 'social', 'travel', 'entertainment', 'fitness', 'nutrition', 'medical', 'financial'].sort(),
    );
  });

  it('has fully removed grocery, shared pantry and shared calendar', () => {
    for (const gone of ['grocery', 'pantry', 'calendar']) {
      expect(isHub(gone)).toBe(false);
      expect(hubDef(gone)).toBeUndefined();
      expect(HUB_SLUGS).not.toContain(gone);
    }
  });

  it('treats only chat + mail as universal', () => {
    expect(UNIVERSAL_SLUGS.sort()).toEqual(['chat', 'mail']);
    expect(isUniversalHub('chat')).toBe(true);
    expect(isUniversalHub('social')).toBe(false);
  });

  it('marks nutrition/medical/financial family-only', () => {
    expect(FAMILY_ONLY_SLUGS.sort()).toEqual(['financial', 'medical', 'nutrition']);
  });

  it('permissioned = all hubs minus universal', () => {
    expect(PERMISSIONED_SLUGS).not.toContain('chat');
    expect(PERMISSIONED_SLUGS).not.toContain('mail');
    expect(PERMISSIONED_SLUGS).toContain('social');
    expect(PERMISSIONED_SLUGS.length).toBe(HUB_SLUGS.length - UNIVERSAL_SLUGS.length);
  });

  it('every hub has an icon and a name (UI config)', () => {
    for (const h of HUBS) {
      expect(h.name.length).toBeGreaterThan(0);
      expect(h.icon.length).toBeGreaterThan(0);
      expect(h.id).toBe(h.slug);
    }
  });
});

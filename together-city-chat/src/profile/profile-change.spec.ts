import { diffProfile, renderValue, versionConflict } from './profile-change';

describe('profile change trail', () => {
  describe('diffProfile', () => {
    it('records a real edit', () => {
      expect(diffProfile({ weightKg: 70 }, { weightKg: 68 }))
        .toEqual([{ field: 'weightKg', oldValue: '70', newValue: '68' }]);
    });

    it('ignores a field re-sent at the value it already holds', () => {
      // Nine services call syncShared on save and most re-send everything they
      // know. Recording equality would bury the real edits.
      expect(diffProfile({ weightKg: 70, city: 'Pune' }, { weightKg: 70, city: 'Pune' })).toEqual([]);
    });

    it('ignores fields the patch does not mention', () => {
      expect(diffProfile({ weightKg: 70, city: 'Pune' }, { weightKg: undefined })).toEqual([]);
    });

    it('records a field being cleared', () => {
      // "My weight went blank" is exactly what somebody needs to ask about.
      expect(diffProfile({ weightKg: 70 }, { weightKg: null }))
        .toEqual([{ field: 'weightKg', oldValue: '70', newValue: null }]);
    });

    it('treats the first answer as a change from nothing', () => {
      expect(diffProfile(null, { sexAtBirth: 'female' }))
        .toEqual([{ field: 'sexAtBirth', oldValue: null, newValue: 'female' }]);
    });

    it('does not see a change when a Date meets its own ISO string', () => {
      // Different hubs write dates differently. Without this, every save from a
      // hub that stringifies would look like an edit.
      const d = new Date('1994-03-02T00:00:00.000Z');
      expect(diffProfile({ dateOfBirth: d }, { dateOfBirth: d.toISOString() })).toEqual([]);
    });

    it('treats an empty string as nothing, not as a value', () => {
      expect(diffProfile({ city: 'Pune' }, { city: '   ' }))
        .toEqual([{ field: 'city', oldValue: 'Pune', newValue: null }]);
      expect(diffProfile({ city: null }, { city: '' })).toEqual([]);
    });

    it('keeps a zero, which is a real answer', () => {
      expect(diffProfile({ weightKg: 70 }, { weightKg: 0 }))
        .toEqual([{ field: 'weightKg', oldValue: '70', newValue: '0' }]);
    });

    it('reports several fields in one patch', () => {
      const rows = diffProfile({ weightKg: 70, heightCm: 170 }, { weightKg: 68, heightCm: 171, city: 'Pune' });
      expect(rows.map((r) => r.field).sort()).toEqual(['city', 'heightCm', 'weightKg']);
    });
  });

  describe('renderValue', () => {
    it('gives one canonical string per value', () => {
      expect(renderValue(42)).toBe('42');
      expect(renderValue(false)).toBe('false');
      expect(renderValue('  Pune ')).toBe('Pune');
      expect(renderValue(null)).toBeNull();
      expect(renderValue(undefined)).toBeNull();
      expect(renderValue('')).toBeNull();
    });
  });

  describe('versionConflict', () => {
    it('reports a stale write when the client stated a version', () => {
      expect(versionConflict(4, 3)).toBe(true);
      expect(versionConflict(4, 4)).toBe(false);
    });

    it('lets a caller that states nothing through', () => {
      // Eight hub services write shared fields without ever reading the
      // profile. They are not attempting to be safe, and refusing them would
      // break saving from Nutrition, Fitness, Dating, Jobs and the rest.
      expect(versionConflict(4)).toBe(false);
      expect(versionConflict(4, null)).toBe(false);
    });
  });
});

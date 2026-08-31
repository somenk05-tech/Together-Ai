import { UpsertDatingProfileSchema } from './dto/dating.dto';

/**
 * ── THE FIELD SAID OPTIONAL AND THE SCHEMA SAID INVALID ─────────────────────
 *
 * Fifth audit, 31 Aug, blocker B1. The profile form labels "Time of birth"
 * as optional, seeds it with '' and posts the form as-is. `birthTime` was
 * `z.string().regex(/^\d{2}:\d{2}$/).optional()`, and '' is a string: the
 * optional never fired, the regex refused, and the pipe's message for a bare
 * regex failure is the one word "Invalid" — under the Save button, naming no
 * field. Anyone who did not know their birth time could not create a dating
 * profile. The owner knows his, which is why it was never hit.
 *
 * The client now omits a blank. This file holds the DOOR to the same rule,
 * because a schema that depends on one client build being polite is a
 * schema with one build between it and the next "Invalid".
 */
describe('a blank birth time is not a refusal', () => {
  const base = {
    gender: 'female' as const, seeking: 'any' as const,
    birthDate: '1995-06-15', interests: ['Travel'],
  };

  it('accepts an empty string and stores it as absent', () => {
    const r = UpsertDatingProfileSchema.safeParse({ ...base, birthTime: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.birthTime).toBeUndefined();
  });

  it('accepts an omitted time as absent', () => {
    const r = UpsertDatingProfileSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.birthTime).toBeUndefined();
  });

  it('keeps a real time exactly as typed', () => {
    const r = UpsertDatingProfileSchema.safeParse({ ...base, birthTime: '07:45' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.birthTime).toBe('07:45');
  });

  it('still refuses a time that is not HH:MM', () => {
    for (const bad of ['7:45', '0745', 'seven', '07:45:00']) {
      expect(UpsertDatingProfileSchema.safeParse({ ...base, birthTime: bad }).success).toBe(false);
    }
  });
});

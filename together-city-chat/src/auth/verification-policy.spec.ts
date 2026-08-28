import {
  CODE_TTL_MS, MAX_ATTEMPTS, MAX_SENDS_PER_HOUR, MAX_SENDS_PER_IP_PER_HOUR, RESEND_COOLDOWN_MS,
  decideAttempt, decideSend, formatCode, isPlausibleEmail, normaliseEmail, parseE164, targetChanged,
} from './verification-policy';

describe('normaliseEmail / isPlausibleEmail', () => {
  it('lowercases and trims', () => {
    expect(normaliseEmail('  Shruti@GBCAPL.com ')).toBe('shruti@gbcapl.com');
  });

  it('does NOT strip dots or plus-addressing', () => {
    // These are Gmail conventions. Applying them everywhere would collapse two
    // genuinely different mailboxes into one row.
    expect(normaliseEmail('first.last+tag@example.org')).toBe('first.last+tag@example.org');
  });

  it.each([
    'a@b.co', 'shruti@gbcapl.com', 'x.y+z@sub.domain.io',
  ])('accepts %s', (e) => expect(isPlausibleEmail(e)).toBe(true));

  it.each([
    ['no at sign', 'nobody'],
    ['no dot in domain', 'a@localhost'],
    ['two at signs', 'a@b@c.com'],
    ['leading dot in domain', 'a@.com'],
    ['double dot', 'a@b..com'],
    ['trailing dot', 'a@b.com.'],
    ['empty', ''],
    ['spaces', 'a b@c.com'],
  ])('rejects %s', (_label, e) => expect(isPlausibleEmail(e)).toBe(false));

  it('rejects a local part over 64 characters', () => {
    expect(isPlausibleEmail(`${'a'.repeat(65)}@example.com`)).toBe(false);
  });
});

describe('parseE164', () => {
  it('accepts an already-international number', () => {
    expect(parseE164('+91 98765 43210')).toEqual({ ok: true, e164: '+919876543210' });
  });

  it('strips the punctuation people actually type', () => {
    expect(parseE164('+1 (415) 555-0132')).toEqual({ ok: true, e164: '+14155550132' });
  });

  it('treats 00 as the international prefix it is', () => {
    expect(parseE164('0091 9876543210')).toEqual({ ok: true, e164: '+919876543210' });
  });

  it('applies a default calling code and drops the national trunk 0', () => {
    // 07911 123456 dialled inside the UK is +44 7911 123456 internationally.
    expect(parseE164('07911 123456', '+44')).toEqual({ ok: true, e164: '+447911123456' });
  });

  it('refuses a national number when it has no country to assume', () => {
    const r = parseE164('9876543210');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/country code/i);
  });

  it.each([
    ['too short', '+1234567'],
    ['too long', '+1234567890123456'],
    ['letters', '+91 98765 4321O'],
    ['country code starting with zero', '+0912345678'],
    ['empty', '   '],
  ])('rejects %s', (_l, input) => expect(parseE164(input).ok).toBe(false));

  it('gives a reason a person can act on, every time it refuses', () => {
    for (const bad of ['', '+1234567', '+1234567890123456', 'abc', '9876543210']) {
      const r = parseE164(bad);
      expect(r.ok).toBe(false);
      expect(r.reason && r.reason.length).toBeGreaterThan(5);
    }
  });
});

describe('decideSend', () => {
  const now = new Date('2026-07-30T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('allows the first send', () => {
    expect(decideSend({ toTarget: [] }, now)).toEqual({ allow: true });
  });

  it('holds a resend inside the cooldown and says how long', () => {
    const v = decideSend({ toTarget: [ago(20_000)] }, now);
    expect(v.allow).toBe(false);
    if (v.allow) return;
    expect(v.reason).toBe('cooldown');
    expect(v.retryAfterMs).toBe(RESEND_COOLDOWN_MS - 20_000);
    expect(v.message).toContain('40 seconds');
  });

  it('allows a resend the moment the cooldown is over', () => {
    expect(decideSend({ toTarget: [ago(RESEND_COOLDOWN_MS)] }, now)).toEqual({ allow: true });
  });

  it('caps sends per target per hour', () => {
    // Five spread-out sends, all inside the hour, none inside the cooldown.
    const toTarget = [2, 10, 20, 30, 40].map((m) => ago(m * 60_000));
    expect(toTarget.length).toBe(MAX_SENDS_PER_HOUR);
    const v = decideSend({ toTarget }, now);
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe('target-hourly-cap');
  });

  it('frees a slot as the oldest send ages past the hour', () => {
    const toTarget = [2, 10, 20, 30, 61].map((m) => ago(m * 60_000));
    expect(decideSend({ toTarget }, now)).toEqual({ allow: true });
  });

  it('caps sends per IP across different targets', () => {
    const fromIp = Array.from({ length: MAX_SENDS_PER_IP_PER_HOUR }, (_, i) => ago((i + 1) * 60_000));
    const v = decideSend({ toTarget: [], fromIp }, now);
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe('ip-hourly-cap');
  });

  it('checks the cooldown before the hourly caps', () => {
    // Both would refuse. The cooldown is the one worth reporting, because it is
    // the one that resolves in a minute rather than in an hour.
    const toTarget = [0, 10, 20, 30, 40].map((m) => ago(m * 60_000));
    const v = decideSend({ toTarget }, now);
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe('cooldown');
  });

  it('ignores sends older than an hour entirely', () => {
    const toTarget = Array.from({ length: 50 }, (_, i) => ago(HOURS(2) + i * 1000));
    expect(decideSend({ toTarget }, now)).toEqual({ allow: true });
  });

  function HOURS(n: number) { return n * 60 * 60 * 1000; }
});

describe('decideAttempt', () => {
  const now = new Date('2026-07-30T12:00:00Z');
  const live = { expiresAt: new Date(now.getTime() + 60_000), attempts: 0, consumedAt: null };

  it('accepts a matching, live, unused code', () => {
    expect(decideAttempt(live, true, now)).toEqual({ outcome: 'accept' });
  });

  it('reports no code on file rather than a wrong code', () => {
    expect(decideAttempt(null, false, now).outcome).toBe('no-code');
  });

  it('reports expiry even when the code is correct', () => {
    // The user copied it right. Telling them it is wrong would be a lie and
    // would send them looking for a typo that is not there.
    const stale = { ...live, expiresAt: new Date(now.getTime() - 1) };
    expect(decideAttempt(stale, true, now).outcome).toBe('expired');
  });

  it('treats the expiry boundary as expired, not as live', () => {
    const boundary = { ...live, expiresAt: new Date(now.getTime()) };
    expect(decideAttempt(boundary, true, now).outcome).toBe('expired');
  });

  it('reports reuse even when the code is correct', () => {
    const used = { ...live, consumedAt: new Date(now.getTime() - 1000) };
    expect(decideAttempt(used, true, now).outcome).toBe('already-used');
  });

  it('checks reuse before expiry', () => {
    const both = { expiresAt: new Date(now.getTime() - 1), attempts: 0, consumedAt: new Date(now.getTime() - 2) };
    expect(decideAttempt(both, true, now).outcome).toBe('already-used');
  });

  it('counts down the tries left', () => {
    const v = decideAttempt({ ...live, attempts: 1 }, false, now);
    expect(v).toMatchObject({ outcome: 'wrong', attemptsLeft: MAX_ATTEMPTS - 2 });
  });

  it('makes the fifth wrong try the last one, not the sixth', () => {
    const fifth = decideAttempt({ ...live, attempts: MAX_ATTEMPTS - 1 }, false, now);
    expect(fifth.outcome).toBe('exhausted');
  });

  it('still accepts a correct code on the final permitted try', () => {
    expect(decideAttempt({ ...live, attempts: MAX_ATTEMPTS - 1 }, true, now).outcome).toBe('accept');
  });

  it('refuses once attempts are already spent, correct or not', () => {
    const spent = { ...live, attempts: MAX_ATTEMPTS };
    expect(decideAttempt(spent, true, now).outcome).toBe('exhausted');
    expect(decideAttempt(spent, false, now).outcome).toBe('exhausted');
  });

  it('says something useful in every refusal', () => {
    const cases = [
      decideAttempt(null, false, now),
      decideAttempt({ ...live, consumedAt: now }, true, now),
      decideAttempt({ ...live, expiresAt: new Date(now.getTime() - 1) }, true, now),
      decideAttempt({ ...live, attempts: MAX_ATTEMPTS }, false, now),
      decideAttempt(live, false, now),
    ];
    for (const c of cases) {
      expect(c.outcome).not.toBe('accept');
      if (c.outcome !== 'accept') expect(c.message.length).toBeGreaterThan(10);
    }
  });
});

describe('targetChanged', () => {
  it('ignores capitalisation on an email', () => {
    expect(targetChanged('email', 'Shruti@GBCAPL.com', 'shruti@gbcapl.com')).toBe(false);
  });

  it('sees a real change', () => {
    expect(targetChanged('email', 'a@b.com', 'c@d.com')).toBe(true);
  });

  it('treats setting or clearing a target as a change', () => {
    expect(targetChanged('phone', null, '+919876543210')).toBe(true);
    expect(targetChanged('phone', '+919876543210', null)).toBe(true);
  });

  it('sees no change when neither is set', () => {
    expect(targetChanged('phone', null, null)).toBe(false);
  });
});

describe('formatCode', () => {
  it('always produces six digits', () => {
    for (const n of [0, 7, 999_999, 1_000_000, 1_234_567]) {
      expect(formatCode(n)).toMatch(/^[0-9]{6}$/);
    }
  });

  it('keeps leading zeros — 000042 is a valid code', () => {
    expect(formatCode(42)).toBe('000042');
  });
});

describe('the constants are the ones the spec asked for', () => {
  it('10-minute TTL, 5 attempts, 60s cooldown, 5 per hour', () => {
    expect(CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(RESEND_COOLDOWN_MS).toBe(60 * 1000);
    expect(MAX_SENDS_PER_HOUR).toBe(5);
  });
});

import { AiSuggestionsService } from './ai-suggestions.service';

/**
 * PERSONALISATION HAPPENS ONCE — owner rule, 5 Sep.
 *
 * The four suggestion routes asked the model on every page open. Now an
 * answer is written once and kept, and written again only when the inputs
 * it was written from change. A fallback is never kept.
 */
function service(opts: { enabled?: boolean; answer?: unknown; skin?: string } = {}) {
  let skin = opts.skin ?? 'oily';
  const kept = new Map<string, { fingerprint: string; payloadJson: string }>();
  const calls: string[] = [];
  const prisma = {
    beautyProfile: { findUnique: async () => ({ skinType: skin, hairType: 'wavy', concerns: 'acne' }) },
    personalisation: {
      findUnique: async (a: { where: { userId_kind: { userId: string; kind: string } } }) =>
        kept.get(`${a.where.userId_kind.userId}:${a.where.userId_kind.kind}`) ?? null,
      upsert: async (a: { where: { userId_kind: { userId: string; kind: string } }; update: { fingerprint: string; payloadJson: string } }) => {
        kept.set(`${a.where.userId_kind.userId}:${a.where.userId_kind.kind}`, a.update);
      },
    },
  };
  const ai = {
    enabled: opts.enabled ?? true,
    json: async (_s: string, user: string, fallback: unknown) => { calls.push(user); return opts.answer === undefined ? [{ title: 'Cleanse', detail: 'gently', tag: 'AM' }] : (opts.answer ?? fallback); },
  };
  const svc = new AiSuggestionsService(prisma as never, ai as never);
  return { svc, calls, kept, setSkin: (s: string) => { skin = s; } };
}

describe('personalisation happens once', () => {
  it('the first read asks the model; the second, with nothing changed, does not', async () => {
    const s = service();
    const a = await s.svc.beauty('u1');
    const b = await s.svc.beauty('u1');
    expect(s.calls).toHaveLength(1);
    expect(b.items).toEqual(a.items);
    expect(s.kept.size).toBe(1);
  });

  it('a profile edit changes the inputs, and the next read is written afresh', async () => {
    const s = service();
    await s.svc.beauty('u1');
    s.setSkin('dry');
    await s.svc.beauty('u1');
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1]).toMatch(/Skin type: dry/);
    await s.svc.beauty('u1');
    expect(s.calls).toHaveLength(2);
  });

  it('two citizens are two personalisations, not one', async () => {
    const s = service();
    await s.svc.beauty('u1');
    await s.svc.beauty('u2');
    expect(s.kept.size).toBe(2);
  });

  it('a fallback is served but never kept — a bad minute is not frozen into a profile', async () => {
    const s = service({ answer: null });
    const out = await s.svc.beauty('u1');
    expect(out.items.length).toBeGreaterThan(0);
    expect(s.kept.size).toBe(0);
    await s.svc.beauty('u1');
    expect(s.calls).toHaveLength(2); // asked again — nothing was kept to answer from
  });
});

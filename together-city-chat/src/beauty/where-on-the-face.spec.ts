import { readMarks } from '../ai/ai.service';
import { BeautyService } from './beauty.service';

/**
 * WHERE ON THE FACE — owner, 6 Sep: "for every user create the image with
 * breaking down the issue on the user's face photo."
 *
 * The review says where on the first photo each finding is clearest; the app
 * draws the breakdown over the citizen's own photograph and sends it back to
 * sit beside the assessment. Two guards are proven here: the boxes the model
 * returns are kept only where they are sane, and a breakdown is kept only on
 * the citizen's own entry, only as a small JPEG, only once.
 */

describe('the boxes the review returns', () => {
  it('keeps a sane box and drops the rest', () => {
    const marks = readMarks([
      { finding: 'acne', x: 0.2, y: 0.4, w: 0.25, h: 0.3 },
      { finding: 'acne', x: 0.6, y: 0.4, w: 0.2, h: 0.2 }, // a second acne box: one per finding
      { finding: 'redness', x: 0.5, y: 0.5, w: 0.01, h: 0.2 }, // a sliver
      { finding: 'wrinkle', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, // not among the findings
      { finding: 'pore', x: '0.3', y: 0.3, w: 0.2, h: 0.2 }, // not a number
      { finding: 'pigmentation', x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, // clipped to the photo
    ], ['acne', 'redness', 'pore', 'pigmentation']);
    expect(marks).toEqual([
      { finding: 'acne', x: 0.2, y: 0.4, w: 0.25, h: 0.3 },
      { finding: 'pigmentation', x: 0.9, y: 0.9, w: 0.1, h: 0.1 },
    ]);
  });

  it('is empty for anything that is not a list, and never longer than four', () => {
    expect(readMarks(null, ['acne'])).toEqual([]);
    expect(readMarks('acne', ['acne'])).toEqual([]);
    const many = ['acne', 'pore', 'redness', 'texture', 'wrinkle', 'pigmentation'].map((finding, i) => ({ finding, x: i * 0.1, y: 0.1, w: 0.1, h: 0.1 }));
    expect(readMarks(many, many.map((m) => m.finding))).toHaveLength(4);
  });
});

function service(progress: { id: string; breakdown?: string | null }[] | null) {
  const writes: Record<string, unknown>[] = [];
  const prisma = {
    beautyProfile: {
      findUnique: async () => (progress ? { progressJson: JSON.stringify(progress) } : null),
      update: async (a: { data: Record<string, unknown> }) => { writes.push(a.data); return {}; },
    },
  };
  const svc = Object.create(BeautyService.prototype) as BeautyService;
  Object.assign(svc, { prisma });
  return { svc, writes };
}

const JPEG = `data:image/jpeg;base64,${'A'.repeat(64)}`;

describe('keeping the breakdown', () => {
  it('sits beside the entry it was drawn for, once', async () => {
    const { svc, writes } = service([{ id: 'e1' }, { id: 'e2' }]);
    await expect(svc.saveBreakdown('u1', 'e2', JPEG)).resolves.toEqual({ ok: true, kept: true });
    const saved = JSON.parse(writes[0].progressJson as string) as { id: string; breakdown?: string }[];
    expect(saved[1].breakdown).toBe(JPEG);
    expect(saved[0].breakdown).toBeUndefined();
    // A second image for the same entry does not replace the first.
    const again = service(saved);
    await expect(again.svc.saveBreakdown('u1', 'e2', JPEG)).resolves.toEqual({ ok: true, kept: false });
    expect(again.writes).toEqual([]);
  });

  it('refuses an entry that is not on the timeline, and anything that is not a small JPEG', async () => {
    const { svc, writes } = service([{ id: 'e1' }]);
    await expect(svc.saveBreakdown('u1', 'nope', JPEG)).rejects.toThrow(/not on your timeline/);
    await expect(svc.saveBreakdown('u1', 'e1', `data:image/png;base64,${'A'.repeat(64)}`)).rejects.toThrow(/JPEG/);
    await expect(svc.saveBreakdown('u1', 'e1', `data:image/jpeg;base64,${'A'.repeat(400_001)}`)).rejects.toThrow(/JPEG/);
    await expect(service(null).svc.saveBreakdown('u1', 'e1', JPEG)).rejects.toThrow(/not on your timeline/);
    expect(writes).toEqual([]);
  });
});

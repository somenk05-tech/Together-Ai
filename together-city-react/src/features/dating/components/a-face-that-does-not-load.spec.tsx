import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ── A REFUSED PHOTOGRAPH IS A LETTER, NOT A BROKEN FRAME ──
 *
 * `GET /dating/photo/:token` answers 404 for every refusal alike — expired
 * link, photo pulled in review, person blocked, profile hidden since the card
 * was built. Failure is a normal outcome on this path, so every place that
 * renders a dating photograph has to survive one. Four of them rendered a bare
 * <img> whose only fallback was an ABSENT src, so a src that was present and
 * refused gave the browser's broken-image glyph in the middle of a face.
 *
 * Two things are pinned: that Portrait shows the letter when the image errors,
 * and that no dating surface goes back to a bare <img> for a photograph.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('a face that does not load', () => {
  it('falls back to the letter once the image errors, and not before', async () => {
    const { Portrait } = await import('./Portrait');
    const letter = <span className="dt-shot-none">S</span>;
    const html = renderToStaticMarkup(<Portrait src="/dating/photo/tok" fallback={letter} />);
    expect(html).toContain('<img');
    expect(html).not.toContain('dt-shot-none');

    const none = renderToStaticMarkup(<Portrait src={undefined} fallback={letter} />);
    expect(none).toContain('dt-shot-none');
    expect(none).not.toContain('<img');
  });

  it('gives every img an onError, because a bare one cannot fail well', () => {
    const html = renderToStaticMarkup(<>{null}</>);
    expect(html).toBe('');
    const src = read('./Portrait.tsx');
    expect(src).toContain('onError');
    // The failed src is remembered, not a boolean: a carousel that moves on
    // must try the next photograph rather than inherit the last one's failure.
    expect(src).toMatch(/useState<string \| null>/);
  });

  it('leaves no dating surface rendering a photograph as a bare img', () => {
    for (const f of ['./MatchCards.tsx', '../pages/DatingMatches.tsx']) {
      const src = read(f);
      const bare = src.match(/<img[^>]*src=\{(photo|photos\[active\])/g) ?? [];
      expect({ file: f, bare }).toEqual({ file: f, bare: [] });
    }
  });
});

void vi;

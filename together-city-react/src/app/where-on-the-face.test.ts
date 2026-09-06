import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BREAKDOWN_COPY, copyFor, frameFor, ringSeats } from '../features/beauty/breakdown';

/**
 * THE BREAKDOWN — owner, 6 Sep: "for every user create the image with
 * breaking down the issue on the user's face photo."
 *
 * The review says where on the front photo each finding is clearest; the app
 * draws the editorial over the citizen's own photograph — the print frame
 * with the zoomed crop, the finding and its line, the causes in a ring — and
 * sends the JPEG back to sit beside the assessment. The geometry is pure and
 * proven here; the wiring is read off the page.
 */

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('the print frame', () => {
  const W = 720, H = 900;

  it('is centred on the mark and kept inside the picture', () => {
    const f = frameFor({ finding: 'acne', x: 0.3, y: 0.4, w: 0.2, h: 0.2 }, W, H);
    expect(Math.abs(f.x + f.w / 2 - 0.4 * W)).toBeLessThanOrEqual(1);
    expect(Math.abs(f.y + f.h / 2 - 0.5 * H)).toBeLessThanOrEqual(1);
    // A mark in the corner: the frame slides in rather than hanging off the edge.
    const c = frameFor({ finding: 'acne', x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, W, H);
    expect(c.x + c.w).toBeLessThanOrEqual(W);
    expect(c.y + c.h).toBeLessThanOrEqual(H);
    expect(c.x).toBeGreaterThanOrEqual(0);
  });

  it('crops what is under the mark, grown to the print\'s own aspect, never past the photo', () => {
    const f = frameFor({ finding: 'acne', x: 0.3, y: 0.4, w: 0.3, h: 0.1 }, W, H);
    const inner = f.w - f.border * 2, innerH = f.h - f.border * 2 - f.caption;
    expect(f.sw / f.sh).toBeCloseTo(inner / innerH, 2);
    expect(f.sw).toBeGreaterThanOrEqual(0.3 * W - 1);
    expect(f.sx).toBeGreaterThanOrEqual(0);
    expect(f.sx + f.sw).toBeLessThanOrEqual(W + 0.01);
    expect(f.sy + f.sh).toBeLessThanOrEqual(H + 0.01);
    // The crop is centred where the mark is.
    expect(Math.abs(f.sx + f.sw / 2 - 0.45 * W)).toBeLessThanOrEqual(1);
  });

  it('seats the causes around the frame, inside the picture', () => {
    const f = frameFor({ finding: 'acne', x: 0.05, y: 0.05, w: 0.2, h: 0.2 }, W, H);
    const seats = ringSeats(f, W, H, 5);
    expect(seats).toHaveLength(5);
    for (const s of seats) {
      expect(s.x).toBeGreaterThanOrEqual(W * 0.04);
      expect(s.x).toBeLessThanOrEqual(W * 0.96);
      expect(s.y).toBeGreaterThanOrEqual(H * 0.05);
      expect(s.y).toBeLessThanOrEqual(H * 0.95);
    }
    expect(ringSeats(f, W, H, 3)).toHaveLength(3);
    expect(ringSeats(f, W, H, 9)).toHaveLength(5);
  });
});

describe('what the print says', () => {
  it('has a title, a line and causes for every tag the review can return', () => {
    // The tags are the API's ALLOWED list, read off its source so the two cannot drift.
    const api = readFileSync(join(__dirname, '..', '..', '..', 'together-city-chat', 'src', 'ai', 'ai.service.ts'), 'utf8');
    const m = /const ALLOWED = \[([^\]]+)\]/.exec(api);
    expect(m).not.toBeNull();
    const tags = m![1].split(',').map((t) => t.trim().replace(/^'|'$/g, '')).filter(Boolean);
    expect(tags.length).toBeGreaterThan(10);
    for (const t of tags) {
      const c = BREAKDOWN_COPY[t];
      expect(c, t).toBeDefined();
      expect(c.title.length).toBeGreaterThan(2);
      expect(c.line.length).toBeGreaterThan(8);
      expect(c.causes.length).toBeGreaterThanOrEqual(3);
      expect(c.causes.length).toBeLessThanOrEqual(5);
    }
    // Wellness, not diagnosis: no tag is described as a disease to treat.
    for (const c of Object.values(BREAKDOWN_COPY)) expect(`${c.title} ${c.line}`).not.toMatch(/diagnos|disease|cure/i);
  });

  it('names a tag it does not know rather than showing the tag', () => {
    expect(copyFor('sun-damage').title).toBe('Sun damage');
    expect(copyFor('sun-damage').causes).toEqual([]);
  });
});

describe('the wiring', () => {
  const page = read('features/beauty/pages/Profile.tsx');

  it('draws the breakdown from the photo the page still holds, the moment the assessment is back', () => {
    expect(page).toMatch(/drawBreakdown\(facePic\.preview, p\.marks, p\.photoFindings\)/);
    expect(page).toMatch(/breakdown\.mutate\(\{ entryId: p\.entryId as string, image \}\)/);
    // The photos are cleared as before; the picture is drawn from the copy in hand, not from the server.
    expect(page.indexOf('setPics({});')).toBeLessThan(page.indexOf('drawBreakdown(facePic.preview'));
  });

  it('shows the latest breakdown on the progress sheet, as a print', () => {
    expect(page).toMatch(/<figure className="beauty-breakdown">/);
    expect(page).toMatch(/alt="Your latest photo, with what the assessment saw marked on it"/);
    const css = read('styles/layout.css');
    expect(css).toMatch(/\.beauty-breakdown img \{[^}]*max-width: 360px/);
  });

  it('draws in the hub\'s own paper and ink, not literals', () => {
    const src = read('features/beauty/breakdown.ts');
    expect(src).not.toMatch(/rgba?\(|#[0-9a-fA-F]{3,6}\b/);
    expect(src).toMatch(/getPropertyValue\('--paper'\)/);
    expect(src).toMatch(/getPropertyValue\('--ink'\)/);
    expect(src).toMatch(/getPropertyValue\('--scrim-deep'\)/);
  });

  it('keeps the picture under the API\'s cap, re-encoding down rather than sending nothing', () => {
    const src = read('features/beauty/breakdown.ts');
    expect(src).toMatch(/BREAKDOWN_CAP = 400_000/);
    expect(src).toMatch(/while \(out\.length > BREAKDOWN_CAP && q > 0\.4\)/);
    const api = readFileSync(join(__dirname, '..', '..', '..', 'together-city-chat', 'src', 'beauty', 'beauty.service.ts'), 'utf8');
    expect(api).toMatch(/const BREAKDOWN_CAP = 400_000;/);
  });
});

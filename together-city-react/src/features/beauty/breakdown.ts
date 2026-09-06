/**
 * THE BREAKDOWN — owner, 6 Sep: "for every user create the image with
 * breaking down the issue on the user's face photo."
 *
 * The review says where on the front photo each finding is clearest (a box
 * in the photo's own fractions — see PhotoMark on the API). This draws the
 * editorial over the citizen's own photograph, on a canvas, in the browser,
 * from the full-size photo the page still holds at that moment: the
 * photograph, a white print frame over the clearest patch holding a zoomed
 * crop of it, the finding's name and one line under the crop, and the likely
 * causes in a ring around the frame. Nothing is generated and nothing leaves
 * the browser but the finished JPEG, which goes back to sit beside the
 * assessment on the timeline.
 *
 * The geometry is pure and tested; the drawing is the only part that needs a
 * document. Colours come from the tokens the page already computes — the
 * print is on the hub's own paper, in its own ink.
 */

export interface PhotoMark { finding: string; x: number; y: number; w: number; h: number }

export interface FindingCopy { title: string; line: string; causes: string[] }

/** What each tag the review can return says on the print. Wellness, not diagnosis. */
export const BREAKDOWN_COPY: Record<string, FindingCopy> = {
  acne:           { title: 'Acne',            line: 'a blocked pore, not an enemy',            causes: ['Hormonal changes', 'Excess sebum', 'Dead-cell build-up', 'Comedogenic products', 'Stress & sleep'] },
  pigmentation:   { title: 'Pigmentation',    line: 'melanin left behind by sun or a spot',     causes: ['Sun without SPF', 'Post-acne marks', 'Hormones', 'Friction & heat'] },
  wrinkle:        { title: 'Fine lines',      line: 'where the skin folds most often',          causes: ['Sun over years', 'Less collagen', 'Dehydration', 'Expression', 'Smoking'] },
  texture:        { title: 'Uneven texture',  line: 'dead cells the skin has not shed',         causes: ['Slow cell turnover', 'Dehydration', 'Over-exfoliation', 'Old acne'] },
  pore:           { title: 'Visible pores',   line: 'a pore looks large when it is full',       causes: ['Excess sebum', 'Lost elasticity', 'Sun damage', 'Genetics'] },
  redness:        { title: 'Redness',         line: 'a barrier asking for less, not more',      causes: ['A weakened barrier', 'Heat & spice', 'Harsh actives', 'Sensitivity', 'Sun'] },
  dehydration:    { title: 'Dehydration',     line: 'water, not oil, is what is missing',       causes: ['Too little water', 'Dry air & AC', 'Hot showers', 'Stripping cleansers'] },
  'dark-circles': { title: 'Dark circles',    line: 'thin skin showing what is under it',       causes: ['Short sleep', 'Genetics', 'Rubbing & allergies', 'Dehydration', 'Screens'] },
  density:        { title: 'Hair density',    line: 'fewer strands per patch of scalp',         causes: ['Genetics', 'Iron & protein', 'Hormones', 'Stress', 'Tight styles'] },
  thickness:      { title: 'Hair thickness',  line: 'each strand growing finer',                causes: ['Nutrition', 'Hormones', 'Heat & chemicals', 'Age'] },
  hairline:       { title: 'Hairline',        line: 'the edge moving back or thinning',         causes: ['Genetics', 'Hormones', 'Tight styles', 'Stress'] },
  scalp:          { title: 'Scalp',           line: 'the skin the hair grows from',             causes: ['Build-up', 'Oil & sweat', 'Harsh shampoo', 'Fungal balance'] },
  dandruff:       { title: 'Dandruff',        line: 'a scalp shedding faster than it should',   causes: ['Malassezia yeast', 'Dry scalp', 'Product build-up', 'Stress', 'Infrequent washing'] },
};

/** A citizen-facing name for a finding the copy table does not know. */
export function copyFor(finding: string): FindingCopy {
  return BREAKDOWN_COPY[finding] ?? { title: finding.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), line: 'what the photo shows', causes: [] };
}

export interface Frame {
  /** The print frame on the canvas, outer edge. */
  x: number; y: number; w: number; h: number;
  /** The photo region the crop is cut from, in canvas pixels. */
  sx: number; sy: number; sw: number; sh: number;
  /** Border and caption heights, so the crop sits inside them. */
  border: number; caption: number;
}

/**
 * Where the print frame goes. It is a portrait print about 46% of the width,
 * centred on the mark but kept inside the picture; the crop is the mark's
 * box grown to the print's aspect, so the zoom is honest — the frame shows
 * what is under it, larger, not a different patch. Pure.
 */
export function frameFor(mark: PhotoMark, W: number, H: number): Frame {
  const border = Math.round(W * 0.018);
  const caption = Math.round(W * 0.075);
  const w = Math.round(W * 0.46);
  const inner = w - border * 2;
  const innerH = Math.round(inner * 1.2);
  const h = innerH + border * 2 + caption;
  const cx = (mark.x + mark.w / 2) * W;
  const cy = (mark.y + mark.h / 2) * H;
  const x = Math.round(Math.min(Math.max(cx - w / 2, border), W - w - border));
  const y = Math.round(Math.min(Math.max(cy - h / 2, border), H - h - border));
  // The crop: the mark's box, grown to the print's aspect, never wider than the photo.
  const aspect = inner / innerH;
  let sw = mark.w * W, sh = mark.h * H;
  if (sw / sh > aspect) sh = sw / aspect; else sw = sh * aspect;
  sw = Math.min(sw, W); sh = Math.min(sh, H);
  const sx = Math.min(Math.max(cx - sw / 2, 0), W - sw);
  const sy = Math.min(Math.max(cy - sh / 2, 0), H - sh);
  return { x, y, w, h, sx, sy, sw, sh, border, caption };
}

/** Points on a ring around the frame for the causes: five seats, clockwise from top-left. */
export function ringSeats(f: Frame, W: number, H: number, n: number): { x: number; y: number; align: 'left' | 'right' | 'center' }[] {
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  const rx = f.w * 0.78, ry = f.h * 0.62;
  const angles = [-140, -40, 20, 90, 160].slice(0, Math.max(0, Math.min(5, n)));
  return angles.map((deg) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.min(Math.max(cx + Math.cos(a) * rx, W * 0.04), W * 0.96);
    const y = Math.min(Math.max(cy + Math.sin(a) * ry, H * 0.05), H * 0.95);
    const align: 'left' | 'right' | 'center' = Math.cos(a) < -0.3 ? 'right' : Math.cos(a) > 0.3 ? 'left' : 'center';
    return { x, y, align };
  });
}

/** The three tokens the print is drawn in, read off the page so the hub's own paper and ink are used. */
function inks(): { paper: string; ink: string; scrim: string; sans: string } {
  const cs = getComputedStyle(document.documentElement);
  const paper = cs.getPropertyValue('--paper').trim() || 'white';
  const ink = cs.getPropertyValue('--ink').trim() || 'black';
  const scrim = cs.getPropertyValue('--scrim-deep').trim() || ink;
  const sans = cs.getPropertyValue('--sans').trim() || 'sans-serif';
  return { paper, ink, scrim, sans };
}

/** The largest data URL the API keeps (its BREAKDOWN_CAP); the JPEG is re-encoded down to fit. */
export const BREAKDOWN_CAP = 400_000;

/**
 * Draw the breakdown over the photo and return it as a JPEG data URL.
 * `findings` orders the marks: the first finding with a mark gets the print,
 * the rest get a ring and a label. Resolves '' when nothing can be drawn (no
 * marks, no canvas, an image that will not load).
 */
export function drawBreakdown(photoDataUrl: string, marks: PhotoMark[], findings: string[]): Promise<string> {
  const ordered = [...findings.map((f) => marks.find((m) => m.finding === f)), ...marks].filter((m): m is PhotoMark => Boolean(m))
    .filter((m, i, a) => a.indexOf(m) === i);
  if (!ordered.length) return Promise.resolve('');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = 720;
      const H = Math.round((img.height / img.width) * W);
      if (!H || H > 1400) return resolve('');
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      if (!ctx) return resolve('');
      const { paper, ink, scrim, sans } = inks();
      ctx.drawImage(img, 0, 0, W, H);

      // The print: a white frame with the zoomed crop inside and a caption under it.
      const [first, ...rest] = ordered;
      const f = frameFor(first, W, H);
      const copy = copyFor(first.finding);
      ctx.save();
      ctx.shadowColor = scrim; ctx.shadowBlur = 28; ctx.shadowOffsetY = 8;
      ctx.fillStyle = paper; ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.restore();
      const inner = f.w - f.border * 2, innerH = f.h - f.border * 2 - f.caption;
      ctx.drawImage(img, (f.sx / W) * img.width, (f.sy / H) * img.height, (f.sw / W) * img.width, (f.sh / H) * img.height, f.x + f.border, f.y + f.border, inner, innerH);
      ctx.fillStyle = ink; ctx.textBaseline = 'middle';
      const cap = f.y + f.h - f.caption / 2;
      const titleFont = `700 ${Math.round(W * 0.026)}px ${sans}`;
      const lineFont = `400 ${Math.round(W * 0.026)}px ${sans}`;
      ctx.font = titleFont; const tw = ctx.measureText(`${copy.title}: `).width;
      ctx.font = lineFont; const lw = ctx.measureText(copy.line).width;
      let x0 = f.x + f.w / 2 - (tw + lw) / 2;
      if (tw + lw > inner) { x0 = f.x + f.border; }
      ctx.font = titleFont; ctx.textAlign = 'left'; ctx.fillText(`${copy.title}: `, x0, cap, inner);
      ctx.font = lineFont; ctx.fillText(copy.line, x0 + tw, cap, Math.max(0, inner - tw));

      // The ring of causes around the print.
      const label = (text: string, x: number, y: number, align: CanvasTextAlign, size: number, weight: number) => {
        ctx.font = `${weight} ${size}px ${sans}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, size * 0.22); ctx.lineJoin = 'round';
        ctx.strokeStyle = scrim; ctx.strokeText(text, x, y);
        ctx.fillStyle = paper; ctx.fillText(text, x, y);
      };
      const seats = ringSeats(f, W, H, copy.causes.length);
      seats.forEach((s, i) => label(copy.causes[i], s.x, s.y, s.align, Math.round(W * 0.03), 500));

      // Every other finding: a small ring on its patch with its name beside it.
      for (const m of rest) {
        const mx = (m.x + m.w / 2) * W, my = (m.y + m.h / 2) * H;
        ctx.beginPath(); ctx.arc(mx, my, W * 0.02, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = paper; ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, W * 0.02 + 1.5, 0, Math.PI * 2);
        ctx.lineWidth = 1; ctx.strokeStyle = scrim; ctx.stroke();
        const right = mx < W * 0.5;
        label(copyFor(m.finding).title, mx + (right ? 1 : -1) * W * 0.035, my, right ? 'left' : 'right', Math.round(W * 0.026), 600);
      }
      // Down to the API's cap: a 720px print at .8 is usually ~150 KB of URL.
      let q = 0.8, out = c.toDataURL('image/jpeg', q);
      while (out.length > BREAKDOWN_CAP && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      resolve(out.length > BREAKDOWN_CAP ? '' : out);
    };
    img.onerror = () => resolve('');
    img.src = photoDataUrl;
  });
}

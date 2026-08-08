import { qrMatrix } from './qr';

/**
 * THE CITIZEN CARD — the owner's artwork, with the citizen printed on it.
 *
 * A card somebody sends to a friend outside Together City has to leave the
 * app as a picture. The obvious route is a styled <div> and an
 * HTML-to-canvas library, and it is the wrong one twice over: it is a
 * dependency, and it renders an APPROXIMATION of the DOM — fonts substitute,
 * gradients band, and what downloads is not quite what was on screen.
 *
 * Drawing once, to a canvas that is itself the preview, means there is no
 * second rendering path to drift. What you look at is the file.
 *
 * THE PALETTE IS FIXED, AND THAT IS NOT A BREACH OF THE TOKEN RULE. Every
 * other surface in this application reads its colour from tokens.css so it can
 * follow the room it is in. This one is an exported PNG: it leaves the
 * application, it is looked at in somebody else's messaging app, and it cannot
 * read a CSS variable at any point in its life. A card that changed colour
 * depending on which hub you were standing in when you pressed Download would
 * be a bug, not a feature.
 *
 * THE METAL IS A PHOTOGRAPH NOW, and that changed the ink. The CSS-drawn
 * gradients this replaced were mild; the real artwork swings from L=0.11 to
 * L=0.63 across the area the fields sit in — a factor of six — and no single
 * ink clears AA over all of it. Black measured 11.4:1 on the bright specular
 * and 2.7:1 in the dark of the brushing, on the same card, twenty millimetres
 * apart.
 *
 * So the type sits on a FEATHERED FROSTED PLATE, which is how a real metal
 * card carries print and not a compromise invented here. At 58% white the
 * darkest five per cent of the ground lifts to L=0.50, which puts the values
 * at 9.2:1 and the labels at 5.5:1 — measured against the actual pixels of
 * the artwork, not estimated. The plate is feathered at every edge so the
 * brushing and the iridescence still read through it.
 */

export const CARD_W = 2000;
export const CARD_H = 1251;          /* the artwork's own proportion, 1.599:1 */

/* Ink chosen against the artwork, not against a preference — see the note
   above. The gold is darker than the printed "CITIZEN CARD" on the plate
   because it has to survive the dark side of the brushing. */
const INK = '#17181a';
const LABEL = '#4a3d1f';
const FOOT = '#2c2f34';
const GOLD_RULE = 'rgba(120,99,56,.55)';

export interface CardData {
  name: string;
  handle: string;
  email: string;
  /** Already-loaded portrait, or null for the initials fallback. */
  photo: HTMLImageElement | null;
  /** The card artwork. Null draws a plain ground rather than nothing. */
  art: HTMLImageElement | null;
  /** What the QR points at, and what is printed along the foot. */
  url: string;
  /** "Citizen since Nov 2025", or null. */
  since: string | null;
}

const rounded = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

/** Uppercase tracked label. Canvas letter-spacing is not supported everywhere,
 *  so it is drawn a glyph at a time. */
function tracked(c: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cursor = x;
  for (const ch of text) {
    c.fillText(ch, cursor, y);
    cursor += c.measureText(ch).width + spacing;
  }
}

/** Shrink until it fits. A card is a fixed rectangle and a name is not. */
function fit(c: CanvasRenderingContext2D, text: string, max: number, weight: number, size: number) {
  let s = size;
  for (;;) {
    c.font = `${weight} ${s}px 'General Sans', system-ui, sans-serif`;
    if (c.measureText(text).width <= max || s <= 18) return;
    s -= 1;
  }
}

/**
 * The frosted plate the type is printed on.
 *
 * Feathered on all four sides rather than drawn as a rectangle: a hard-edged
 * white box on brushed metal is a sticker, and the whole point of the artwork
 * is the brushing showing through.
 *
 * IT IS BUILT OFFSCREEN, and that is not fussiness. The obvious way to feather
 * two axes is a horizontal gradient followed by a vertical `destination-out`
 * pass — and `destination-out` erases the DESTINATION, which on the main
 * canvas is the artwork. The first version punched a transparent strip
 * through the metal along the top and bottom of every plate, which rendered
 * as a hard bright line: the page showing through the card. On its own canvas
 * the only destination is the plate.
 */
function plate(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha: number) {
  const off = document.createElement('canvas');
  off.width = Math.ceil(w); off.height = Math.ceil(h);
  const o = off.getContext('2d');
  if (!o) return;

  const fx = Math.min(150, w / 2.6), fy = Math.min(120, h / 2.6);
  const gx = o.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(fx / w, `rgba(255,255,255,${alpha})`);
  gx.addColorStop(1 - fx / w, `rgba(255,255,255,${alpha})`);
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  o.fillStyle = gx; o.fillRect(0, 0, w, h);

  o.globalCompositeOperation = 'destination-out';
  const gy = o.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,1)');
  gy.addColorStop(fy / h, 'rgba(0,0,0,0)');
  gy.addColorStop(1 - fy / h, 'rgba(0,0,0,0)');
  gy.addColorStop(1, 'rgba(0,0,0,1)');
  o.fillStyle = gy; o.fillRect(0, 0, w, h);

  c.drawImage(off, x, y);
}

export function drawCitizenCard(c: CanvasRenderingContext2D, d: CardData) {
  const W = CARD_W, H = CARD_H;
  c.clearRect(0, 0, W, H);

  /* ── the metal ──
     Full bleed, square corners: the artwork brings its own rounded card and
     its own surround. Clipping to a rounded rect here would round the
     SURROUND and leave transparent corners in a picture people paste into
     chat apps. */
  if (d.art) {
    c.drawImage(d.art, 0, 0, W, H);
  } else {
    c.fillStyle = '#b9bcc2'; c.fillRect(0, 0, W, H);
  }

  /* ── the portrait, set into the metal ── */
  const px = 170, py = 350, pw = 340, ph = 500;
  c.save();
  rounded(c, px, py, pw, ph, 30); c.clip();
  if (d.photo) {
    const s = Math.max(pw / d.photo.width, ph / d.photo.height);
    const w = d.photo.width * s, h = d.photo.height * s;
    c.drawImage(d.photo, px + (pw - w) / 2, py + (ph - h) / 2, w, h);
  } else {
    plate(c, px, py, pw, ph, 0.7);
    c.fillStyle = '#6e727a';
    c.font = "700 130px 'General Sans', system-ui, sans-serif";
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(initials(d.name), px + pw / 2, py + ph / 2);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 5;
  rounded(c, px, py, pw, ph, 30); c.stroke();
  c.strokeStyle = GOLD_RULE; c.lineWidth = 3;
  rounded(c, px + 5, py + 5, pw - 10, ph - 10, 26); c.stroke();

  /* ── the three fields, on their plate ── */
  const fx = 570, fw = 770;
  /* The plate starts a feather-width further out than the type on every side,
     so the type never sits in the ramp: full opacity begins at x=530 and
     y=370, and the first glyph is at x=570, y=424. */
  plate(c, fx - 190, 250, fw + 330, 820, 0.58);
  let y = 424;
  const field = (label: string, value: string, big = false) => {
    c.fillStyle = LABEL;
    c.font = "700 26px 'General Sans', system-ui, sans-serif";
    tracked(c, label.toUpperCase(), fx, y, 4.2);
    y += big ? 66 : 58;
    c.fillStyle = INK;
    fit(c, value, fw, 700, big ? 72 : 50);
    c.fillText(value, fx, y);
    y += 44;
    c.strokeStyle = GOLD_RULE; c.lineWidth = 2;
    c.beginPath(); c.moveTo(fx, y); c.lineTo(fx + fw, y); c.stroke();
    y += 74;
  };
  field('User name', d.name.toUpperCase(), true);
  field('Citizen no.', `@${d.handle}`);
  field('City mail', d.email);

  /* ── the code, in the corner the mark leaves free ── */
  const q = qrMatrix(d.url);
  const qSize = 240, qx = W - 170 - qSize, qy = 851;
  const quiet = 4;
  const cell = qSize / (q.length + quiet * 2);
  c.fillStyle = '#ffffff';
  rounded(c, qx - 16, qy - 16, qSize + 32, qSize + 32, 20); c.fill();
  c.strokeStyle = GOLD_RULE; c.lineWidth = 3;
  rounded(c, qx - 16, qy - 16, qSize + 32, qSize + 32, 20); c.stroke();
  c.fillStyle = '#000000';
  for (let r = 0; r < q.length; r += 1) {
    for (let col = 0; col < q.length; col += 1) {
      if (q[r][col]) c.fillRect(qx + (col + quiet) * cell, qy + (r + quiet) * cell, cell + 0.5, cell + 0.5);
    }
  }

  /* ── the foot: the thing that makes it useful outside the city ── */
  plate(c, 100, 1074, 1220, 148, 0.58);
  c.fillStyle = FOOT;
  c.font = "700 26px 'General Sans', system-ui, sans-serif";
  tracked(c, d.url.replace(/^https?:\/\//, '').toUpperCase(), 186, 1158, 3.2);
  if (d.since) tracked(c, d.since.toUpperCase(), 186 + 700, 1158, 3.2);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Load an image for the canvas, or resolve null. A portrait served from
 *  another origin without CORS headers TAINTS the canvas and makes the whole
 *  card un-exportable, so a photo that cannot be proven safe is simply not
 *  drawn — the card falls back to initials rather than failing to download. */
export function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

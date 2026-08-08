import { qrMatrix } from './qr';

/**
 * THE CITIZEN CARD — drawn to a canvas, because the canvas IS the download.
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
 */

export const CARD_W = 2000;
export const CARD_H = 1260;          /* 1.587:1 — a bank card */

/* Brushed steel, warm diffraction, and the gold rule. */
const INK = '#17181a';
const GOLD = 'rgba(150,126,72,.55)';
const GOLD_TEXT = '#8c7a4e';
const FAINT = '#7d818a';

export interface CardData {
  name: string;
  handle: string;
  email: string;
  /** Already-loaded portrait, or null for the initials fallback. */
  photo: HTMLImageElement | null;
  /** Already-loaded city mark. */
  logo: HTMLImageElement | null;
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

/** Uppercase tracked label. Canvas has no letter-spacing before Chrome 99 and
 *  none at all in some engines, so it is drawn a glyph at a time. */
function tracked(c: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cursor = x;
  for (const ch of text) {
    c.fillText(ch, cursor, y);
    cursor += c.measureText(ch).width + spacing;
  }
}

/** Shrink until it fits. A card is a fixed rectangle and a name is not. */
function fitted(c: CanvasRenderingContext2D, text: string, max: number, weight: number, size: number): number {
  let s = size;
  for (;;) {
    c.font = `${weight} ${s}px 'General Sans', system-ui, sans-serif`;
    if (c.measureText(text).width <= max || s <= 18) return s;
    s -= 1;
  }
}

export function drawCitizenCard(c: CanvasRenderingContext2D, d: CardData) {
  const W = CARD_W, H = CARD_H;
  c.clearRect(0, 0, W, H);

  /* ── the metal ── */
  rounded(c, 0, 0, W, H, 68);
  c.save(); c.clip();

  const base = c.createRadialGradient(W * 0.74, H * 0.4, 60, W * 0.74, H * 0.4, W * 0.95);
  base.addColorStop(0, '#dcdfe4'); base.addColorStop(0.44, '#bcc1c9');
  base.addColorStop(0.74, '#a2a8b2'); base.addColorStop(1, '#8b919c');
  c.fillStyle = base; c.fillRect(0, 0, W, H);

  /* The brushed swirl: fine rays about a pole placed OFF THE CARD.
     Centred on the artwork, fourteen hundred rays converge into a grey smudge
     at the pole — a blob in the middle of the card that reads as a printing
     fault. With the pole outside the trim every ray crosses as a gentle arc,
     which is what brushed metal actually looks like. */
  c.save();
  c.translate(W * 1.24, H * 0.42);
  for (let i = 0; i < 2200; i += 1) {
    c.rotate((Math.PI * 2) / 2200);
    c.strokeStyle = i % 2 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.075)';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(120, 0); c.lineTo(W * 2.4, 0); c.stroke();
  }
  c.restore();

  /* Diffraction — three soft washes and one specular sweep. */
  for (const [cx, cy, rad, col] of [
    [0.80, 0.62, 0.78, 'rgba(255,201,142,.42)'],
    [0.44, 0.14, 0.72, 'rgba(158,203,255,.40)'],
    [0.20, 0.94, 0.66, 'rgba(176,255,203,.32)'],
    [0.62, 0.86, 0.52, 'rgba(226,178,255,.26)'],
  ] as const) {
    const g = c.createRadialGradient(W * cx, H * cy, 10, W * cx, H * cy, W * rad);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  const sheen = c.createLinearGradient(W * 0.15, H, W * 0.85, 0);
  sheen.addColorStop(0.32, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.46, 'rgba(255,255,255,.26)');
  sheen.addColorStop(0.60, 'rgba(255,255,255,0)');
  c.fillStyle = sheen; c.fillRect(0, 0, W, H);
  c.restore();

  /* The inset gold rule. */
  c.strokeStyle = GOLD; c.lineWidth = 3;
  rounded(c, 32, 32, W - 64, H - 64, 44); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2;
  rounded(c, 36, 36, W - 72, H - 72, 40); c.stroke();

  /* ── the portrait ── */
  const px = 132, py = 196, pw = 440, ph = 720;
  c.save();
  rounded(c, px, py, pw, ph, 40); c.clip();
  if (d.photo) {
    const s = Math.max(pw / d.photo.width, ph / d.photo.height);
    const w = d.photo.width * s, h = d.photo.height * s;
    c.drawImage(d.photo, px + (pw - w) / 2, py + (ph - h) / 2, w, h);
  } else {
    c.fillStyle = '#b9bcc2'; c.fillRect(px, py, pw, ph);
    c.fillStyle = '#6e727a';
    c.font = "700 150px 'General Sans', system-ui, sans-serif";
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(initials(d.name), px + pw / 2, py + ph / 2);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 4;
  rounded(c, px, py, pw, ph, 40); c.stroke();
  c.strokeStyle = GOLD; c.lineWidth = 3;
  rounded(c, px + 4, py + 4, pw - 8, ph - 8, 36); c.stroke();

  /* ── the three fields ── */
  const fx = px + pw + 96;
  const fieldMax = W - fx - 400;
  let y = py + 62;
  const field = (label: string, value: string, big = false) => {
    c.fillStyle = GOLD_TEXT;
    c.font = "700 26px 'General Sans', system-ui, sans-serif";
    tracked(c, label.toUpperCase(), fx, y, 4.2);
    y += big ? 66 : 58;
    c.fillStyle = INK;
    const size = fitted(c, value, fieldMax, 700, big ? 76 : 52);
    c.fillText(value, fx, y);
    y += big ? 26 : 22;
    c.strokeStyle = GOLD; c.lineWidth = 2;
    c.beginPath(); c.moveTo(fx, y + 22); c.lineTo(fx + fieldMax, y + 22); c.stroke();
    y += 116;
    void size;
  };
  field('User name', d.name.toUpperCase(), true);
  field('Citizen no.', `@${d.handle}`);
  field('City mail', d.email);

  /* ── the QR, and the mark ── */
  const q = qrMatrix(d.url);
  const qSize = 262, qx = W - 132 - qSize, qy = 196;
  const quiet = 4;
  const cell = qSize / (q.length + quiet * 2);
  c.fillStyle = '#ffffff';
  rounded(c, qx - 14, qy - 14, qSize + 28, qSize + 28, 22); c.fill();
  c.strokeStyle = GOLD; c.lineWidth = 2.5;
  rounded(c, qx - 14, qy - 14, qSize + 28, qSize + 28, 22); c.stroke();
  c.fillStyle = '#000000';
  for (let r = 0; r < q.length; r += 1) {
    for (let col = 0; col < q.length; col += 1) {
      if (q[r][col]) c.fillRect(qx + (col + quiet) * cell, qy + (r + quiet) * cell, cell + 0.5, cell + 0.5);
    }
  }

  if (d.logo) {
    const ls = 186;
    c.globalAlpha = 0.9;
    c.drawImage(d.logo, W - 132 - ls, H - 118 - ls, ls, ls);
    c.globalAlpha = 1;
  }

  /* ── the foot: the thing that makes it useful outside the city ── */
  c.fillStyle = FAINT;
  c.font = "700 26px 'General Sans', system-ui, sans-serif";
  tracked(c, d.url.replace(/^https?:\/\//, '').toUpperCase(), 132, H - 108, 3.4);
  if (d.since) tracked(c, d.since.toUpperCase(), 132 + 720, H - 108, 3.4);
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

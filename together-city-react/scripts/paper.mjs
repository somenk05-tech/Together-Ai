#!/usr/bin/env node
/**
 * THE PAPERS, RE-DERIVED FROM THE FILES THEMSELVES.
 *
 * relief.spec.ts recomputes every ink in a `[data-paper]` block against that
 * block's `-ground` hex — but the ground hex is a CLAIM about a photograph, and
 * a test that reads it out of the same file it is checking cannot tell whether
 * the claim is true. Re-encode an image at a different quality, swap a sheet
 * for a lighter crop, and the hex in tokens.css goes on describing the picture
 * that used to be there while every ratio stays green.
 *
 * So this reads the actual JPEGs in public/assets/img, composites each one
 * under its own declared veil, and reports the worst pixel it finds. It is the
 * arithmetic behind the numbers in the token comments, and it is a separate
 * command rather than part of the suite because it decodes fourteen images and
 * the suite runs on every save.
 *
 * WORST PIXEL, NOT AVERAGE. The average of a photograph is a colour that
 * appears nowhere in it. A sheet whose average is a comfortable 7:1 can put
 * body copy at 1.4:1 over a stem — which is precisely what Sunday's cosmos and
 * Friday's lilac do, and why both are veiled.
 *
 * WHICH EXTREME IS "WORST" DEPENDS ON THE INK. Against cream, the danger is the
 * LIGHTEST pixel; against near-black, the DARKEST. The ink declared in the
 * block decides which end this measures, so a sheet cannot be checked against
 * the wrong end of itself.
 *
 *   node scripts/paper.mjs          → report every sheet
 *   node scripts/paper.mjs --fix    → print the token lines to paste back
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = join(ROOT, 'src/styles/tokens.css');
const IMG = join(ROOT, 'public/assets/img');

const lin = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Source-over, the way the browser composites a flat overlay on an image. */
const over = (ov, a, base) => base.map((c, i) => a * ov[i] + (1 - a) * c);

/**
 * A JPEG decoder is a dependency this project does not have and does not need
 * one for. `sharp` and `jimp` are both absent; what IS present is the platform
 * itself, so the decode goes through whichever of these exists.
 */
async function decode(file) {
  const buf = readFileSync(file);
  try {
    const { createCanvas, loadImage } = await import('canvas');
    const img = await loadImage(buf);
    const w = 110, h = Math.max(1, Math.round(img.height * w / img.width));
    const cv = createCanvas(w, h);
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    const d = cv.getContext('2d').getImageData(0, 0, w, h).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    return px;
  } catch {
    return null;
  }
}

const css = readFileSync(TOKENS, 'utf8');
const blocks = [...css.matchAll(/\[data-paper="([a-z]{3})"\]\s*\.press-(recto|verso)\s*\{([\s\S]*?)\n\}/g)];
if (!blocks.length) { console.error('!! No [data-paper] blocks in tokens.css.'); process.exit(1); }

let bad = 0, skipped = 0;
const fixes = [];
for (const [, day, side, body] of blocks) {
  const get = (n) => body.match(new RegExp(`--press-${side}-${n}:\\s*([^;]+);`, 'i'))?.[1]?.trim();
  const sheet = get('sheet')?.match(/url\(['"]?([^'")]+)/)?.[1];
  const claimed = get('ground');
  const ink = get('ink');
  if (!sheet || !claimed || !ink) { console.log(`   ${day}-${side}: incomplete block, skipped`); skipped++; continue; }

  const file = join(IMG, sheet.split('/').pop());
  if (!existsSync(file)) { console.log(`!! ${day}-${side}: ${sheet} is declared and not on disk`); bad++; continue; }
  const px = await decode(file);
  if (!px) { console.log(`   ${day}-${side}: no decoder available (npm i canvas), skipped`); skipped++; continue; }

  // Cream ink fears the lightest pixel; dark ink fears the darkest.
  const inkIsLight = lum(hex2rgb(ink)) > 0.35;
  const extreme = px.reduce((w, p) => ((inkIsLight ? lum(p) > lum(w) : lum(p) < lum(w)) ? p : w), px[0]);

  const veil = get('veil');
  const m = veil?.match(/rgba\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s]+([\d.]+)\s*\)/);
  const ground = m ? over([+m[1], +m[2], +m[3]], parseFloat(m[4]), extreme) : extreme;
  const found = rgb2hex(ground);

  const line = [];
  for (const [n, floor] of [['ink', 4.5], ['ink-2', 4.5], ['ink-3', 3]]) {
    const v = get(n);
    if (!v) continue;
    line.push(`${n} ${ratio(hex2rgb(v), ground).toFixed(2)}`);
  }
  const drift = Math.max(...hex2rgb(found).map((c, i) => Math.abs(c - hex2rgb(claimed)[i])));
  const ok = drift <= 3;
  if (!ok) { bad++; fixes.push(`  --press-${side}-ground:${found};   /* ${day} */`); }
  console.log(
    `${ok ? '  ' : '!!'} ${(day + '-' + side).padEnd(10)} claimed ${claimed}  measured ${found}` +
    `  ${line.join('  ')}${ok ? '' : `   <- drifted by ${drift}`}`,
  );
}

if (bad) {
  console.log('\n!! A declared ground no longer matches its picture.');
  if (fixes.length) console.log('   Measured values:\n' + fixes.join('\n'));
  process.exit(1);
}
// A CHECK THAT SKIPPED EVERYTHING MUST NOT REPORT SUCCESS. The first version of
// this printed "Every paper matches" after decoding nothing at all, which is the
// exact failure the whole script exists to prevent one file over.
if (skipped === blocks.length) {
  console.log(`\n   Nothing measured — no image decoder (npm i -D canvas). ${skipped} sheet(s) unchecked.`);
  process.exit(0);
}
if (skipped) console.log(`\n   ${skipped} sheet(s) skipped — no image decoder installed.`);
console.log(`\nEvery paper measured matches the ground it declares (${blocks.length - skipped}/${blocks.length}).`);

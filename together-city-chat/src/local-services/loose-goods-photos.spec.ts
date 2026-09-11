import { readFileSync } from 'fs';
import { join } from 'path';
import { LOOSE_GOODS_PHOTOS } from './loose-goods-photos.data';
import { STOCK_PHOTO_COUNT, photoKey, stockPhotoForName, stockPhotoForRef } from './loose-goods-photos';

/**
 * ── A STOCK PHOTOGRAPH IS AN ILLUSTRATION, CITED, AND NEVER A GUESS ─────────
 *
 * Owner, 11 Sep: "let users add the images for the item; for now you scrape
 * the internet and add the items photos."
 */
describe('the loose-goods photo bank', () => {
  it('holds a few hundred products, each with one Commons photograph under a licence that allows it', () => {
    expect(STOCK_PHOTO_COUNT).toBeGreaterThan(150);
    for (const p of LOOSE_GOODS_PHOTOS) {
      expect(p.url).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
      expect(p.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(p.licence).toMatch(/^(CC BY(-SA)? \d(\.\d)?|CC0|Public domain)/);
      expect(p.aliases.length).toBeGreaterThan(0);
    }
  });

  it('keys no two products on the same spelling', () => {
    const seen = new Map<string, string>();
    for (const p of LOOSE_GOODS_PHOTOS) for (const a of p.aliases) {
      expect(seen.get(a) ?? p.key).toBe(p.key);
      seen.set(a, p.key);
    }
  });

  it('matches a typed name EXACTLY — case and spacing forgiven, nothing else', () => {
    expect(stockPhotoForName('Toor Dal')?.url).toBe(stockPhotoForName('toor dal')?.url);
    expect(stockPhotoForName('  Rice   (Regular) ')).toEqual(stockPhotoForName('Rice (Regular)'));
    expect(stockPhotoForName('Toor Dal Premium 5kg')).toBeNull();
    expect(stockPhotoForName('Too')).toBeNull();
    expect(stockPhotoForName('')).toBeNull();
    expect(photoKey('Bhindi( Ladies Finger )')).toBe('bhindi (ladies finger)');
  });

  it('answers a catalogue row by its Agmarknet id, and nothing for a barcode row', () => {
    const withRef = LOOSE_GOODS_PHOTOS.find((p) => p.refs.length);
    expect(withRef).toBeDefined();
    expect(stockPhotoForRef('agmarknet', (withRef as { refs: string[] }).refs[0])?.url).toBe((withRef as { url: string }).url);
    expect(stockPhotoForRef('openfoodfacts', '8901063342934')).toBeNull();
  });

  it('carries the credit on every answer — the photographer, Wikimedia Commons, the licence, the file page', () => {
    const p = stockPhotoForName('onion');
    expect(p).not.toBeNull();
    expect(p?.credit.name).toMatch(/Wikimedia Commons$/);
    expect(p?.credit.licence).toMatch(/^(CC|Public domain)/);
    expect(p?.credit.url).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  });

  it('is never read by the aisle, and the menu resolves own → catalogue → stock in that order', () => {
    const grocery = readFileSync(join(__dirname, 'grocery.ts'), 'utf8');
    expect(grocery).not.toMatch(/loose-goods-photos/);
    const svc = readFileSync(join(__dirname, 'local-services.service.ts'), 'utf8');
    const fn = svc.slice(svc.indexOf('function resolveMenuPhoto('), svc.indexOf('\n}\n', svc.indexOf('function resolveMenuPhoto(')));
    const own = fn.indexOf('if (own) return { photoUrl: own, photoCredit: null }');
    const pack = fn.indexOf('if (product?.imageUrl) return');
    const stock = fn.indexOf('stockPhotoForName(name)');
    expect(own).toBeGreaterThan(-1);
    expect(pack).toBeGreaterThan(own);
    expect(stock).toBeGreaterThan(pack);
  });
});

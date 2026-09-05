import { keyUnderPublicBases, publicBaseOf, publicBasesFrom } from './public-bases';
import { keyFromUrl } from '../messages/chat-media-guard';

/**
 * ── A STORED URL OUTLIVES THE DOMAIN IT WAS WRITTEN UNDER (launch gate,
 *    third reading, 4 Sep) ────────────────────────────────────────────────
 *
 * Production serves public media from the r2.dev development address today.
 * The day it moves to a custom domain, every row written before the cutover
 * carries the old base — and every reader compared against the current one
 * only: a deleted post left its photograph in the bucket, an old attachment
 * could not be forwarded. MEDIA_LEGACY_PUBLIC_BASES names the old bases and
 * every reader honours them.
 */
const NEW = 'https://media.togethercity.app';
const OLD = 'https://pub-055c50e82c5b47f5b6f014f0f017cc15.r2.dev';

describe('a stored URL outlives its domain', () => {
  it('reads the current base first, then the legacy list, trimmed and de-duplicated', () => {
    expect(publicBasesFrom(`${NEW}/`, ` ${OLD}/, ${NEW}, ,`)).toEqual([NEW, OLD]);
    expect(publicBasesFrom(NEW, undefined)).toEqual([NEW]);
    expect(publicBasesFrom('', '')).toEqual([]);
  });

  it('a key resolves under the old base as it does under the new', () => {
    const bases = publicBasesFrom(NEW, OLD);
    expect(keyUnderPublicBases(`${NEW}/uploads/u1/a.jpg`, bases)).toBe('uploads/u1/a.jpg');
    expect(keyUnderPublicBases(`${OLD}/uploads/u1/a.jpg`, bases)).toBe('uploads/u1/a.jpg');
    expect(keyUnderPublicBases('https://elsewhere.example/uploads/u1/a.jpg', bases)).toBe('');
    // A base that is a prefix of a longer hostname is not that hostname.
    expect(publicBaseOf(`${NEW}.evil.example/uploads/u1/a.jpg`, bases)).toBeNull();
  });

  it('the chat guard takes the list too, and still refuses a foreign origin', () => {
    const bases = publicBasesFrom(NEW, OLD);
    expect(keyFromUrl(`${OLD}/uploads/u1/a.jpg`, bases)).toBe('uploads/u1/a.jpg');
    expect(keyFromUrl(`${NEW}/uploads/u1/a.jpg`, bases)).toBe('uploads/u1/a.jpg');
    expect(keyFromUrl('https://elsewhere.example/uploads/u1/a.jpg', bases)).toBeNull();
    // The single-string form the guard always took still works.
    expect(keyFromUrl(`${NEW}/uploads/u1/a.jpg`, NEW)).toBe('uploads/u1/a.jpg');
    expect(keyFromUrl(`${OLD}/uploads/u1/a.jpg`, NEW)).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A PAGE OF FACES HAS TO FIT ITS OWN CEILING ──
 *
 * The photo route wore the list routes' throttle: twenty a minute, argued for
 * a request that scans up to POOL_CEILING rows and signs every card's photos.
 * This route reads one object, and Browse asks for two hundred cards — so the
 * first paint of the hub was twenty photographs and a hundred and eighty 429s,
 * every other card a coloured letter. The throttler keys per handler per IP,
 * so one office address shared the twenty between strangers.
 *
 * The invariant is a relation, not a number: the per-image ceiling has to
 * clear a full page with room for the re-fetches a scroll causes. The web
 * app's page size is named here so that raising it finds this test.
 */
const controller = readFileSync(join(__dirname, 'dating.controller.ts'), 'utf8');
const browse = readFileSync(
  join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'dating', 'pages', 'DatingBrowse.tsx'),
  'utf8',
);

const limitOf = (name: string) => {
  const m = new RegExp(`const ${name} = \\{ default: \\{ ttl: 60_000, limit: (\\d+) \\} \\};`).exec(controller);
  return m ? Number(m[1]) : null;
};

describe('a page of faces fits its own ceiling', () => {
  it('does not serve images under the list-scan throttle', () => {
    const route = controller.slice(controller.indexOf("@Get('photo/:token')") - 200, controller.indexOf("@Get('photo/:token')"));
    expect(route).toMatch(/@Throttle\(PHOTO_LIMIT\)/);
    expect(route).not.toMatch(/@Throttle\(LIST_LIMIT\)/);
  });

  it('clears a full browse page with room for a scroll', () => {
    const perMinute = limitOf('PHOTO_LIMIT');
    const page = Number(/BROWSE_PAGE = (\d+)/.exec(browse)?.[1]);
    expect(perMinute).not.toBeNull();
    expect(page).toBeGreaterThan(0);
    expect(perMinute!).toBeGreaterThanOrEqual(page * 2);
  });

  it('leaves the list routes where they were — they are the expensive ones', () => {
    expect(limitOf('LIST_LIMIT')).toBe(20);
  });
});

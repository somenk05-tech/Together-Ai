import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE OWNER'S SCREEN SPEAKS THE TRADE IT BELONGS TO ───────────────────────
 *
 * Owner, 9 Sep: "audit the entire local services and improve the section. Food
 * items, restaurants and electronic stores should have an option to upload
 * images by the business lister."
 *
 * THE IMAGE UPLOAD WAS ALREADY THERE. It was inside "More", between Spice
 * level and Prep minutes — a panel a plumber, a tutor and an electronics shop
 * had no reason to open, under a heading that said "Today's menu". It was not
 * missing. It was unreachable, which from the outside is the same thing, and
 * that is why it was asked for.
 *
 * The audit that came with the request found the rest: one component written
 * for a restaurant, rendered for all ~140 trades.
 */
describe('the picture is not an advanced setting', () => {
  const mcc = code('features/services/MenuCommandCenter.tsx');

  it('puts the photo control on the row, for every trade', () => {
    const row = mcc.slice(mcc.indexOf('<div className="mcc-row">'), mcc.indexOf('{food && more &&'));
    expect(row).toMatch(/type="file" accept="image\/\*"/);
  });

  it('does not hide it behind More any more', () => {
    /* The panel it used to live in is a restaurant's, and is now only drawn
       for one. A photo control inside it would be invisible to the two trades
       that asked for it. */
    const behind = mcc.slice(mcc.indexOf('{food && more &&'));
    expect(behind).not.toMatch(/type="file" accept="image\/\*"/);
  });
});

describe('the command centre stops calling everything a menu', () => {
  const mcc = code('features/services/MenuCommandCenter.tsx');

  it('takes the catalogue it is drawing, rather than assuming one', () => {
    expect(mcc).toMatch(/MenuCommandCenter\(\{ listingId, catalogue \}/);
    const page = code('features/services/pages/MyBusiness.tsx');
    /* MyBusiness had `l.catalogue` one line away and was handing it only to
       MenuEditor. */
    expect(page).toMatch(/<MenuCommandCenter listingId=\{l\.id\} catalogue=\{l\.catalogue\} \/>/);
  });

  it('says the trade’s own word for the list and for one row of it', () => {
    expect(mcc).toMatch(/\{words\.title\.toLowerCase\(\)\}/);
    expect(mcc).toMatch(/count === 1 \? words\.noun : words\.plural/);
    expect(mcc).not.toMatch(/Today’s menu</);
    expect(mcc).not.toMatch(/'item' : 'items'/);
  });

  it('does not tell an electronics shop its television is sold out', () => {
    expect(mcc).toMatch(/food \? '● Sold out' : '● Out of stock'/);
  });
});

describe('food-only controls are offered only to food', () => {
  const mcc = code('features/services/MenuCommandCenter.tsx');

  it('gates diet, spice, prep, sizes and add-ons behind the menu kind', () => {
    /* A plumber was offered veg/non-veg, three chillies and "Extra gravy
       +₹40". The server wrote all of them without asking. */
    expect(mcc).toMatch(/const food = words\.kind === 'menu';/);
    expect(mcc).toMatch(/\{food && more && \(/);
  });

  it('hides the More key itself when nothing is behind it', () => {
    /* A disclosure that opens on an empty panel is worse than no disclosure:
       it teaches an owner there is something here they are failing to find. */
    expect(mcc).toMatch(/\{food && \(\s*\n?\s*<button type="button" className="svo-linkbtn"/);
  });
});

describe('a till only where one can ring', () => {
  const page = code('features/services/pages/MyBusiness.tsx');

  it('reads orderable on the owner’s side, as the citizen’s side already did', () => {
    /* A salon, a taxi stand and a tutor were each handed an orders strip, an
       Orders board and an Invoices book for a counter that cannot take money.
       `!== false` rather than `=== true`: a card that arrived without a
       catalogue keeps everything it had, which is the menu. */
    expect(page).toMatch(/l\.catalogue\?\.orderable !== false && <OrdersStrip/);
    expect((page.match(/l\.catalogue\?\.orderable !== false/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the form promises the shelf the owner will actually land on', () => {
  const form = code('features/services/ListingForm.tsx');

  it('no longer indexes the catalogues by the business type’s kind alone', () => {
    /* THE BUG THIS AUDIT FOUND, and it is the one that was already reported
       once: `catalogues[chosenType.catalogue]` always resolved the GROCERY
       stock entry, so an electronics shop was told "your products go on the
       city's Grocery Store shelf" before its page existed. The server-side fix
       never reached this line. */
    expect(form).not.toMatch(/types\.data\?\.catalogues\?\.\[chosenType\.catalogue\]/);
    expect(form).toMatch(/const tradeCatalogueKey = categoryKey/);
  });

  it('lets the trade win over the type, and only for stock', () => {
    /* A restaurant filed under Food publishes a menu because it IS a
       restaurant — the type is right about that. The type is a SHAPE ("Shop"),
       and which stock list a shop publishes is a fact about what it sells. */
    expect(form).toMatch(/chosenType\.catalogue\.startsWith\('stock'\) \? \(tradeCatalogueKey \?\? chosenType\.catalogue\)/);
  });
});

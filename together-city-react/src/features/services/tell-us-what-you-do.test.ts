import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── TELL US WHAT YOU DO. WE BUILD THE REST. (owner, 17 Sep) ──────────────────
 *
 * "I'd actually avoid leading with 'List a service'. Instead: Create your
 * business on Together City. Tell us what you do. We'll build the rest."
 *
 * The create page opens on one box, reads the sentence through the one
 * route, and hands the reading to the SAME form the edit screen uses — no
 * second form. Read with comments stripped: the prose here says all of this
 * on purpose, and a guard that reads its own explanation is not a guard.
 */
const root = join(__dirname, '..', '..', '..');
const src = (p: string) => readFileSync(join(root, 'src', p), 'utf8');
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');

describe('the create page', () => {
  const page = code('features/services/pages/ListBusiness.tsx');

  it('opens on the question, not on a template picker', () => {
    expect(page).toContain('Create your business on Together City');
    expect(page).toContain('Tell us what you do. We build the rest.');
    expect(page).toContain('What kind of business do you have?');
    expect(page).not.toMatch(/template/i);
  });

  it('reads the sentence through the one route, and nothing is stored by it', () => {
    const wire = code('features/services/understand.api.ts');
    expect(wire).toContain("api.post<Understanding>('/services/understand'");
    expect(wire).not.toMatch(/invalidateQueries/);
    expect(page).toContain('useUnderstandBusiness');
  });

  it('says the reading back and builds with the form that has always existed', () => {
    expect(page).toContain("Great. Let's create your ${reading.noun}.");
    expect(page).toContain('<ListingForm');
    expect(page).toContain('understood={!!trade && !changing}');
    // The reading pre-fills; the form still asks everything the type asks.
    expect(page).toContain('categoryKey: trade.categoryKey, businessType: trade.typeKey');
  });

  it('keeps the list as a road, for a sentence nobody could read', () => {
    expect(page).toContain('Pick from the list instead');
    expect(page).toContain("setChanging(r.confidence === 'unsure')");
  });

  it('ends on the ready page, with the address and the door to the catalogue', () => {
    expect(page).toContain('Your {noun} is ready.');
    expect(page).toContain('See it as customers do');
    expect(page).toContain('Edit your ${made.catalogue.title.toLowerCase()}');
  });
});

describe('the one form', () => {
  const form = code('features/services/ListingForm.tsx');

  it('folds the three dropdowns behind the reading, and opens them on Change', () => {
    expect(form).toContain('understood = false');
    expect(form).toContain('{understood && categoryKey && (');
    expect(form).toContain('{!understood && (<>');
    expect(form).toContain('onClick={() => onChangeTrade?.()}');
  });

  it('always lists the chosen type, whatever group it was filed under', () => {
    expect(form).toMatch(/t\.group === group \|\| t\.key === 'general' \|\| t\.key === businessType/);
  });
});

describe('the catalogue is a step of the page (owner, 17 Sep)', () => {
  const page = code('features/services/pages/ListBusiness.tsx');

  it('asks for the menu, the stock list or the rates right here, with the editor open', () => {
    expect(page).toContain("'catalogue'");
    expect(page).toContain('<MenuEditor listingId={made.id} catalogue={made.catalogue} startOpen />');
    expect(page).toContain("card.catalogue.kind !== 'none' ? 'catalogue' : 'ready'");
  });

  it('names the step in the catalogue\'s own word, never "menu" for everyone', () => {
    expect(page).toContain('Your {reading.catalogue.title.toLowerCase()}');
    expect(page).not.toMatch(/Your menu\b/);
  });
});

describe('a unique page for each kind of business', () => {
  const server = readFileSync(join(root, '..', 'together-city-chat', 'src', 'local-services', 'understand.ts'), 'utf8');
  const client = code('features/services/engine.ts');
  const grab = (src: string) => {
    const m = src.match(/const ENGINE_OF_TYPE[^=]*=\s*\{([\s\S]*?)\};/);
    return Object.fromEntries([...(m?.[1] ?? '').matchAll(/(\w+):\s*'(\w+)'/g)].map((x) => [x[1], x[2]]));
  };

  it('reads the same engine map the server names', () => {
    const a = grab(server), b = grab(client);
    expect(Object.keys(a).length).toBeGreaterThan(10);
    expect(b).toEqual(a);
  });

  it('opens the page on what the business is for — the front card, then the catalogue, before the facts', () => {
    const biz = code('features/services/pages/BusinessPage.tsx');
    const front = biz.indexOf('<EngineFront');
    const menu = biz.indexOf('<OrderMenu');
    const glance = biz.indexOf('bold="glance"');
    expect(front).toBeGreaterThan(0);
    expect(menu).toBeGreaterThan(front);
    expect(glance).toBeGreaterThan(menu);
  });

  it('a clinic asks for an appointment, a garage asks for the vehicle and the problem, and both end in the anonymous thread', () => {
    const ef = code('features/services/EngineFront.tsx');
    expect(ef).toContain("engine === 'healthcare' || engine === 'professional'");
    expect(ef).toContain('Book an appointment');
    expect(ef).toContain("s.businessType === 'transport'");
    expect(ef).toContain('What vehicle do you have?');
    expect(ef).toContain('Describe the problem');
    expect(ef).toContain('mediaApi.upload(f)');
    expect((ef.match(/enquire\.mutate\(/g) ?? []).length).toBe(2);
    expect(ef).not.toMatch(/Add to cart|checkout/i);
  });
});

describe('the doors', () => {
  it('the rail says what the door does, and every button calls it creating', () => {
    // The rail LABEL stays "List your business": /dev's ROOM_FLAGS carries
    // the same words and a-door-at-a-time.test.ts holds the two together.
    expect(code('config/hubs.ts')).toContain("path: '/services/list', index: '05', label: 'List your business', sub: 'Tell us what you do");
    expect(code('features/services/pages/Browse.tsx')).not.toContain('List your business');
    expect(code('features/services/pages/MyBusiness.tsx')).not.toContain('List your business');
  });
});

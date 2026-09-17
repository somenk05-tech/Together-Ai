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
    expect(page).toContain('Add your ${made.catalogue.title.toLowerCase()}');
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

describe('the doors', () => {
  it('the rail says what the door does, and every button calls it creating', () => {
    // The rail LABEL stays "List your business": /dev's ROOM_FLAGS carries
    // the same words and a-door-at-a-time.test.ts holds the two together.
    expect(code('config/hubs.ts')).toContain("path: '/services/list', index: '05', label: 'List your business', sub: 'Tell us what you do");
    expect(code('features/services/pages/Browse.tsx')).not.toContain('List your business');
    expect(code('features/services/pages/MyBusiness.tsx')).not.toContain('List your business');
  });
});

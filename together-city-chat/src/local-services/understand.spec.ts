import { BUSINESS_TYPES, businessType, catalogueFor } from './business-types';
import { OFFERED_CATEGORIES, categoryGroup } from './categories';
import {
  ENGINES, TYPES_WITHOUT_AN_ENGINE, engineForType, nounFor, ordersFromEngine, readName, readPlace,
  typeForCategory, understandByRules, unreadable,
} from './understand';
import { UnderstandService } from './understand.service';

/**
 * ── TELL US WHAT YOU DO (owner, 17 Sep) ──────────────────────────────────────
 *
 * The owner's own sentences, read the way he said they would be. Each one
 * lands on a trade, a type and an engine — and the wrong kind of question is
 * never asked: "a doctor is never asked about an Add to Cart menu; a
 * restaurant is never asked about consultation duration; a mechanic isn't
 * given salon-style treatment menus."
 */
describe('what do you do — the owner\'s sentences', () => {
  const cases: Array<[string, string, string, string]> = [
    // sentence, trade, type, engine
    ['I run a café in Bandra.', 'cafes', 'cafe', 'food'],
    ["I'm an orthopaedic doctor.", 'specialists', 'clinic', 'healthcare'],
    ["I have a women's salon.", 'beauty_salons', 'salon', 'appointments'],
    ['I repair cars.', 'mechanics', 'transport', 'job'],
    ['I sell handmade jewellery.', 'jewelry_stores', 'retail', 'store'],
    ["I'm a personal trainer.", 'personal_trainers', 'gym', 'appointments'],
    ['I own a café in Bandra that serves coffee, sandwiches and desserts.', 'cafes', 'cafe', 'food'],
    ["I'm a dermatologist with a clinic in Andheri", 'skin_clinics', 'clinic', 'healthcare'],
    ['We are a kirana store in Powai', 'grocery_stores', 'grocery', 'store'],
    ['Restaurant — Mughlai and Chinese, dine-in and delivery', 'restaurants', 'restaurant', 'food'],
    ['I do plumbing and geyser repairs', 'plumbers', 'trade', 'job'],
    ['Mobile shop, all brands, EMI available', 'mobile_shops', 'electronics', 'store'],
    ['I am a lawyer practising family law', 'lawyers', 'professional', 'professional'],
    ['I teach guitar to kids', 'music_lessons', 'tuition', 'classes'],
    ['Wedding photographer', 'photographers', 'creative', 'events'],
    ['Dog grooming at home', 'pet_grooming', 'petcare', 'pets'],
    ['Packers and movers', 'movers_and_packers', 'transport', 'job'],
    ['Medical store open 24 hours', 'pharmacies', 'diagnostics', 'healthcare'],
    ['I am a vet', 'veterinary_clinics', 'petcare', 'pets'],
  ];
  it.each(cases)('%s', (sentence, trade, type, engine) => {
    const r = understandByRules(sentence);
    expect(r).not.toBeNull();
    expect(r!.categoryKey).toBe(trade);
    expect(r!.typeKey).toBe(type);
    expect(r!.engine.key).toBe(engine);
    expect(r!.confidence).toBe('sure');
  });

  it('reads the place off the sentence when the tree knows it', () => {
    expect(readPlace('I run a café in Bandra.')).toEqual({ city: 'Mumbai', area: 'Bandra' });
    expect(readPlace('kirana in Mumbai')).toEqual({ city: 'Mumbai', area: null });
    expect(readPlace('a salon')).toEqual({ city: null, area: null });
    expect(understandByRules('I run a café in Bandra.')!.city).toBe('Mumbai');
  });

  it('takes a name only when one was given', () => {
    expect(readName('My café is called Bean Theory and it is in Bandra')).toBe('Bean Theory');
    expect(readName('"Bombay Kitchen", Mughlai, in Colaba')).toBe('Bombay Kitchen');
    expect(readName('I run a café in Bandra')).toBeNull();
  });

  it('is unsure, not wrong, when only a hint landed — and says nothing when nothing did', () => {
    expect(understandByRules("I'm a doctor")!.confidence).toBe('unsure');
    expect(understandByRules('I sell things')!.confidence).toBe('unsure');
    expect(understandByRules('hello there')).toBeNull();
    expect(unreadable('hello there').categoryKey).toBe('other');
    expect(unreadable('hello there').typeKey).toBe('general');
  });

  it('offers the runner-up as the first correction', () => {
    const r = understandByRules('hair salon with nails')!;
    expect(r.alternatives.map((a) => a.categoryKey)).toContain('nail_salons');
    expect(r.alternatives.every((a) => a.categoryKey !== r.categoryKey)).toBe(true);
    expect(r.alternatives.length).toBeLessThanOrEqual(3);
  });
});

describe('the engines', () => {
  it('every business type runs on one', () => {
    expect(TYPES_WITHOUT_AN_ENGINE).toEqual([]);
    for (const t of BUSINESS_TYPES) expect(ENGINES.map((e) => e.key)).toContain(engineForType(t.key).key);
  });

  it('every offered trade resolves to a real type, an engine and a noun', () => {
    for (const c of OFFERED_CATEGORIES) {
      const t = typeForCategory(c.key);
      expect(businessType(t)).not.toBeNull();
      expect(engineForType(t).label.length).toBeGreaterThan(0);
      expect(nounFor(c.key, t).length).toBeGreaterThan(0);
    }
  });

  it('a doctor is never asked about a cart; a restaurant is never asked for a consultation fee', () => {
    // The engines that ORDER are the ones whose catalogue is orderable, and
    // no other — the fact the owner's whole brief stands on.
    for (const c of OFFERED_CATEGORIES) {
      const t = typeForCategory(c.key);
      const cat = catalogueFor(t, c.key, categoryGroup(c.key));
      expect(ordersFromEngine(engineForType(t).key)).toBe(cat.orderable);
    }
    const doctor = businessType(typeForCategory('specialists'))!;
    expect(doctor.fields.map((f) => f.key)).toContain('consultFee');
    expect(doctor.sections).not.toContain('menu');
    const restaurant = businessType(typeForCategory('restaurants'))!;
    expect(restaurant.fields.map((f) => f.key)).not.toContain('consultFee');
    expect(restaurant.sections).toContain('menu');
    const garage = businessType(typeForCategory('mechanics'))!;
    expect(garage.fields.map((f) => f.key)).not.toContain('treatments');
  });
});

describe('the model is the second opinion, never the first', () => {
  const ai = { json: jest.fn() };
  const svc = new UnderstandService(ai as never);
  beforeEach(() => ai.json.mockReset());

  it('does not ask the model when the rules are sure', async () => {
    const r = await svc.understand('I run a café in Bandra.');
    expect(r.categoryKey).toBe('cafes');
    expect(r.source).toBe('rules');
    expect(ai.json).not.toHaveBeenCalled();
  });

  it('asks the model when unsure, and takes its answer only off the list', async () => {
    ai.json.mockResolvedValueOnce({ categoryKey: 'tailors' });
    const r = await svc.understand('I stitch for the ladies in my building');
    expect(ai.json).toHaveBeenCalledTimes(1);
    expect(r.categoryKey).toBe('tailors');
    expect(r.source).toBe('model');
    expect(r.confidence).toBe('likely');
  });

  it('throws away a key the model invented and keeps the rules\' reading', async () => {
    ai.json.mockResolvedValueOnce({ categoryKey: 'unicorn_groomers' });
    const r = await svc.understand("I'm a doctor");
    expect(r.categoryKey).toBe('general_physicians');
    expect(r.source).toBe('rules');
  });

  it('a budget refusal is not an error the owner sees — the list is', async () => {
    ai.json.mockRejectedValueOnce(new Error('429 daily ceiling'));
    const r = await svc.understand('hello there');
    expect(r.categoryKey).toBe('other');
    expect(r.confidence).toBe('unsure');
  });
});

/**
 * THE SCHEMA ENGINE.
 *
 * One rule underneath everything: a business should never be shown a field
 * that does not apply to it. A plumber asked for a cuisine, or a dentist asked
 * for delivery radius, learns that this form was not built for them and stops
 * filling it in — and a directory of half-filled listings is a directory
 * nobody can search.
 *
 * So the form is not written. It is GENERATED, from the declarations below.
 *
 *     category group → business type → fields → page sections → card
 *
 * Everything downstream reads this one file. Adding "Dentist" means adding an
 * entry here, and the listing form, the business page, the search card and the
 * owner's dashboard all change together. There is no second place to update
 * and therefore no second place to forget.
 *
 * WHY THE ANSWERS LIVE IN ONE JSON COLUMN. The alternative — a column per
 * field — means a migration every time a trade gets a new question, forty
 * mostly-null columns on one table, and a schema that encodes today's guess
 * about hairdressing. `detailsJson` holds `{ fieldKey: value }` and the field
 * declarations below are what give those keys meaning. The cost is that the
 * database cannot type-check them, which is exactly what `business-types.spec`
 * is for.
 *
 * WHAT IS DELIBERATELY NOT HERE. No colours, no fonts, no icon names. A
 * generated palette per business would break the one thing that makes a city
 * of fourteen hubs feel like one place, and Relief's five depths are not
 * negotiable per listing. What varies is WHICH SECTIONS a page has and WHAT
 * QUESTIONS it asks — the structure, not the skin.
 */

export type FieldKind =
  | 'text'      // one line
  | 'longtext'  // a paragraph
  | 'number'    // a count
  | 'money'     // rupees
  | 'minutes'   // a duration
  | 'toggle'    // yes / no
  | 'chips'     // choose any of
  | 'select';   // choose one of

export interface FieldDef {
  /** The key inside detailsJson. Frozen once shipped — renaming orphans data. */
  key: string;
  label: string;
  kind: FieldKind;
  /** Said under the field, in the owner's language, never the system's. */
  hint?: string;
  options?: readonly string[];
  max?: number;
}

/**
 * The sections a page of this type carries, in the order they appear.
 *
 * This is the "dynamic business page" in one word each. A restaurant's page
 * leads with its menu; a doctor's leads with credentials and never mentions a
 * menu at all.
 */
export type SectionKind =
  | 'about' | 'menu' | 'priceList' | 'offers' | 'gallery'
  | 'reviews' | 'credentials' | 'availability' | 'location';

export interface BusinessType {
  key: string;
  label: string;
  /** The category group it is offered under — see categories.ts. */
  group: string;
  /** One line, shown under the choice, so an owner picks the right one. */
  blurb: string;
  fields: readonly FieldDef[];
  sections: readonly SectionKind[];
}

/** Every page has these, whatever the trade. Types add to them, never replace. */
const BASE_SECTIONS: readonly SectionKind[] = ['about', 'offers', 'gallery', 'reviews', 'location'];

const OPEN_TODAY: FieldDef = {
  key: 'openToday', label: 'Taking work today', kind: 'toggle',
  hint: 'Shows on your page and in search. Turn it off when you are full.',
};
const EMERGENCY: FieldDef = {
  key: 'emergency', label: 'Emergency call-outs', kind: 'toggle',
  hint: 'Out of hours, at short notice.',
};
const HOME_VISIT: FieldDef = {
  key: 'homeVisit', label: 'I come to you', kind: 'toggle',
};
const YEARS: FieldDef = {
  key: 'years', label: 'Years doing this', kind: 'number', max: 80,
};
const VISIT_FEE: FieldDef = {
  key: 'visitFee', label: 'Visiting charge', kind: 'money',
  hint: 'What it costs for you to come and look. Leave blank if there is none.',
};

/**
 * THE TYPES.
 *
 * Fewer, sharper types beat one per category. "Restaurant" and "Cafe" ask
 * genuinely different questions; "Clothing store" and "Furniture store" do not
 * — both are Retail, and pretending otherwise means two lists to maintain and
 * a difference no citizen can see.
 */
export const BUSINESS_TYPES: readonly BusinessType[] = [
  {
    key: 'restaurant', label: 'Restaurant', group: 'Food & Daily Needs',
    blurb: 'Sit-down meals, with a menu.',
    sections: ['about', 'menu', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'cuisines', label: 'Cuisines', kind: 'chips',
        options: ['South Indian', 'North Indian', 'Chinese', 'Continental', 'Mughlai', 'Bengali', 'Gujarati', 'Italian', 'Thai', 'Japanese', 'Middle Eastern', 'Street food'] },
      { key: 'diet', label: 'What you serve', kind: 'chips',
        options: ['Pure veg', 'Non-veg', 'Vegan options', 'Jain options', 'Halal', 'Eggless'] },
      { key: 'seats', label: 'Seats', kind: 'number', max: 2000 },
      { key: 'dining', label: 'How people eat', kind: 'chips',
        options: ['Dine in', 'Takeaway', 'Delivery'] },
      { key: 'costForTwo', label: 'Typical cost for two', kind: 'money' },
    ],
  },
  {
    key: 'cafe', label: 'Café or tea house', group: 'Food & Daily Needs',
    blurb: 'Coffee, tea, and somewhere to sit.',
    sections: ['about', 'menu', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'comforts', label: 'What people come for', kind: 'chips',
        options: ['Wi-Fi', 'Power points', 'Good for working', 'Pet friendly', 'Outdoor seating', 'Live music', 'Board games'] },
      { key: 'seats', label: 'Seats', kind: 'number', max: 500 },
      { key: 'costForTwo', label: 'Typical cost for two', kind: 'money' },
    ],
  },
  {
    key: 'bakery', label: 'Bakery or sweets', group: 'Food & Daily Needs',
    blurb: 'Baked and made fresh, sold over a counter.',
    sections: ['about', 'menu', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'madeFresh', label: 'Baked on the premises', kind: 'toggle' },
      { key: 'orders', label: 'Takes orders for', kind: 'chips',
        options: ['Birthday cakes', 'Wedding cakes', 'Bulk orders', 'Custom designs', 'Eggless'] },
      { key: 'noticeHours', label: 'Notice needed for an order', kind: 'number', hint: 'In hours.', max: 720 },
    ],
  },
  {
    key: 'salon', label: 'Salon or spa', group: 'Personal Care',
    blurb: 'Hair, skin, nails, treatments — booked by appointment.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'treatments', label: 'What you do', kind: 'chips',
        options: ['Hair', 'Colour', 'Skin and facials', 'Nails', 'Waxing', 'Massage', 'Bridal', 'Grooming and beard', "Men's", "Women's", 'Unisex'] },
      { key: 'stylists', label: 'People working', kind: 'number', max: 200 },
      { key: 'appointmentOnly', label: 'Appointment only', kind: 'toggle',
        hint: 'Leave off if people can walk in.' },
      HOME_VISIT,
    ],
  },
  {
    key: 'clinic', label: 'Clinic or doctor', group: 'Healthcare',
    blurb: 'Consultations, by appointment.',
    sections: ['about', 'credentials', 'priceList', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'speciality', label: 'Speciality', kind: 'text', hint: 'General medicine, dentistry, physiotherapy, and so on.' },
      { key: 'qualifications', label: 'Qualifications', kind: 'text', hint: 'As you would write them on a board outside.' },
      { key: 'regNumber', label: 'Registration number', kind: 'text',
        hint: 'Shown on your page. Citizens can check it with the council.' },
      YEARS,
      { key: 'consultFee', label: 'Consultation fee', kind: 'money' },
      { key: 'modes', label: 'How people are seen', kind: 'chips',
        options: ['In clinic', 'Video consultation', 'Home visit'] },
    ],
  },
  {
    key: 'diagnostics', label: 'Diagnostics or pharmacy', group: 'Healthcare',
    blurb: 'Tests, scans, medicines.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'services', label: 'What you offer', kind: 'chips',
        options: ['Blood tests', 'X-ray', 'Ultrasound', 'ECG', 'Home sample collection', 'Prescription medicines', 'Delivery'] },
      { key: 'reportHours', label: 'Reports ready in', kind: 'number', hint: 'In hours.', max: 336 },
      { key: 'open24', label: 'Open 24 hours', kind: 'toggle' },
    ],
  },
  {
    key: 'trade', label: 'Repairs and trades', group: 'Home Services',
    blurb: 'Plumbing, electrics, carpentry, appliances, pest control.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'work', label: 'What you take on', kind: 'chips',
        options: ['Plumbing', 'Electrical', 'Carpentry', 'Painting', 'AC and refrigeration', 'Appliance repair', 'Pest control', 'Masonry', 'Waterproofing'] },
      EMERGENCY,
      OPEN_TODAY,
      VISIT_FEE,
      YEARS,
    ],
  },
  {
    key: 'cleaning', label: 'Cleaning and help at home', group: 'Home Services',
    blurb: 'Deep cleaning, housekeeping, laundry, cooks.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'work', label: 'What you take on', kind: 'chips',
        options: ['Deep cleaning', 'Regular housekeeping', 'Sofa and carpet', 'Kitchen', 'Bathroom', 'Post-construction', 'Laundry and ironing', 'Cooking'] },
      { key: 'staff', label: 'People you can send', kind: 'number', max: 500 },
      OPEN_TODAY,
    ],
  },
  {
    key: 'retail', label: 'Shop', group: 'Shopping',
    blurb: 'A counter or a shopfront, selling things.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'sells', label: 'What you sell', kind: 'text', hint: 'In your own words — people search this.' },
      { key: 'brands', label: 'Brands you carry', kind: 'text' },
      { key: 'fulfilment', label: 'How people get it', kind: 'chips',
        options: ['In store', 'Home delivery', 'Pickup', 'Order on request'] },
      { key: 'warranty', label: 'Warranty or exchange offered', kind: 'toggle' },
    ],
  },
  {
    key: 'gym', label: 'Gym or studio', group: 'Fitness & Sports',
    blurb: 'Training, classes, memberships.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'disciplines', label: 'What you teach', kind: 'chips',
        options: ['Weights', 'Cardio', 'CrossFit', 'Yoga', 'Pilates', 'Zumba', 'Martial arts', 'Swimming', 'Dance'] },
      { key: 'trainers', label: 'Trainers', kind: 'number', max: 200 },
      { key: 'trial', label: 'Free trial session', kind: 'toggle' },
      { key: 'personalTraining', label: 'Personal training', kind: 'toggle' },
    ],
  },
  {
    key: 'professional', label: 'Professional practice', group: 'Professional Services',
    blurb: 'Legal, accounts, architecture, design, consulting.',
    sections: ['about', 'credentials', 'priceList', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'practice', label: 'What you practise', kind: 'text', hint: 'Law, chartered accountancy, architecture, and so on.' },
      { key: 'qualifications', label: 'Qualifications', kind: 'text' },
      { key: 'regNumber', label: 'Registration or bar number', kind: 'text' },
      YEARS,
      { key: 'firstConsult', label: 'First consultation', kind: 'money',
        hint: 'Leave blank if the first conversation is free — the page will say so.' },
      { key: 'modes', label: 'How you work', kind: 'chips',
        options: ['At my office', 'At your place', 'Online', 'On site'] },
    ],
  },
  {
    key: 'creative', label: 'Photography and creative work', group: 'Event Services',
    blurb: 'Shoots, films, design, decor, performance.',
    sections: ['about', 'priceList', 'gallery', 'offers', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'covers', label: 'What you cover', kind: 'chips',
        options: ['Weddings', 'Portraits', 'Products', 'Events', 'Film and video', 'Drone', 'Editing only', 'Decor', 'Music'] },
      { key: 'packageFrom', label: 'Packages from', kind: 'money' },
      { key: 'travels', label: 'Will travel out of the city', kind: 'toggle' },
      YEARS,
    ],
  },
  {
    key: 'tuition', label: 'Teaching and coaching', group: 'Learning',
    blurb: 'Tuition, music, languages, exam coaching, driving.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'subjects', label: 'What you teach', kind: 'text' },
      { key: 'levels', label: 'Who you teach', kind: 'chips',
        options: ['Primary', 'Secondary', 'Higher secondary', 'College', 'Adults', 'Exam preparation'] },
      { key: 'format', label: 'How', kind: 'chips',
        options: ['One to one', 'Small group', 'Batch', 'Online', 'At the student’s home'] },
      { key: 'perHour', label: 'Per hour', kind: 'money' },
    ],
  },
  {
    key: 'petcare', label: 'Pet care', group: 'Pet Services',
    blurb: 'Vets, grooming, boarding, walking, training.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'work', label: 'What you do', kind: 'chips',
        options: ['Veterinary', 'Grooming', 'Boarding', 'Day care', 'Walking', 'Training', 'Pet taxi'] },
      { key: 'animals', label: 'Animals you take', kind: 'chips',
        options: ['Dogs', 'Cats', 'Birds', 'Small animals', 'Reptiles', 'Livestock'] },
      EMERGENCY,
      HOME_VISIT,
    ],
  },
  {
    key: 'transport', label: 'Vehicles and transport', group: 'Automotive',
    blurb: 'Servicing, repairs, hire, driving, moving.',
    sections: ['about', 'priceList', 'offers', 'gallery', 'reviews', 'availability', 'location'],
    fields: [
      { key: 'work', label: 'What you do', kind: 'chips',
        options: ['Servicing', 'Repairs', 'Bodywork', 'Tyres', 'Battery', 'Towing', 'Vehicle hire', 'Packers and movers', 'Driver on call'] },
      { key: 'vehicles', label: 'Vehicles you handle', kind: 'chips',
        options: ['Two-wheelers', 'Cars', 'Commercial', 'Electric'] },
      { key: 'pickup', label: 'Pick up and drop', kind: 'toggle' },
      EMERGENCY,
    ],
  },
  {
    key: 'general', label: 'Something else', group: 'Other',
    blurb: 'Nothing above fits. Say what you do in your own words.',
    sections: BASE_SECTIONS,
    fields: [
      { key: 'work', label: 'What you do', kind: 'longtext',
        hint: 'People search this text, so use the words a customer would.' },
      OPEN_TODAY,
      HOME_VISIT,
    ],
  },
];

const BY_KEY = new Map(BUSINESS_TYPES.map((t) => [t.key, t]));

export const isBusinessType = (key: string): boolean => BY_KEY.has(key);
export const businessType = (key: string): BusinessType | null => BY_KEY.get(key) ?? null;

/**
 * The types offered under a category group, plus 'general' as the last resort.
 *
 * A group with no type of its own is not an error — it gets the general one,
 * and the day somebody writes a proper type for it, every listing already
 * filed there keeps working because the answers live under field keys rather
 * than column names.
 */
export function typesForGroup(group: string): BusinessType[] {
  const own = BUSINESS_TYPES.filter((t) => t.group === group && t.key !== 'general');
  const general = BY_KEY.get('general') as BusinessType;
  return [...own, general];
}

/** The sections a page of this type renders, in order. Unknown type → the base. */
export function sectionsFor(typeKey: string | null): readonly SectionKind[] {
  return (typeKey && BY_KEY.get(typeKey)?.sections) || BASE_SECTIONS;
}

/**
 * Keep only what this type actually asks for, in the shape it asked for it.
 *
 * The server does not trust the form. A field the type does not declare is
 * dropped rather than stored — otherwise detailsJson becomes a bag anybody can
 * put anything in, and the first thing somebody puts in it is a script tag.
 */
export function cleanDetails(typeKey: string | null, raw: unknown): Record<string, unknown> {
  const t = typeKey ? BY_KEY.get(typeKey) : null;
  if (!t || typeof raw !== 'object' || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of t.fields) {
    const v = input[f.key];
    if (v == null || v === '' ) continue;
    if (f.kind === 'toggle') { if (v === true) out[f.key] = true; continue; }
    if (f.kind === 'chips') {
      if (!Array.isArray(v)) continue;
      const allowed = (f.options ?? []) as readonly string[];
      const picked = v.filter((x): x is string => typeof x === 'string' && allowed.includes(x)).slice(0, 24);
      if (picked.length) out[f.key] = picked;
      continue;
    }
    if (f.kind === 'number' || f.kind === 'money' || f.kind === 'minutes') {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d]/g, ''));
      if (Number.isFinite(n) && n > 0 && n <= (f.max ?? 10_000_000)) out[f.key] = Math.round(n);
      continue;
    }
    if (typeof v !== 'string') continue;
    // A hard cap, because a paragraph is a paragraph and a novel is somebody
    // testing what this field will hold.
    out[f.key] = v.trim().slice(0, f.kind === 'longtext' ? 1200 : 200);
  }
  return out;
}

/** The stored answers, back as labelled lines a page can print. */
export function readDetails(typeKey: string | null, stored: Record<string, unknown>): Array<{ label: string; value: string }> {
  const t = typeKey ? BY_KEY.get(typeKey) : null;
  if (!t) return [];
  const out: Array<{ label: string; value: string }> = [];
  for (const f of t.fields) {
    const v = stored[f.key];
    if (v == null) continue;
    if (f.kind === 'toggle') { if (v === true) out.push({ label: f.label, value: 'Yes' }); continue; }
    if (Array.isArray(v)) { if (v.length) out.push({ label: f.label, value: v.join(' · ') }); continue; }
    if (f.kind === 'money') { out.push({ label: f.label, value: `₹${Number(v).toLocaleString('en-IN')}` }); continue; }
    out.push({ label: f.label, value: String(v) });
  }
  return out;
}

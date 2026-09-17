/**
 * ── TELL US WHAT YOU DO. WE BUILD THE REST. (owner, 17 Sep) ──────────────────
 *
 * "The onboarding should begin with: What do you do? The vendor can type
 * naturally — 'I run a café in Bandra', 'I'm an orthopaedic doctor', 'I repair
 * cars'. Together City identifies category → business type → required fields
 * → website template → commerce/booking/chat functionality. Then it asks only
 * relevant questions. So a doctor is never asked about an Add to Cart menu."
 *
 * This file is the READING. One sentence in; a trade, a business type, the
 * engine that type runs on, and where they said they are, out. Nothing here
 * is a new schema: the trades are categories.ts, the types and their questions
 * are business-types.ts, and the engine is a NAME for the shape a type
 * already has — which catalogue it publishes and whether the city orders from
 * it or writes to it. The owner's "8–12 engines, hundreds of categories mapped
 * onto them" is exactly the category → type → catalogue chain that has run
 * this hub since 5 Aug; what was missing was the front door that walks it
 * from a sentence instead of three dropdowns.
 *
 * RULES FIRST, THE MODEL SECOND. A lexicon of the words people actually use
 * for their trade (parlour, kirana, dhaba, mithai, garage) reads the sentence
 * before any model is asked, because "I run a café" should cost nothing and
 * take no time. The model is consulted only when the rules are unsure, in
 * understand.service.ts, and it is held to the same vocabulary: it may pick a
 * key off this list, never invent one.
 *
 * WHAT A READING NEVER DOES: it never stores anything. It is a suggestion the
 * owner sees and can change with one press before a single field is saved.
 * The listing that is eventually created goes through CreateListingSchema and
 * cleanDetails like every other, so a wrong guess here costs a correction,
 * never a wrong page.
 */
import { OFFERED_CATEGORIES, categoryGroup, categoryLabel, categoryKeysMatching, isCategory } from './categories';
import { BUSINESS_TYPES, businessType } from './business-types';
import { GROCERY_CATEGORIES } from './grocery';
import { PLACES } from './places';

/**
 * ── THE ENGINES ──────────────────────────────────────────────────────────────
 *
 * One line each, in the owner's own frame: the SHAPE a business gets. Every
 * business type runs on exactly one engine, and the engine is what the owner
 * is told before the questions start — "your café gets a menu people order
 * from", not "you'll publish a menu catalogue". The words say what the city
 * actually builds today: an ordering menu orders; a rate card starts a
 * message. Nothing here promises a calendar the hub does not have.
 */
export interface Engine {
  key: string;
  label: string;
  /** What the page will do, said to the owner before they answer a question. */
  builds: string;
}

export const ENGINES: readonly Engine[] = [
  { key: 'food', label: 'Food ordering', builds: 'A menu people order from and pay for, with pickup, delivery or dine-in.' },
  { key: 'store', label: 'Store', builds: 'A stock list on the city’s shelf, a basket, and pickup or delivery.' },
  { key: 'appointments', label: 'Appointments', builds: 'Your services and rates; people pick one and write to book.' },
  { key: 'healthcare', label: 'Healthcare', builds: 'Your credentials, fee and how you see people; appointments start in chat.' },
  { key: 'job', label: 'Quote & job', builds: 'Your rates and call-outs; people describe the problem, add a photo and send it to you.' },
  { key: 'professional', label: 'Professional practice', builds: 'Your practice, qualifications and first-consultation terms; enquiries come to chat.' },
  { key: 'classes', label: 'Classes', builds: 'What you teach, for whom and how, with packages people write about.' },
  { key: 'events', label: 'Events & creative', builds: 'What you cover and your packages, with a gallery that leads the page.' },
  { key: 'pets', label: 'Pet services', builds: 'What you do and which animals you take; people write to you.' },
  { key: 'page', label: 'Your page', builds: 'About, photos, a price list and messages — the plain page.' },
];

const ENGINE_OF_TYPE: Record<string, string> = {
  restaurant: 'food', cafe: 'food', bakery: 'food',
  grocery: 'store', retail: 'store', electronics: 'store',
  salon: 'appointments', gym: 'appointments',
  clinic: 'healthcare', diagnostics: 'healthcare',
  trade: 'job', cleaning: 'job', transport: 'job',
  professional: 'professional',
  tuition: 'classes',
  creative: 'events',
  petcare: 'pets',
  general: 'page',
};

export function engineForType(typeKey: string): Engine {
  const key = ENGINE_OF_TYPE[typeKey] ?? 'page';
  return ENGINES.find((e) => e.key === key) as Engine;
}

/**
 * ── THE TYPE A TRADE RUNS ON ─────────────────────────────────────────────────
 *
 * The listing form offers the types filed under a category's GROUP, and that
 * is right for a picker — but a reading has to answer for one trade, and a
 * group is not one answer. A vet is under Healthcare and is a pet-care page;
 * a movers firm is a Home Service and quotes like transport; a driving school
 * is Automotive and teaches. The overrides are the trades whose group would
 * have picked the wrong shape; everything else takes its group's type.
 */
const TYPE_OF_CATEGORY: Record<string, string> = {
  restaurants: 'restaurant', fast_food: 'restaurant', cafes: 'cafe', bakeries: 'bakery',
  skin_clinics: 'clinic',
  veterinary_clinics: 'petcare',
  diagnostic_labs: 'diagnostics', pharmacies: 'diagnostics', blood_banks: 'diagnostics',
  ambulance_services: 'general',
  cleaning_services: 'cleaning', movers_and_packers: 'transport',
  interior_designers: 'professional', architects: 'professional',
  driving_schools: 'tuition',
  coworking_spaces: 'general', printing_services: 'general', courier_services: 'general',
  mobile_repair: 'trade', computer_repair: 'trade',
  internet_providers: 'general', cyber_cafes: 'general', photocopy_and_printing_shops: 'general',
  pet_supplies: 'retail',
  laundry: 'cleaning', dry_cleaning: 'cleaning',
  caterers: 'creative', banquet_halls: 'creative',
};
const TYPE_OF_GROUP: Record<string, string> = {
  'Food & Daily Needs': 'grocery',
  'Personal Care': 'salon',
  'Healthcare': 'clinic',
  'Home Services': 'trade',
  'Automotive': 'transport',
  'Fitness & Sports': 'gym',
  'Shopping': 'retail',
  'Electronics': 'electronics',
  'Professional Services': 'professional',
  'Pet Services': 'petcare',
  'Event Services': 'creative',
  'Learning': 'tuition',
};

export function typeForCategory(categoryKey: string): string {
  const own = TYPE_OF_CATEGORY[categoryKey];
  if (own && businessType(own)) return own;
  if ((GROCERY_CATEGORIES as readonly string[]).includes(categoryKey)) return 'grocery';
  const byGroup = TYPE_OF_GROUP[categoryGroup(categoryKey)];
  return byGroup && businessType(byGroup) ? byGroup : 'general';
}

/**
 * "Great. Let's create your café." The word after "your" — a noun the owner
 * would use for their own place, never the taxonomy's label. Trades with a
 * plain name get it; the rest fall to their type's word.
 */
const NOUN_OF_CATEGORY: Record<string, string> = {
  restaurants: 'restaurant', fast_food: 'restaurant', cafes: 'café', bakeries: 'bakery',
  grocery_stores: 'store', supermarkets: 'supermarket', convenience_stores: 'store',
  fruit_and_vegetable_markets: 'stall', butcher_shops: 'shop', fish_markets: 'stall',
  hair_salons: 'salon', beauty_salons: 'salon', nail_salons: 'salon', barbers: 'barbershop', spas: 'spa',
  hospitals: 'hospital', clinics: 'clinic', general_physicians: 'clinic', specialists: 'clinic', dentists: 'clinic',
  pharmacies: 'pharmacy', diagnostic_labs: 'lab',
  mechanics: 'garage', bike_repair: 'garage', car_wash: 'car wash', tire_shops: 'shop', car_detailing: 'studio',
  gyms: 'gym', yoga_studios: 'studio',
  lawyers: 'practice', photographers: 'studio', videographers: 'studio',
  driving_schools: 'school', preschools: 'preschool', daycare_centers: 'daycare',
};
const NOUN_OF_TYPE: Record<string, string> = {
  restaurant: 'restaurant', cafe: 'café', bakery: 'bakery', grocery: 'store', retail: 'store', electronics: 'store',
  salon: 'salon', gym: 'studio', clinic: 'clinic', diagnostics: 'lab', trade: 'service', cleaning: 'service',
  transport: 'service', professional: 'practice', creative: 'studio', tuition: 'classes', petcare: 'pet service',
  general: 'business',
};

export const nounFor = (categoryKey: string, typeKey: string): string =>
  NOUN_OF_CATEGORY[categoryKey] ?? NOUN_OF_TYPE[typeKey] ?? 'business';

/**
 * ── THE LEXICON ──────────────────────────────────────────────────────────────
 *
 * What people call their trade, in the words they say it in. Every entry is a
 * phrase and the key it names; a longer phrase outweighs a shorter one, so
 * "medical store" reads as a pharmacy before "medical" can read as a clinic,
 * and "pet store" beats "pet". Matched on whole words, never substrings —
 * "car" must not fire inside "carpenter".
 *
 * Only OFFERED keys are named here (a retired trade keeps its key in
 * categories.ts for old listings and is not a reading anybody can get).
 */
const LEXICON: ReadonlyArray<readonly [string, string] | readonly [string, string, number]> = [
  // Food & Daily Needs
  ['restaurant', 'restaurants'], ['dhaba', 'restaurants'], ['eatery', 'restaurants'], ['diner', 'restaurants'],
  ['biryani', 'restaurants'], ['thali', 'restaurants'], ['fine dining', 'restaurants'], ['cloud kitchen', 'restaurants'],
  ['kitchen', 'restaurants'], ['tiffin', 'restaurants'], ['mess', 'restaurants'], ['catering', 'caterers'],
  ['cafe', 'cafes'], ['coffee shop', 'cafes'], ['coffee', 'cafes'], ['tea house', 'cafes'], ['chai', 'cafes'], ['tea stall', 'cafes'],
  ['fast food', 'fast_food'], ['burger', 'fast_food'], ['pizza', 'fast_food'], ['vada pav', 'fast_food'], ['momos', 'fast_food'],
  ['rolls', 'fast_food'], ['street food', 'fast_food'], ['snacks', 'fast_food'],
  ['bakery', 'bakeries'], ['cakes', 'bakeries'], ['cake', 'bakeries'], ['bread', 'bakeries'], ['pastry', 'bakeries'],
  ['sweets', 'bakeries'], ['mithai', 'bakeries'], ['confectionery', 'bakeries'],
  ['grocery', 'grocery_stores'], ['groceries', 'grocery_stores'], ['kirana', 'grocery_stores'], ['general store', 'grocery_stores'],
  ['provision store', 'grocery_stores'], ['ration', 'grocery_stores'],
  ['supermarket', 'supermarkets'], ['hypermarket', 'supermarkets'], ['departmental store', 'supermarkets'],
  ['vegetables', 'fruit_and_vegetable_markets'], ['fruits', 'fruit_and_vegetable_markets'], ['sabzi', 'fruit_and_vegetable_markets'],
  ['fruit', 'fruit_and_vegetable_markets'], ['vegetable', 'fruit_and_vegetable_markets'],
  ['butcher', 'butcher_shops'], ['meat', 'butcher_shops'], ['chicken shop', 'butcher_shops'], ['mutton', 'butcher_shops'],
  ['fish', 'fish_markets'], ['seafood', 'fish_markets'],
  ['convenience store', 'convenience_stores'],
  ['water delivery', 'water_delivery'], ['water cans', 'water_delivery'], ['mineral water', 'water_delivery'],
  // Personal Care
  ['salon', 'beauty_salons'], ['parlour', 'beauty_salons'], ['parlor', 'beauty_salons'], ['beauty', 'beauty_salons'],
  ['makeup', 'beauty_salons'], ['bridal makeup', 'beauty_salons'], ['facial', 'beauty_salons'], ['waxing', 'beauty_salons'],
  ['hair salon', 'hair_salons'], ['hairdresser', 'hair_salons'], ['hair stylist', 'hair_salons'], ['haircut', 'hair_salons'],
  ['hair colour', 'hair_salons'], ['hair color', 'hair_salons'],
  ['barber', 'barbers'], ['barbershop', 'barbers'], ['mens salon', 'barbers'], ['gents salon', 'barbers'], ['shave', 'barbers'],
  ['nail', 'nail_salons'], ['nails', 'nail_salons'], ['manicure', 'nail_salons'], ['pedicure', 'nail_salons'],
  ['spa', 'spas'], ['massage', 'massage_therapy'], ['tattoo', 'tattoo_studios'], ['piercing', 'tattoo_studios'],
  ['skin clinic', 'skin_clinics'], ['dermatologist', 'skin_clinics'], ['skin doctor', 'skin_clinics'], ['dermatology', 'skin_clinics'],
  // Healthcare
  ['hospital', 'hospitals'], ['nursing home', 'hospitals'],
  ['clinic', 'clinics'], ['polyclinic', 'clinics'],
  ['doctor', 'general_physicians'], ['physician', 'general_physicians'], ['gp', 'general_physicians'], ['mbbs', 'general_physicians'],
  ['general practitioner', 'general_physicians'], ['family doctor', 'general_physicians'],
  ['specialist', 'specialists'], ['orthopaedic', 'specialists'], ['orthopedic', 'specialists'], ['cardiologist', 'specialists'],
  ['paediatrician', 'specialists'], ['pediatrician', 'specialists'], ['gynaecologist', 'specialists'], ['gynecologist', 'specialists'],
  ['neurologist', 'specialists'], ['ent', 'specialists'], ['surgeon', 'specialists'], ['urologist', 'specialists'],
  ['oncologist', 'specialists'], ['diabetologist', 'specialists'], ['endocrinologist', 'specialists'], ['homeopath', 'specialists'],
  ['homeopathy', 'specialists'], ['ayurvedic', 'specialists'], ['ayurveda', 'specialists'], ['physio', 'physiotherapy_centers'],
  ['dentist', 'dentists'], ['dental', 'dentists'], ['orthodontist', 'dentists'], ['teeth', 'dentists'],
  ['eye', 'eye_hospitals_and_optometrists'], ['optician', 'eye_hospitals_and_optometrists'], ['optometrist', 'eye_hospitals_and_optometrists'],
  ['ophthalmologist', 'eye_hospitals_and_optometrists'], ['spectacles', 'eye_hospitals_and_optometrists'], ['eyewear', 'eye_hospitals_and_optometrists'],
  ['physiotherapy', 'physiotherapy_centers'], ['physiotherapist', 'physiotherapy_centers'],
  ['counsellor', 'mental_health_counselors'], ['counselor', 'mental_health_counselors'], ['therapist', 'mental_health_counselors'],
  ['psychologist', 'mental_health_counselors'], ['counselling', 'mental_health_counselors'],
  ['psychiatrist', 'psychiatrists'],
  ['lab', 'diagnostic_labs'], ['pathology', 'diagnostic_labs'], ['diagnostic', 'diagnostic_labs'], ['blood test', 'diagnostic_labs'],
  ['x ray', 'diagnostic_labs'], ['xray', 'diagnostic_labs'], ['scan', 'diagnostic_labs'], ['mri', 'diagnostic_labs'],
  ['blood bank', 'blood_banks'],
  ['pharmacy', 'pharmacies'], ['chemist', 'pharmacies'], ['medical store', 'pharmacies'], ['medicines', 'pharmacies'], ['medical shop', 'pharmacies'],
  ['ambulance', 'ambulance_services'],
  ['vet', 'veterinary_clinics'], ['veterinary', 'veterinary_clinics'], ['veterinarian', 'veterinary_clinics'], ['animal doctor', 'veterinary_clinics'],
  // Home Services
  ['electrician', 'electricians'], ['wiring', 'electricians'], ['electrical', 'electricians'],
  ['plumber', 'plumbers'], ['plumbing', 'plumbers'], ['pipes', 'plumbers'], ['leak', 'plumbers'], ['geyser', 'plumbers'],
  ['carpenter', 'carpenters'], ['carpentry', 'carpenters'], ['woodwork', 'carpenters'], ['furniture repair', 'carpenters'],
  ['painter', 'painters'], ['painting', 'painters'], ['house painting', 'painters'],
  ['pest control', 'pest_control'], ['termite', 'pest_control'], ['cockroach', 'pest_control'], ['fumigation', 'pest_control'],
  ['appliance repair', 'appliance_repair'], ['washing machine', 'appliance_repair'], ['fridge repair', 'appliance_repair'],
  ['refrigerator', 'appliance_repair'], ['microwave', 'appliance_repair'], ['appliance', 'appliance_repair'],
  ['ac repair', 'ac_repair'], ['ac service', 'ac_repair'], ['air conditioner', 'ac_repair'], ['air conditioning', 'ac_repair'], ['ac', 'ac_repair'],
  ['cleaning', 'cleaning_services'], ['deep cleaning', 'cleaning_services'], ['housekeeping', 'cleaning_services'], ['maid', 'cleaning_services'],
  ['sofa cleaning', 'cleaning_services'], ['cook', 'cleaning_services'],
  ['movers', 'movers_and_packers'], ['packers', 'movers_and_packers'], ['packers and movers', 'movers_and_packers'],
  ['movers and packers', 'movers_and_packers'], ['relocation', 'movers_and_packers'], ['shifting', 'movers_and_packers'],
  ['interior', 'interior_designers'], ['interior designer', 'interior_designers'], ['interiors', 'interior_designers'],
  ['architect', 'architects'], ['architecture', 'architects'],
  ['locksmith', 'locksmiths'], ['keys', 'locksmiths'], ['locks', 'locksmiths'],
  // Automotive
  ['petrol pump', 'fuel_stations'], ['fuel station', 'fuel_stations'], ['petrol', 'fuel_stations'], ['cng', 'fuel_stations'],
  ['ev charging', 'ev_charging_stations'], ['charging station', 'ev_charging_stations'],
  ['car wash', 'car_wash'], ['car cleaning', 'car_wash'],
  ['mechanic', 'mechanics'], ['garage', 'mechanics'], ['repair cars', 'mechanics'], ['car repair', 'mechanics'], ['car service', 'mechanics'],
  ['car servicing', 'mechanics'], ['workshop', 'mechanics'], ['auto repair', 'mechanics'], ['cars', 'mechanics'], ['car', 'mechanics'],
  ['tyre', 'tire_shops'], ['tyres', 'tire_shops'], ['tire', 'tire_shops'], ['tires', 'tire_shops'], ['wheel alignment', 'tire_shops'],
  ['detailing', 'car_detailing'], ['car detailing', 'car_detailing'], ['ceramic coating', 'car_detailing'], ['ppf', 'car_detailing'],
  ['driving school', 'driving_schools'], ['driving lessons', 'driving_schools'], ['driving', 'driving_schools'],
  ['towing', 'towing_services'], ['tow', 'towing_services'], ['breakdown', 'towing_services'],
  ['bike repair', 'bike_repair'], ['bike', 'bike_repair'], ['scooter', 'bike_repair'], ['two wheeler', 'bike_repair'], ['motorcycle', 'bike_repair'],
  ['bicycle', 'bike_repair'], ['cycle repair', 'bike_repair'],
  // Fitness & Sports
  ['gym', 'gyms'], ['fitness centre', 'gyms'], ['fitness center', 'gyms'], ['crossfit', 'gyms'], ['weights', 'gyms'],
  ['yoga', 'yoga_studios'], ['pilates', 'yoga_studios'], ['meditation', 'yoga_studios'],
  ['swimming', 'swimming_pools'], ['pool', 'swimming_pools'],
  ['sports complex', 'sports_complexes'], ['turf', 'sports_complexes'], ['badminton', 'sports_complexes'], ['football', 'sports_complexes'],
  ['cricket', 'cricket_grounds'], ['tennis', 'tennis_courts'],
  ['personal trainer', 'personal_trainers'], ['trainer', 'personal_trainers'], ['fitness coach', 'personal_trainers'], ['fitness trainer', 'personal_trainers'],
  // Shopping
  ['clothes', 'clothing_stores'], ['clothing', 'clothing_stores'], ['boutique', 'clothing_stores'], ['garments', 'clothing_stores'],
  ['fashion', 'clothing_stores'], ['sarees', 'clothing_stores'], ['saree', 'clothing_stores'], ['apparel', 'clothing_stores'],
  ['kurtis', 'clothing_stores'], ['shoes', 'clothing_stores'], ['footwear', 'clothing_stores'],
  ['furniture', 'furniture_stores'], ['sofa', 'furniture_stores'], ['mattress', 'furniture_stores'],
  ['jewellery', 'jewelry_stores'], ['jewelry', 'jewelry_stores'], ['jeweller', 'jewelry_stores'], ['gold', 'jewelry_stores'],
  ['earrings', 'jewelry_stores'], ['ornaments', 'jewelry_stores'], ['diamonds', 'jewelry_stores'],
  ['books', 'bookstores'], ['bookstore', 'bookstores'], ['book shop', 'bookstores'], ['stationery', 'bookstores'],
  ['gifts', 'gift_shops'], ['gift shop', 'gift_shops'], ['gift', 'gift_shops'], ['handicrafts', 'gift_shops'], ['toys', 'gift_shops'],
  ['pet store', 'pet_stores'], ['pet shop', 'pet_stores'],
  // Electronics
  ['electronics', 'electronics_stores'], ['electronic', 'electronics_stores'], ['appliances', 'electronics_stores'], ['tv', 'electronics_stores'],
  ['laptops', 'electronics_stores'], ['laptop', 'electronics_stores'], ['computers', 'electronics_stores'], ['gadgets', 'electronics_stores'],
  ['mobile shop', 'mobile_shops'], ['mobiles', 'mobile_shops'], ['mobile phones', 'mobile_shops'], ['phones', 'mobile_shops'],
  ['smartphones', 'mobile_shops'], ['mobile store', 'mobile_shops'], ['phone shop', 'mobile_shops'],
  // Professional Services
  ['lawyer', 'lawyers'], ['advocate', 'lawyers'], ['legal', 'lawyers'], ['law firm', 'lawyers'], ['attorney', 'lawyers'],
  ['notary', 'notaries'],
  ['consultant', 'consultants'], ['consulting', 'consultants'], ['chartered accountant', 'consultants'], ['accountant', 'consultants'],
  ['ca', 'consultants'], ['tax', 'consultants'], ['gst filing', 'consultants'], ['financial advisor', 'consultants'],
  ['recruitment', 'recruitment_agencies'], ['staffing', 'recruitment_agencies'], ['placement', 'recruitment_agencies'],
  ['coworking', 'coworking_spaces'], ['co working', 'coworking_spaces'], ['office space', 'coworking_spaces'],
  ['printing', 'printing_services'], ['printer', 'printing_services'], ['flex printing', 'printing_services'], ['visiting cards', 'printing_services'],
  ['courier', 'courier_services'], ['parcel', 'courier_services'], ['delivery service', 'courier_services'],
  // Child & Senior Care
  ['daycare', 'daycare_centers'], ['day care', 'daycare_centers'], ['creche', 'daycare_centers'],
  ['preschool', 'preschools'], ['playschool', 'preschools'], ['play school', 'preschools'], ['nursery school', 'preschools'], ['kindergarten', 'preschools'],
  ['old age home', 'elder_care_homes'], ['elder care', 'elder_care_homes'], ['senior care', 'elder_care_homes'],
  ['nurse', 'nursing_services'], ['nursing', 'nursing_services'], ['home nursing', 'nursing_services'],
  ['home healthcare', 'home_healthcare'], ['home care', 'home_healthcare'], ['caregiver', 'home_healthcare'], ['attendant', 'home_healthcare'],
  ['babysitter', 'babysitting_services'], ['babysitting', 'babysitting_services'], ['nanny', 'babysitting_services'],
  // Digital & Technology
  ['mobile repair', 'mobile_repair'], ['phone repair', 'mobile_repair'], ['screen replacement', 'mobile_repair'],
  ['computer repair', 'computer_repair'], ['laptop repair', 'computer_repair'], ['it support', 'computer_repair'],
  ['internet', 'internet_providers'], ['broadband', 'internet_providers'], ['wifi', 'internet_providers'], ['isp', 'internet_providers'],
  ['cyber cafe', 'cyber_cafes'],
  ['photocopy', 'photocopy_and_printing_shops'], ['xerox', 'photocopy_and_printing_shops'], ['lamination', 'photocopy_and_printing_shops'],
  // Pet Services
  ['pet grooming', 'pet_grooming'], ['dog grooming', 'pet_grooming'], ['groomer', 'pet_grooming'], ['grooming', 'pet_grooming'],
  ['pet boarding', 'pet_boarding'], ['dog boarding', 'pet_boarding'], ['kennel', 'pet_boarding'], ['pet hostel', 'pet_boarding'],
  ['dog walker', 'pet_boarding'], ['dog walking', 'pet_boarding'], ['pet sitter', 'pet_boarding'],
  ['pet training', 'pet_training'], ['dog training', 'pet_training'], ['dog trainer', 'pet_training'],
  ['pet supplies', 'pet_supplies'], ['pet food', 'pet_supplies'], ['dog food', 'pet_supplies'],
  ['pet', 'pet_grooming'], ['pets', 'pet_grooming'], ['dogs', 'pet_grooming'], ['dog', 'pet_grooming'],
  // Real Estate
  ['property', 'property_agents'], ['real estate', 'property_agents'], ['broker', 'property_agents'], ['estate agent', 'property_agents'],
  ['flats', 'property_agents'], ['builder', 'builders'], ['construction', 'builders'], ['developer', 'builders'],
  ['rentals', 'rental_agencies'], ['rental', 'rental_agencies'], ['rent', 'rental_agencies'], ['paying guest', 'rental_agencies'], ['pg', 'rental_agencies'],
  ['property management', 'property_management'], ['society management', 'property_management'],
  // Event Services
  ['photographer', 'photographers'], ['photography', 'photographers'], ['photo studio', 'photographers'], ['photos', 'photographers'],
  ['videographer', 'videographers'], ['videography', 'videographers'], ['filmmaker', 'videographers'], ['video', 'videographers'],
  ['wedding planner', 'wedding_planners'], ['event planner', 'wedding_planners'], ['events', 'wedding_planners'], ['weddings', 'wedding_planners'],
  ['caterer', 'caterers'], ['caterers', 'caterers'],
  ['decorator', 'decorators'], ['decoration', 'decorators'], ['decor', 'decorators'], ['florist', 'decorators'], ['flowers', 'decorators'],
  ['dj', 'djs'], ['music for events', 'djs'], ['sound system', 'djs'],
  ['banquet', 'banquet_halls'], ['hall', 'banquet_halls'], ['party hall', 'banquet_halls'], ['venue', 'banquet_halls'],
  // Laundry & Textile
  ['laundry', 'laundry'], ['ironing', 'laundry'], ['dhobi', 'laundry'], ['wash and fold', 'laundry'],
  ['dry cleaning', 'dry_cleaning'], ['dry cleaner', 'dry_cleaning'], ['dry clean', 'dry_cleaning'],
  ['tailor', 'tailors'], ['tailoring', 'tailors'], ['stitching', 'tailors'], ['darzi', 'tailors'], ['blouse', 'tailors'],
  ['alteration', 'alteration_services'], ['alterations', 'alteration_services'],
  // Learning
  ['online course', 'online_courses'], ['online classes', 'online_courses'], ['e learning', 'online_courses'],
  ['workshop', 'live_workshops'], ['workshops', 'live_workshops'],
  ['certification', 'certifications'], ['certificate course', 'certifications'],
  ['skill', 'skill_sharing'], ['mentor', 'skill_sharing'], ['mentoring', 'skill_sharing'],
  ['language', 'language_exchange'], ['spoken english', 'language_exchange'], ['french classes', 'language_exchange'], ['german classes', 'language_exchange'],
  ['coding', 'coding_bootcamps'], ['programming', 'coding_bootcamps'], ['bootcamp', 'coding_bootcamps'], ['data science', 'coding_bootcamps'],
  ['music', 'music_lessons'], ['guitar', 'music_lessons'], ['piano', 'music_lessons'], ['singing', 'music_lessons'], ['tabla', 'music_lessons'],
  ['vocal', 'music_lessons'], ['keyboard', 'music_lessons'], ['violin', 'music_lessons'],
  ['dance', 'dance_lessons'], ['bharatanatyam', 'dance_lessons'], ['kathak', 'dance_lessons'], ['zumba', 'dance_lessons'], ['choreography', 'dance_lessons'],
  ['cooking class', 'cooking_classes'], ['cooking classes', 'cooking_classes'], ['baking class', 'cooking_classes'],
  ['hobby', 'hobby_clubs'], ['club', 'hobby_clubs'],
  ['tuition', 'skill_sharing'], ['tutor', 'skill_sharing'], ['coaching', 'skill_sharing'],
  ['maths', 'skill_sharing'], ['science', 'skill_sharing'],
  ['exam', 'skill_sharing'], ['jee', 'skill_sharing'], ['neet', 'skill_sharing'], ['cbse', 'skill_sharing'],
];

/**
 * Words that say WHAT KIND of thing the sentence is about when no trade word
 * lands: "I sell …" is a shop; "I repair …" is a trade; "I teach …" teaches.
 * They break a tie and stand in for a missing noun; a real trade word always
 * outweighs them.
 */
/**
 * Words that name a trade only loosely — "doctor" is every doctor, "store"
 * is every shop. They read as a HINT (below the line a reading is sure at),
 * so a sentence carrying only one of them is confirmed by the model or the
 * owner rather than filed on a word that could mean six things.
 */
const GENERIC = new Set(['doctor', 'clinic', 'shop', 'store', 'pet', 'pets', 'dog', 'dogs', 'car', 'cars', 'hall', 'club', 'skill',
  'coaching', 'tuition', 'tutor', 'exam', 'music', 'dance', 'video', 'photos', 'events',
  'weddings', 'gold', 'snacks', 'kitchen', 'mess', 'cook', 'scan', 'lab', 'eye', 'ac', 'ca', 'gp', 'pg', 'ent', 'keys',
  'locks', 'rent', 'flats', 'fruit', 'fish', 'meat', 'beauty', 'nail', 'nails', 'interior', 'legal', 'tax', 'internet',
  'language', 'science', 'maths', 'coffee', 'chai', 'bread', 'cake', 'cakes', 'sweets', 'printer', 'printing', 'workshop',
  'workshops', 'hobby', 'mentor', 'nurse', 'nursing', 'attendant', 'driving', 'pool', 'weights', 'bike']);
/* The names a specialist says for themselves outweigh the word "doctor"
   beside them: "orthopaedic doctor" is a specialist, not a GP with an
   adjective. */
const SPECIALIST_WEIGHT = 2;
const SPECIALIST_KEYS = new Set(['specialists', 'dentists', 'skin_clinics', 'psychiatrists', 'mental_health_counselors',
  'physiotherapy_centers', 'eye_hospitals_and_optometrists', 'veterinary_clinics']);
const weightOf = (entry: readonly [string, string] | readonly [string, string, number]): number => {
  if (entry.length === 3) return entry[2];
  const [phrase, key] = entry;
  const words = phrase.split(' ').length;
  // A two-word phrase is a whole trade said out loud; a one-word one is a
  // hint. Squared so "medical store" (4) stands over "medical" + "store"
  // read separately.
  if (words > 1) return words * words;
  if (GENERIC.has(phrase)) return 0.6;
  if (SPECIALIST_KEYS.has(key)) return SPECIALIST_WEIGHT;
  return 1;
};

const VERBS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:i|we) (?:sell|stock|retail)\b/, 'gift_shops'],
  [/\b(?:i|we) (?:repair|fix|service)\b/, 'appliance_repair'],
  [/\b(?:i|we) (?:teach|coach|tutor|train)\b/, 'skill_sharing'],
  [/\b(?:i|we) (?:clean)\b/, 'cleaning_services'],
  [/\b(?:i|we) (?:cook|serve)\b/, 'restaurants'],
  [/\b(?:i|we) (?:deliver)\b/, 'courier_services'],
];

/** Lowercase, accents off, punctuation to spaces, one space between words. */
export function normalise(text: string): string {
  return ` ${text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

const has = (norm: string, phrase: string): boolean => norm.includes(` ${phrase} `);

export type Confidence = 'sure' | 'likely' | 'unsure';

export interface Reading {
  /** The trade, as categories.ts keys it. 'other' when nothing was read. */
  categoryKey: string;
  categoryLabel: string;
  group: string;
  /** The business type — the questions the owner will be asked. */
  typeKey: string;
  typeLabel: string;
  engine: Engine;
  /** "your café" — the word after "Let's create your …". */
  noun: string;
  confidence: Confidence;
  /** The next-best trades, for the one-press correction. */
  alternatives: Array<{ categoryKey: string; label: string; typeKey: string }>;
  /** Where they said they are, when the sentence named a place the tree knows. */
  city: string | null;
  area: string | null;
  /** A name the sentence gave — quoted, or after "called". Never guessed. */
  name: string | null;
}

/** The trade keys the rules can name, with a score each. */
export function scoreTrades(text: string): Map<string, number> {
  const norm = normalise(text);
  const score = new Map<string, number>();
  const bump = (key: string, by: number) => {
    if (!isCategory(key) || !OFFERED_CATEGORIES.some((c) => c.key === key)) return;
    score.set(key, (score.get(key) ?? 0) + by);
  };
  for (const entry of LEXICON) {
    if (has(norm, entry[0])) bump(entry[1], weightOf(entry));
  }
  // The taxonomy's own labels, word by word, at the lowest weight — this is
  // what lets a trade nobody wrote a lexicon line for still be found.
  for (const word of norm.trim().split(' ')) {
    if (word.length < 4) continue;
    for (const key of categoryKeysMatching(word)) bump(key, 0.5);
  }
  for (const [re, key] of VERBS) if (re.test(norm)) bump(key, 0.4);
  return score;
}

/** The place the sentence names, read off the tree. Longest name wins. */
export function readPlace(text: string): { city: string | null; area: string | null } {
  const norm = normalise(text);
  const hits: Array<{ city: string; area: string | null; len: number }> = [];
  const consider = (city: string, area: string | null, said: string) => {
    const p = normalise(said).trim();
    if (p.length >= 3 && has(norm, p)) hits.push({ city, area, len: p.length });
  };
  for (const country of PLACES) for (const st of country.states) for (const c of st.cities) {
    consider(c.name, null, c.name);
    for (const a of c.aliases ?? []) consider(c.name, null, a);
    for (const a of c.areas) {
      consider(c.name, a, a);
      // "in Bandra" is Bandra East or Bandra West and the sentence has not
      // said which: the stem still places them in Mumbai, and the locality
      // box takes the word they used. The full name, when said, is longer
      // and wins.
      const stem = a.replace(/\s+(?:East|West|North|South)$/i, '');
      if (stem !== a) consider(c.name, stem, stem);
    }
  }
  hits.sort((a, b) => b.len - a.len);
  return hits.length ? { city: hits[0].city, area: hits[0].area } : { city: null, area: null };
}

/** A name the owner GAVE — in quotes, or after "called" / "named". */
export function readName(text: string): string | null {
  const quoted = text.match(/["“]([^"”]{2,60})["”]/);
  if (quoted) return quoted[1].trim();
  const called = text.match(/\b(?:called|named|name is|known as)\s+([A-Z][^.,;!?\n]{1,58}?)(?=\s+(?:and|in|at|which|that|near|on|with)\b|[.,;!?\n]|$)/);
  return called ? called[1].trim() : null;
}

/** What a trade key becomes, whole: type, engine, noun, label. */
export function readingFor(categoryKey: string, confidence: Confidence, text: string, alternatives: string[] = []): Reading {
  const typeKey = typeForCategory(categoryKey);
  const type = businessType(typeKey) ?? (businessType('general') as NonNullable<ReturnType<typeof businessType>>);
  const place = readPlace(text);
  return {
    categoryKey,
    categoryLabel: categoryLabel(categoryKey),
    group: categoryGroup(categoryKey),
    typeKey: type.key,
    typeLabel: type.label,
    engine: engineForType(type.key),
    noun: nounFor(categoryKey, type.key),
    confidence,
    alternatives: alternatives.filter((k) => k !== categoryKey).slice(0, 3)
      .map((k) => ({ categoryKey: k, label: categoryLabel(k), typeKey: typeForCategory(k) })),
    city: place.city,
    area: place.area,
    name: readName(text),
  };
}

/**
 * THE RULES' READING. `null` when the sentence named no trade at all — the
 * caller decides whether to ask the model or to hand back "other" and let the
 * owner pick.
 */
export function understandByRules(text: string): Reading | null {
  const score = scoreTrades(text);
  if (score.size === 0) return null;
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [top, topScore] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  // Below one: only hints landed ("doctor", "I sell"), and a hint is a
  // question for the model or the owner, not a filing. At one or more with a
  // clear lead it is sure; a dead heat between two real trades is likely,
  // and the runner-up is the first alternative offered.
  const confidence: Confidence = topScore < 1 ? 'unsure' : topScore > second ? 'sure' : 'likely';
  return readingFor(top, confidence, text, ranked.map(([k]) => k));
}

/** The reading for a sentence nobody could read: 'other', so the owner picks. */
export const unreadable = (text: string): Reading => readingFor('other', 'unsure', text);

/** The one sentence a doctor must never hear, held as a fact the specs read. */
export const ordersFromEngine = (engineKey: string): boolean => engineKey === 'food' || engineKey === 'store';

/** Every type has an engine — a type with none would fall to 'page' silently. */
export const TYPES_WITHOUT_AN_ENGINE: string[] = BUSINESS_TYPES.map((t) => t.key).filter((k) => !ENGINE_OF_TYPE[k]);

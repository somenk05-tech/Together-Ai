/**
 * THE CATEGORY LIST IS THE PRODUCT'S VOCABULARY, AND IT LIVES HERE ONLY.
 *
 * A business does not type its own trade — it picks one from this list. That is
 * what makes browsing work: two plumbers who typed "plumber" and "Plumbing
 * Services" are two categories, and a directory with two hundred one-listing
 * categories is not a directory, it is a search box with extra steps.
 *
 * THIS IS THE OWNER'S OWN LIST, supplied 5 Aug 2026 — eighteen groups, and
 * every label is theirs verbatim. It replaced a starter set I had guessed at,
 * which is the right way round: a controlled vocabulary is a product decision,
 * and the person who knows the city makes it.
 *
 * `key` IS WHAT A LISTING STORES. Renaming a key that is already in use orphans
 * every listing filed under it, so keys are added and retired, never renamed —
 * a retired trade keeps its key and simply stops being offered in the picker.
 * The keys here are derived from the labels once and then frozen.
 *
 * `group` is what the picker is browsed by. A category with no group still
 * works; it lands under "Other".
 */
export interface ServiceCategory {
  key: string;
  label: string;
  group: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  // Healthcare
  { key: 'hospitals', label: 'Hospitals', group: 'Healthcare' },
  { key: 'clinics', label: 'Clinics', group: 'Healthcare' },
  { key: 'general_physicians', label: 'General physicians', group: 'Healthcare' },
  { key: 'specialists', label: 'Specialists', group: 'Healthcare' },
  { key: 'dentists', label: 'Dentists', group: 'Healthcare' },
  { key: 'eye_hospitals_and_optometrists', label: 'Eye hospitals & optometrists', group: 'Healthcare' },
  { key: 'physiotherapy_centers', label: 'Physiotherapy centers', group: 'Healthcare' },
  { key: 'mental_health_counselors', label: 'Mental health counselors', group: 'Healthcare' },
  { key: 'psychiatrists', label: 'Psychiatrists', group: 'Healthcare' },
  { key: 'diagnostic_labs', label: 'Diagnostic labs', group: 'Healthcare' },
  { key: 'blood_banks', label: 'Blood banks', group: 'Healthcare' },
  { key: 'pharmacies', label: 'Pharmacies', group: 'Healthcare' },
  { key: 'ambulance_services', label: 'Ambulance services', group: 'Healthcare' },
  { key: 'veterinary_clinics', label: 'Veterinary clinics', group: 'Healthcare' },

  // Food & Daily Needs
  { key: 'restaurants', label: 'Restaurants', group: 'Food & Daily Needs' },
  { key: 'cafes', label: 'Cafés', group: 'Food & Daily Needs' },
  { key: 'fast_food', label: 'Fast food', group: 'Food & Daily Needs' },
  { key: 'bakeries', label: 'Bakeries', group: 'Food & Daily Needs' },
  { key: 'grocery_stores', label: 'Grocery stores', group: 'Food & Daily Needs' },
  { key: 'supermarkets', label: 'Supermarkets', group: 'Food & Daily Needs' },
  { key: 'fruit_and_vegetable_markets', label: 'Fruit & vegetable markets', group: 'Food & Daily Needs' },
  { key: 'butcher_shops', label: 'Butcher shops', group: 'Food & Daily Needs' },
  { key: 'fish_markets', label: 'Fish markets', group: 'Food & Daily Needs' },
  { key: 'convenience_stores', label: 'Convenience stores', group: 'Food & Daily Needs' },
  { key: 'water_delivery', label: 'Water delivery', group: 'Food & Daily Needs' },

  // Personal Care
  { key: 'hair_salons', label: 'Hair salons', group: 'Personal Care' },
  { key: 'barbers', label: 'Barbers', group: 'Personal Care' },
  { key: 'beauty_salons', label: 'Beauty salons', group: 'Personal Care' },
  { key: 'nail_salons', label: 'Nail salons', group: 'Personal Care' },
  { key: 'spas', label: 'Spas', group: 'Personal Care' },
  { key: 'massage_therapy', label: 'Massage therapy', group: 'Personal Care' },
  { key: 'tattoo_studios', label: 'Tattoo studios', group: 'Personal Care' },
  { key: 'skin_clinics', label: 'Skin clinics', group: 'Personal Care' },

  // Home Services
  { key: 'electricians', label: 'Electricians', group: 'Home Services' },
  { key: 'plumbers', label: 'Plumbers', group: 'Home Services' },
  { key: 'carpenters', label: 'Carpenters', group: 'Home Services' },
  { key: 'painters', label: 'Painters', group: 'Home Services' },
  { key: 'pest_control', label: 'Pest control', group: 'Home Services' },
  { key: 'appliance_repair', label: 'Appliance repair', group: 'Home Services' },
  { key: 'ac_repair', label: 'AC repair', group: 'Home Services' },
  { key: 'cleaning_services', label: 'Cleaning services', group: 'Home Services' },
  { key: 'movers_and_packers', label: 'Movers & packers', group: 'Home Services' },
  { key: 'interior_designers', label: 'Interior designers', group: 'Home Services' },
  { key: 'architects', label: 'Architects', group: 'Home Services' },
  { key: 'locksmiths', label: 'Locksmiths', group: 'Home Services' },

  // Automotive
  { key: 'fuel_stations', label: 'Fuel stations', group: 'Automotive' },
  { key: 'ev_charging_stations', label: 'EV charging stations', group: 'Automotive' },
  { key: 'car_wash', label: 'Car wash', group: 'Automotive' },
  { key: 'mechanics', label: 'Mechanics', group: 'Automotive' },
  { key: 'tire_shops', label: 'Tire shops', group: 'Automotive' },
  { key: 'car_detailing', label: 'Car detailing', group: 'Automotive' },
  { key: 'driving_schools', label: 'Driving schools', group: 'Automotive' },
  { key: 'towing_services', label: 'Towing services', group: 'Automotive' },
  { key: 'bike_repair', label: 'Bike repair', group: 'Automotive' },

  // Fitness & Sports
  { key: 'gyms', label: 'Gyms', group: 'Fitness & Sports' },
  { key: 'yoga_studios', label: 'Yoga studios', group: 'Fitness & Sports' },
  { key: 'swimming_pools', label: 'Swimming pools', group: 'Fitness & Sports' },
  { key: 'sports_complexes', label: 'Sports complexes', group: 'Fitness & Sports' },
  { key: 'cricket_grounds', label: 'Cricket grounds', group: 'Fitness & Sports' },
  { key: 'tennis_courts', label: 'Tennis courts', group: 'Fitness & Sports' },
  { key: 'personal_trainers', label: 'Personal trainers', group: 'Fitness & Sports' },

  // Travel & Hospitality
  { key: 'hotels', label: 'Hotels', group: 'Travel & Hospitality' },
  { key: 'hostels', label: 'Hostels', group: 'Travel & Hospitality' },
  { key: 'resorts', label: 'Resorts', group: 'Travel & Hospitality' },
  { key: 'travel_agencies', label: 'Travel agencies', group: 'Travel & Hospitality' },
  { key: 'bus_stations', label: 'Bus stations', group: 'Travel & Hospitality' },
  { key: 'railway_stations', label: 'Railway stations', group: 'Travel & Hospitality' },
  { key: 'airports', label: 'Airports', group: 'Travel & Hospitality' },
  { key: 'taxi_stands', label: 'Taxi stands', group: 'Travel & Hospitality' },
  { key: 'car_rentals', label: 'Car rentals', group: 'Travel & Hospitality' },

  // Shopping
  { key: 'clothing_stores', label: 'Clothing stores', group: 'Shopping' },
  { key: 'electronics_stores', label: 'Electronics stores', group: 'Shopping' },
  { key: 'furniture_stores', label: 'Furniture stores', group: 'Shopping' },
  { key: 'jewelry_stores', label: 'Jewelry stores', group: 'Shopping' },
  { key: 'mobile_shops', label: 'Mobile shops', group: 'Shopping' },
  { key: 'bookstores', label: 'Bookstores', group: 'Shopping' },
  { key: 'gift_shops', label: 'Gift shops', group: 'Shopping' },
  { key: 'pet_stores', label: 'Pet stores', group: 'Shopping' },

  // Professional Services
  { key: 'lawyers', label: 'Lawyers', group: 'Professional Services' },
  { key: 'notaries', label: 'Notaries', group: 'Professional Services' },
  { key: 'consultants', label: 'Consultants', group: 'Professional Services' },
  { key: 'recruitment_agencies', label: 'Recruitment agencies', group: 'Professional Services' },
  { key: 'coworking_spaces', label: 'Coworking spaces', group: 'Professional Services' },
  { key: 'printing_services', label: 'Printing services', group: 'Professional Services' },
  { key: 'courier_services', label: 'Courier services', group: 'Professional Services' },

  // Child & Senior Care
  { key: 'daycare_centers', label: 'Daycare centers', group: 'Child & Senior Care' },
  { key: 'preschools', label: 'Preschools', group: 'Child & Senior Care' },
  { key: 'elder_care_homes', label: 'Elder care homes', group: 'Child & Senior Care' },
  { key: 'nursing_services', label: 'Nursing services', group: 'Child & Senior Care' },
  { key: 'home_healthcare', label: 'Home healthcare', group: 'Child & Senior Care' },
  { key: 'babysitting_services', label: 'Babysitting services', group: 'Child & Senior Care' },

  // Digital & Technology
  { key: 'mobile_repair', label: 'Mobile repair', group: 'Digital & Technology' },
  { key: 'computer_repair', label: 'Computer repair', group: 'Digital & Technology' },
  { key: 'internet_providers', label: 'Internet providers', group: 'Digital & Technology' },
  { key: 'cyber_cafes', label: 'Cyber cafés', group: 'Digital & Technology' },
  { key: 'photocopy_and_printing_shops', label: 'Photocopy & printing shops', group: 'Digital & Technology' },

  // Pet Services
  { key: 'pet_grooming', label: 'Pet grooming', group: 'Pet Services' },
  { key: 'pet_boarding', label: 'Pet boarding', group: 'Pet Services' },
  { key: 'pet_training', label: 'Pet training', group: 'Pet Services' },
  { key: 'pet_supplies', label: 'Pet supplies', group: 'Pet Services' },

  // Real Estate
  { key: 'property_agents', label: 'Property agents', group: 'Real Estate' },
  { key: 'builders', label: 'Builders', group: 'Real Estate' },
  { key: 'rental_agencies', label: 'Rental agencies', group: 'Real Estate' },
  { key: 'property_management', label: 'Property management', group: 'Real Estate' },

  // Event Services
  { key: 'photographers', label: 'Photographers', group: 'Event Services' },
  { key: 'videographers', label: 'Videographers', group: 'Event Services' },
  { key: 'wedding_planners', label: 'Wedding planners', group: 'Event Services' },
  { key: 'caterers', label: 'Caterers', group: 'Event Services' },
  { key: 'decorators', label: 'Decorators', group: 'Event Services' },
  { key: 'djs', label: 'DJs', group: 'Event Services' },
  { key: 'banquet_halls', label: 'Banquet halls', group: 'Event Services' },

  // Laundry & Textile
  { key: 'laundry', label: 'Laundry', group: 'Laundry & Textile' },
  { key: 'dry_cleaning', label: 'Dry cleaning', group: 'Laundry & Textile' },
  { key: 'tailors', label: 'Tailors', group: 'Laundry & Textile' },
  { key: 'alteration_services', label: 'Alteration services', group: 'Laundry & Textile' },

  // Learning
  { key: 'online_courses', label: 'Online courses', group: 'Learning' },
  { key: 'live_workshops', label: 'Live workshops', group: 'Learning' },
  { key: 'certifications', label: 'Certifications', group: 'Learning' },
  { key: 'skill_sharing', label: 'Skill sharing', group: 'Learning' },
  { key: 'language_exchange', label: 'Language exchange', group: 'Learning' },
  { key: 'coding_bootcamps', label: 'Coding bootcamps', group: 'Learning' },
  { key: 'music_lessons', label: 'Music lessons', group: 'Learning' },
  { key: 'dance_lessons', label: 'Dance lessons', group: 'Learning' },
  { key: 'cooking_classes', label: 'Cooking classes', group: 'Learning' },
  { key: 'hobby_clubs', label: 'Hobby clubs', group: 'Learning' },

  // Experiences
  { key: 'adventure_sports', label: 'Adventure sports', group: 'Experiences' },
  { key: 'trekking', label: 'Trekking', group: 'Experiences' },
  { key: 'camping', label: 'Camping', group: 'Experiences' },
  { key: 'yacht_rentals', label: 'Yacht rentals', group: 'Experiences' },
  { key: 'hot_air_balloons', label: 'Hot air balloons', group: 'Experiences' },
  { key: 'helicopter_rides', label: 'Helicopter rides', group: 'Experiences' },
  { key: 'theme_parks', label: 'Theme parks', group: 'Experiences' },
  { key: 'escape_rooms', label: 'Escape rooms', group: 'Experiences' },
  { key: 'city_tours', label: 'City tours', group: 'Experiences' },

  // Emergency
  { key: 'sos', label: 'SOS', group: 'Emergency' },
  { key: 'roadside_assistance', label: 'Roadside assistance', group: 'Emergency' },
  { key: 'emergency_contacts', label: 'Emergency contacts', group: 'Emergency' },
  { key: 'nearby_hospitals', label: 'Nearby hospitals', group: 'Emergency' },
  { key: 'blood_donors', label: 'Blood donors', group: 'Emergency' },
  { key: 'disaster_alerts', label: 'Disaster alerts', group: 'Emergency' },
];

const BY_KEY = new Map(SERVICE_CATEGORIES.map((c) => [c.key, c]));

export const isCategory = (key: string): boolean => BY_KEY.has(key);
export const categoryLabel = (key: string): string => BY_KEY.get(key)?.label ?? key;
export const CATEGORY_KEYS: string[] = SERVICE_CATEGORIES.map((c) => c.key);

/** Grouped for the picker, in the order the groups first appear above. */
export function categoriesByGroup(): Array<{ group: string; items: ServiceCategory[] }> {
  const out: Array<{ group: string; items: ServiceCategory[] }> = [];
  for (const c of SERVICE_CATEGORIES) {
    const g = c.group || 'Other';
    let bucket = out.find((b) => b.group === g);
    if (!bucket) { bucket = { group: g, items: [] }; out.push(bucket); }
    bucket.items.push(c);
  }
  return out;
}

/** The group names, in order — the browse screen leads with these rather than
 *  with a hundred and forty chips nobody can scan. */
export const CATEGORY_GROUPS: string[] = [...new Set(SERVICE_CATEGORIES.map((c) => c.group))];

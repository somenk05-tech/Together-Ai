/**
 * Master data for every standardized dropdown across Together City. India-first,
 * but the country list is broad. Seeded idempotently on boot. Codes are stable;
 * labels are what the UI shows. New categories can be added here with no schema
 * change — the generic `Lookup` table + `/lookups/:category` endpoint serve them.
 */
export interface LookupSeed { category: string; code: string; label: string; parentCode?: string; sortOrder?: number }

const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40);

// ─── Countries (India first, then common countries A–Z) ───
const COUNTRIES: Array<[string, string]> = [
  ['IN', 'India'],
  ['AE', 'United Arab Emirates'], ['AU', 'Australia'], ['BD', 'Bangladesh'], ['BR', 'Brazil'],
  ['CA', 'Canada'], ['CH', 'Switzerland'], ['CN', 'China'], ['DE', 'Germany'], ['ES', 'Spain'],
  ['FR', 'France'], ['GB', 'United Kingdom'], ['ID', 'Indonesia'], ['IE', 'Ireland'], ['IT', 'Italy'],
  ['JP', 'Japan'], ['KE', 'Kenya'], ['LK', 'Sri Lanka'], ['MY', 'Malaysia'], ['NG', 'Nigeria'],
  ['NL', 'Netherlands'], ['NP', 'Nepal'], ['NZ', 'New Zealand'], ['PH', 'Philippines'], ['PK', 'Pakistan'],
  ['QA', 'Qatar'], ['SA', 'Saudi Arabia'], ['SG', 'Singapore'], ['TH', 'Thailand'], ['US', 'United States'],
  ['VN', 'Vietnam'], ['ZA', 'South Africa'],
];

// ─── Indian states & union territories (parent = IN) ───
const STATES_IN: Array<[string, string]> = [
  ['AP', 'Andhra Pradesh'], ['AR', 'Arunachal Pradesh'], ['AS', 'Assam'], ['BR', 'Bihar'],
  ['CG', 'Chhattisgarh'], ['GA', 'Goa'], ['GJ', 'Gujarat'], ['HR', 'Haryana'], ['HP', 'Himachal Pradesh'],
  ['JH', 'Jharkhand'], ['KA', 'Karnataka'], ['KL', 'Kerala'], ['MP', 'Madhya Pradesh'], ['MH', 'Maharashtra'],
  ['MN', 'Manipur'], ['ML', 'Meghalaya'], ['MZ', 'Mizoram'], ['NL', 'Nagaland'], ['OD', 'Odisha'],
  ['PB', 'Punjab'], ['RJ', 'Rajasthan'], ['SK', 'Sikkim'], ['TN', 'Tamil Nadu'], ['TG', 'Telangana'],
  ['TR', 'Tripura'], ['UP', 'Uttar Pradesh'], ['UK', 'Uttarakhand'], ['WB', 'West Bengal'],
  ['AN', 'Andaman & Nicobar Islands'], ['CH', 'Chandigarh'], ['DN', 'Dadra & Nagar Haveli and Daman & Diu'],
  ['DL', 'Delhi'], ['JK', 'Jammu & Kashmir'], ['LA', 'Ladakh'], ['LD', 'Lakshadweep'], ['PY', 'Puducherry'],
];

// ─── Major cities per Indian state (parent = state code) ───
const CITIES_IN: Record<string, string[]> = {
  MH: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad', 'Navi Mumbai', 'Solapur', 'Kolhapur', 'Amravati'],
  DL: ['New Delhi', 'Delhi'],
  KA: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi', 'Kalaburagi', 'Davanagere', 'Shivamogga'],
  TN: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore'],
  TG: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam'],
  WB: ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Darjeeling'],
  GJ: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Gandhinagar', 'Jamnagar'],
  RJ: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner'],
  UP: ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Noida', 'Prayagraj', 'Bareilly'],
  KL: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur'],
  PB: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali'],
  HR: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar'],
  MP: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain'],
  BR: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga'],
  AP: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati', 'Kakinada'],
  OD: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur'],
  AS: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat'],
  JH: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'],
  CG: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba'],
  UK: ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Nainital'],
  HP: ['Shimla', 'Manali', 'Dharamshala', 'Solan'],
  GA: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'],
  JK: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla'],
  CH: ['Chandigarh'],
  PY: ['Puducherry'],
};

// ─── Languages (Indian scheduled languages + major world languages) ───
const LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia',
  'Malayalam', 'Punjabi', 'Assamese', 'Maithili', 'Sanskrit', 'Kashmiri', 'Nepali', 'Konkani', 'Sindhi',
  'Dogri', 'Manipuri', 'Bodo', 'Santali', 'Tulu', 'Bhojpuri',
  'Arabic', 'Mandarin', 'Spanish', 'French', 'German', 'Portuguese', 'Russian', 'Japanese', 'Korean', 'Italian',
];

// ─── Flat enumerations (each becomes its own category) ───
const SIMPLE: Record<string, string[]> = {
  religion: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Jewish', 'Spiritual', 'Atheist', 'Agnostic', 'Other', 'Prefer not to say'],
  education: ['High school', 'Diploma', "Bachelor's", "Master's", 'PhD', 'Professional degree', 'Other'],
  occupation: [
    'Software / IT', 'Engineering', 'Doctor / Healthcare', 'Nurse', 'Teacher / Academic', 'Finance / Banking',
    'Chartered Accountant', 'Lawyer', 'Business / Entrepreneur', 'Marketing / Sales', 'Design / Creative',
    'Media / Journalism', 'Government / Public sector', 'Civil services', 'Armed forces', 'Architect',
    'Consultant', 'Scientist / Research', 'Pilot / Aviation', 'Hospitality', 'Retail', 'Artist / Musician',
    'Student', 'Homemaker', 'Self-employed', 'Not working', 'Other',
  ],
  relationshipGoal: ['Marriage', 'Long-term relationship', 'Serious dating', 'Casual dating', 'Friendship first', 'Still figuring it out'],
  bodyType: ['Slim', 'Athletic', 'Average', 'Curvy', 'Muscular', 'Plus-size', 'Prefer not to say'],
  diet: ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain', 'Pescatarian'],
  exercise: ['Sedentary', 'Lightly active', 'Active', 'Very active', 'Daily'],
  smoking: ['Never', 'Occasionally', 'Regularly', 'Trying to quit'],
  alcohol: ['Never', 'Socially', 'Regularly', 'Sober'],
  maritalStatus: ['Never married', 'Divorced', 'Widowed', 'Separated'],
  wantsChildren: ['Yes', 'No', 'Maybe', 'Prefer not to say'],
  zodiac: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'],
  pets: ['Dog', 'Cat', 'Both', 'Other pets', 'No pets', 'Want pets'],
  political: ['Apolitical', 'Moderate', 'Liberal', 'Conservative', 'Prefer not to say'],
  // CURRENCY-NEUTRAL (P3, 26 Aug). The ladder was rupee bands, which read as
  // noise everywhere the app is not India and as a salary interview where it
  // is. Self-description travels; profiles that stored the old rupee labels
  // keep them as text and still render.
  income: ['Studying / starting out', 'Getting established', 'Comfortable', 'Well established', 'Affluent', 'Prefer not to say'],
};

/** Build the full, flat seed list with generated codes + sort order. */
export function buildLookupSeed(): LookupSeed[] {
  const out: LookupSeed[] = [];
  COUNTRIES.forEach(([code, label], i) => out.push({ category: 'country', code, label, sortOrder: i }));
  STATES_IN.forEach(([code, label], i) => out.push({ category: 'state', code, label, parentCode: 'IN', sortOrder: i }));
  for (const [stateCode, cities] of Object.entries(CITIES_IN)) {
    cities.forEach((label, i) => out.push({ category: 'city', code: `${stateCode}-${slug(label)}`, label, parentCode: stateCode, sortOrder: i }));
  }
  LANGUAGES.forEach((label, i) => out.push({ category: 'language', code: slug(label), label, sortOrder: i }));
  for (const [category, labels] of Object.entries(SIMPLE)) {
    labels.forEach((label, i) => out.push({ category, code: slug(label), label, sortOrder: i }));
  }
  return out;
}

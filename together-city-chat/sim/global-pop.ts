/**
 * A 1,000,000-person GLOBAL population for the Together City dating engine.
 *
 * Everything the engine reads (city/state/country strings, goals, diet, chips)
 * is written in the SAME vocabulary the production form writes — i.e. the
 * `lookup.data.ts` labels served to `SearchSelect`, not the Title-Case strings
 * that only exist inside `matching.ts` and its own unit tests. That distinction
 * is deliberate and is itself one of the findings; `GOAL_VOCAB=engine` runs the
 * counterfactual where the two vocabularies agree.
 *
 * TRUE coordinates are carried on every person so the harness can compare the
 * distance that exists with the distance the engine can measure. The engine is
 * given only the strings a user would have typed.
 *
 * Every market parameter below is a MODELLING ASSUMPTION, not a measurement.
 * They are stated in one table so any of them can be argued with directly.
 */
import type { DXProfile } from '../src/dating/matching';

// ---------------------------------------------------------------- rng
export function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------- vocab
/** What the production dropdown actually serves (lookup.data.ts). */
export const GOALS_PROD = ['Marriage', 'Long-term relationship', 'Serious dating', 'Casual dating', 'Friendship first', 'Still figuring it out'];
/** What matching.ts's GOAL_ORDER expects. */
export const GOALS_ENGINE = ['Marriage', 'Long-term Relationship', 'Serious Dating', 'Casual Dating', 'Friendship First', 'Still figuring it out'];
export const GOAL_VOCAB = process.env.GOAL_VOCAB === 'engine' ? GOALS_ENGINE : GOALS_PROD;

export const DIETS = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain', 'Pescatarian'];
export const SMOKE = ['Never', 'Occasionally', 'Regularly', 'Trying to quit'];
export const DRINK = ['Never', 'Socially', 'Regularly', 'Sober'];
export const FIT = ['Sedentary', 'Lightly active', 'Active', 'Very active', 'Daily'];
export const CHILDREN = ['Yes', 'No', 'Maybe', 'Prefer not to say'];
export const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Jewish', 'Spiritual', 'Atheist', 'Agnostic', 'Other', 'Prefer not to say'];
export const TRAITS = ['Funny', 'Calm', 'Ambitious', 'Romantic', 'Adventurous', 'Introvert', 'Extrovert', 'Creative', 'Family-Oriented', 'Spiritual'];
export const VALUES = ['Family', 'Honesty', 'Loyalty', 'Kindness', 'Career', 'Adventure', 'Personal Growth', 'Financial Stability'];
export const INTERESTS = ['Travel', 'Movies', 'Music', 'Reading', 'Cooking', 'Fitness', 'Sports', 'Photography', 'Gaming', 'Art', 'Pets', 'Technology', 'Fashion', 'Nature'];
export const CHIPS = ['Smoking', 'Drinking', 'Marriage Intentions', 'Wants Children', 'Distance', 'Diet', 'Religion'];

// ---------------------------------------------------------------- markets
export interface Market {
  key: string;
  /** share of the 1M population */
  share: number;
  /** male:female ratio among users */
  mf: number;
  /** P(age bucket) over [18-21,22-25,26-30,31-35,36-40,41-50,50+] */
  age: number[];
  /** weights over GOAL_VOCAB */
  goal: number[];
  /** weights over CHILDREN */
  kids: number[];
  /** weights over RELIGIONS */
  rel: number[];
  /** weights over DIETS */
  diet: number[];
  smoke: number[]; drink: number[];
  langs: string[];
  /** P(speaks English well enough to date in it) */
  english: number;
  /** thin / partial / full */
  complete: number[];
  /** P(opens the deal-breaker chip section at all) */
  chipRate: number;
  /** P(discloses a non-heterosexual orientation on the profile) */
  lgbtDisclosure: number;
}

const R = RELIGIONS.length;
const rel = (m: Partial<Record<string, number>>): number[] => {
  const out = new Array(R).fill(0);
  RELIGIONS.forEach((r, i) => { out[i] = m[r] ?? 0; });
  const s = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((x) => x / s);
};

export const MARKETS: Record<string, Market> = {
  IN: { key: 'IN', share: 0.30, mf: 2.30, age: [.20, .32, .24, .12, .06, .04, .02],
    goal: [.30, .26, .20, .12, .06, .06], kids: [.42, .10, .30, .18],
    rel: rel({ Hindu: 72, Muslim: 12, Christian: 5, Sikh: 3, Jain: 2, Buddhist: 1, Parsi: .3, Spiritual: 2, Atheist: 1, Agnostic: 1, Other: .4, 'Prefer not to say': 2 }),
    diet: [.34, .48, .03, .09, .03, .03], smoke: [.62, .20, .11, .07], drink: [.42, .38, .12, .08],
    langs: ['Hindi', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Malayalam', 'Gujarati', 'Punjabi', 'Odia'], english: .78,
    complete: [.16, .27, .57], chipRate: .38, lgbtDisclosure: .30 },
  US: { key: 'US', share: 0.14, mf: 1.80, age: [.11, .24, .25, .16, .10, .10, .04],
    goal: [.09, .30, .27, .21, .06, .07], kids: [.30, .26, .30, .14],
    rel: rel({ Christian: 55, Jewish: 3, Muslim: 2, Hindu: 1.5, Buddhist: 2, Spiritual: 12, Atheist: 9, Agnostic: 10, Other: 2, 'Prefer not to say': 3.5 }),
    diet: [.08, .78, .05, .01, .002, .07], smoke: [.68, .18, .09, .05], drink: [.16, .58, .16, .10],
    langs: ['English', 'Spanish'], english: .97, complete: [.22, .30, .48], chipRate: .30, lgbtDisclosure: .85 },
  CA: { key: 'CA', share: 0.04, mf: 1.75, age: [.11, .24, .25, .17, .10, .09, .04],
    goal: [.09, .31, .27, .20, .06, .07], kids: [.31, .25, .30, .14],
    rel: rel({ Christian: 48, Sikh: 3, Muslim: 4, Hindu: 3, Buddhist: 2, Jewish: 1, Spiritual: 11, Atheist: 11, Agnostic: 12, Other: 2, 'Prefer not to say': 3 }),
    diet: [.10, .74, .06, .01, .003, .09], smoke: [.72, .16, .08, .04], drink: [.18, .58, .14, .10],
    langs: ['English', 'French'], english: .96, complete: [.21, .30, .49], chipRate: .30, lgbtDisclosure: .85 },
  UK: { key: 'UK', share: 0.05, mf: 1.70, age: [.12, .26, .25, .16, .09, .09, .03],
    goal: [.07, .30, .28, .22, .06, .07], kids: [.28, .27, .31, .14],
    rel: rel({ Christian: 42, Muslim: 6, Hindu: 2, Sikh: 1, Jewish: 1, Buddhist: 1, Spiritual: 10, Atheist: 16, Agnostic: 15, Other: 2, 'Prefer not to say': 4 }),
    diet: [.12, .70, .06, .01, .003, .11], smoke: [.68, .19, .09, .04], drink: [.14, .58, .18, .10],
    langs: ['English'], english: .98, complete: [.21, .30, .49], chipRate: .29, lgbtDisclosure: .85 },
  EU: { key: 'EU', share: 0.09, mf: 1.72, age: [.12, .26, .25, .16, .09, .09, .03],
    goal: [.06, .29, .29, .22, .07, .07], kids: [.27, .28, .31, .14],
    rel: rel({ Christian: 46, Muslim: 6, Jewish: 1, Buddhist: 1, Spiritual: 9, Atheist: 17, Agnostic: 14, Other: 2, 'Prefer not to say': 4 }),
    diet: [.11, .72, .06, .01, .003, .10], smoke: [.56, .24, .14, .06], drink: [.12, .58, .20, .10],
    langs: ['German', 'French', 'Spanish', 'Italian', 'Portuguese', 'Russian'], english: .62,
    complete: [.22, .30, .48], chipRate: .28, lgbtDisclosure: .72 },
  ME: { key: 'ME', share: 0.06, mf: 3.80, age: [.13, .30, .28, .15, .07, .05, .02],
    goal: [.34, .24, .20, .10, .06, .06], kids: [.46, .08, .28, .18],
    rel: rel({ Muslim: 68, Christian: 12, Hindu: 8, Jewish: 2, Sikh: 1, Buddhist: 1, Spiritual: 2, Atheist: 1, Agnostic: 1, Other: 1, 'Prefer not to say': 3 }),
    diet: [.14, .74, .02, .04, .02, .04], smoke: [.54, .22, .18, .06], drink: [.58, .26, .08, .08],
    langs: ['Arabic', 'Hindi', 'Urdu', 'Malayalam', 'Tamil'], english: .70,
    complete: [.24, .30, .46], chipRate: .40, lgbtDisclosure: .06 },
  SEA: { key: 'SEA', share: 0.08, mf: 2.10, age: [.18, .30, .25, .13, .07, .05, .02],
    goal: [.20, .27, .24, .16, .07, .06], kids: [.38, .13, .32, .17],
    rel: rel({ Muslim: 30, Christian: 32, Buddhist: 22, Hindu: 4, Spiritual: 4, Atheist: 2, Agnostic: 2, Other: 2, 'Prefer not to say': 2 }),
    diet: [.09, .78, .03, .02, .01, .07], smoke: [.52, .24, .18, .06], drink: [.30, .48, .12, .10],
    langs: ['Indonesian', 'Tagalog', 'Thai', 'Vietnamese', 'Malay', 'Mandarin'], english: .55,
    complete: [.25, .30, .45], chipRate: .32, lgbtDisclosure: .45 },
  EA: { key: 'EA', share: 0.07, mf: 2.20, age: [.13, .30, .28, .15, .07, .05, .02],
    goal: [.14, .28, .28, .18, .06, .06], kids: [.26, .24, .34, .16],
    rel: rel({ Buddhist: 24, Christian: 18, Atheist: 26, Agnostic: 18, Spiritual: 6, Other: 4, 'Prefer not to say': 4 }),
    diet: [.05, .84, .02, .01, .002, .08], smoke: [.52, .22, .20, .06], drink: [.16, .58, .16, .10],
    langs: ['Japanese', 'Korean', 'Mandarin'], english: .38,
    complete: [.26, .30, .44], chipRate: .30, lgbtDisclosure: .30 },
  ANZ: { key: 'ANZ', share: 0.03, mf: 1.70, age: [.12, .26, .25, .16, .09, .09, .03],
    goal: [.08, .30, .28, .21, .06, .07], kids: [.30, .25, .31, .14],
    rel: rel({ Christian: 40, Buddhist: 3, Muslim: 3, Hindu: 3, Spiritual: 10, Atheist: 18, Agnostic: 16, Other: 3, 'Prefer not to say': 4 }),
    diet: [.11, .72, .06, .01, .003, .10], smoke: [.72, .17, .07, .04], drink: [.12, .58, .20, .10],
    langs: ['English'], english: .97, complete: [.21, .30, .49], chipRate: .29, lgbtDisclosure: .85 },
  LATAM: { key: 'LATAM', share: 0.07, mf: 1.90, age: [.16, .29, .25, .14, .08, .06, .02],
    goal: [.14, .28, .27, .18, .07, .06], kids: [.34, .18, .32, .16],
    rel: rel({ Christian: 72, Spiritual: 8, Atheist: 6, Agnostic: 6, Jewish: 1, Buddhist: 1, Other: 3, 'Prefer not to say': 3 }),
    diet: [.07, .82, .03, .01, .002, .07], smoke: [.62, .22, .12, .04], drink: [.14, .60, .16, .10],
    langs: ['Spanish', 'Portuguese'], english: .32, complete: [.24, .30, .46], chipRate: .28, lgbtDisclosure: .60 },
  AF: { key: 'AF', share: 0.07, mf: 2.60, age: [.20, .32, .24, .12, .06, .04, .02],
    goal: [.28, .26, .22, .12, .06, .06], kids: [.50, .06, .28, .16],
    rel: rel({ Christian: 52, Muslim: 34, Spiritual: 5, Atheist: 2, Agnostic: 2, Hindu: 1, Other: 2, 'Prefer not to say': 2 }),
    diet: [.06, .86, .02, .01, .002, .05], smoke: [.72, .16, .08, .04], drink: [.38, .44, .10, .08],
    langs: ['English', 'French', 'Arabic', 'Swahili', 'Portuguese'], english: .66,
    complete: [.28, .30, .42], chipRate: .30, lgbtDisclosure: .08 },
};

/** [city, admin region, country, lat, lng, market, tier, share-within-market] */
export type CityRow = [string, string, string, number, number, string, 'metro' | 'tier2' | 'small' | 'rural', number];
export const CITIES: CityRow[] = [
  // ---- India (30%)
  ['Bengaluru', 'Karnataka', 'India', 12.97, 77.59, 'IN', 'metro', .11], ['Mumbai', 'Maharashtra', 'India', 19.08, 72.88, 'IN', 'metro', .10],
  ['Delhi', 'Delhi', 'India', 28.61, 77.21, 'IN', 'metro', .09], ['Hyderabad', 'Telangana', 'India', 17.38, 78.49, 'IN', 'metro', .07],
  ['Pune', 'Maharashtra', 'India', 18.52, 73.86, 'IN', 'metro', .055], ['Chennai', 'Tamil Nadu', 'India', 13.08, 80.27, 'IN', 'metro', .05],
  ['Kolkata', 'West Bengal', 'India', 22.57, 88.36, 'IN', 'metro', .04], ['Ahmedabad', 'Gujarat', 'India', 23.02, 72.57, 'IN', 'metro', .03],
  ['Gurugram', 'Haryana', 'India', 28.46, 77.03, 'IN', 'metro', .03], ['Noida', 'Uttar Pradesh', 'India', 28.57, 77.32, 'IN', 'metro', .025],
  ['Jaipur', 'Rajasthan', 'India', 26.91, 75.79, 'IN', 'tier2', .025], ['Kochi', 'Kerala', 'India', 9.93, 76.27, 'IN', 'tier2', .02],
  ['Lucknow', 'Uttar Pradesh', 'India', 26.85, 80.95, 'IN', 'tier2', .02], ['Indore', 'Madhya Pradesh', 'India', 22.72, 75.86, 'IN', 'tier2', .018],
  ['Chandigarh', 'Punjab', 'India', 30.73, 76.78, 'IN', 'tier2', .015], ['Coimbatore', 'Tamil Nadu', 'India', 11.02, 76.97, 'IN', 'tier2', .014],
  ['Bhubaneswar', 'Odisha', 'India', 20.3, 85.82, 'IN', 'tier2', .012], ['Nagpur', 'Maharashtra', 'India', 21.15, 79.09, 'IN', 'tier2', .012],
  ['Surat', 'Gujarat', 'India', 21.17, 72.83, 'IN', 'tier2', .012], ['Visakhapatnam', 'Andhra Pradesh', 'India', 17.69, 83.22, 'IN', 'tier2', .011],
  ['Guwahati', 'Assam', 'India', 26.14, 91.74, 'IN', 'tier2', .01], ['Patna', 'Bihar', 'India', 25.59, 85.14, 'IN', 'tier2', .01],
  ['Varanasi', 'Uttar Pradesh', 'India', 25.32, 82.99, 'IN', 'small', .009], ['Madurai', 'Tamil Nadu', 'India', 9.93, 78.12, 'IN', 'small', .008],
  ['Ranchi', 'Jharkhand', 'India', 23.34, 85.31, 'IN', 'small', .008], ['Raipur', 'Chhattisgarh', 'India', 21.25, 81.63, 'IN', 'small', .007],
  ['Siliguri', 'West Bengal', 'India', 26.73, 88.4, 'IN', 'small', .006], ['Kozhikode', 'Kerala', 'India', 11.26, 75.78, 'IN', 'small', .006],
  // rural / unlisted: places the coordinate table has never heard of
  ['Bagalkot', 'Karnataka', 'India', 16.18, 75.7, 'IN', 'rural', .012], ['Chhindwara', 'Madhya Pradesh', 'India', 22.06, 78.94, 'IN', 'rural', .012],
  ['Deoghar', 'Jharkhand', 'India', 24.48, 86.7, 'IN', 'rural', .011], ['Nadiad', 'Gujarat', 'India', 22.69, 72.86, 'IN', 'rural', .011],
  ['Tumakuru', 'Karnataka', 'India', 13.34, 77.1, 'IN', 'rural', .011], ['Sitapur', 'Uttar Pradesh', 'India', 27.57, 80.68, 'IN', 'rural', .011],
  ['Barpeta', 'Assam', 'India', 26.32, 91.0, 'IN', 'rural', .01], ['Nandurbar', 'Maharashtra', 'India', 21.37, 74.24, 'IN', 'rural', .01],
  // ---- United States (14%)
  ['New York', 'NY', 'United States', 40.71, -74.01, 'US', 'metro', .13], ['Los Angeles', 'CA', 'United States', 34.05, -118.24, 'US', 'metro', .10],
  ['Chicago', 'IL', 'United States', 41.88, -87.63, 'US', 'metro', .07], ['San Francisco', 'CA', 'United States', 37.77, -122.42, 'US', 'metro', .06],
  ['Houston', 'TX', 'United States', 29.76, -95.37, 'US', 'metro', .05], ['Seattle', 'WA', 'United States', 47.61, -122.33, 'US', 'metro', .05],
  ['Atlanta', 'GA', 'United States', 33.75, -84.39, 'US', 'metro', .045], ['Boston', 'MA', 'United States', 42.36, -71.06, 'US', 'metro', .04],
  ['Miami', 'FL', 'United States', 25.76, -80.19, 'US', 'metro', .04], ['Austin', 'TX', 'United States', 30.27, -97.74, 'US', 'metro', .035],
  ['Denver', 'CO', 'United States', 39.74, -104.99, 'US', 'metro', .03], ['Phoenix', 'AZ', 'United States', 33.45, -112.07, 'US', 'metro', .03],
  ['Philadelphia', 'PA', 'United States', 39.95, -75.17, 'US', 'tier2', .03], ['Minneapolis', 'MN', 'United States', 44.98, -93.27, 'US', 'tier2', .025],
  ['Portland', 'OR', 'United States', 45.52, -122.68, 'US', 'tier2', .025], ['Nashville', 'TN', 'United States', 36.16, -86.78, 'US', 'tier2', .02],
  ['Salem', 'Oregon', 'United States', 44.94, -123.04, 'US', 'tier2', .02], ['Kansas City', 'MO', 'United States', 39.1, -94.58, 'US', 'tier2', .02],
  ['Springfield', 'Illinois', 'United States', 39.78, -89.65, 'US', 'small', .02], ['Fargo', 'North Dakota', 'United States', 46.88, -96.79, 'US', 'small', .02],
  ['Boise', 'Idaho', 'United States', 43.62, -116.2, 'US', 'small', .02], ['Missoula', 'Montana', 'United States', 46.87, -113.99, 'US', 'rural', .025],
  ['Bozeman', 'Montana', 'United States', 45.68, -111.04, 'US', 'rural', .02], ['Dothan', 'Alabama', 'United States', 31.22, -85.39, 'US', 'rural', .02],
  ['Elko', 'Nevada', 'United States', 40.83, -115.76, 'US', 'rural', .02], ['Presque Isle', 'Maine', 'United States', 46.68, -68.02, 'US', 'rural', .02],
  // ---- Canada (4%)
  ['Toronto', 'Ontario', 'Canada', 43.65, -79.38, 'CA', 'metro', .30], ['Vancouver', 'British Columbia', 'Canada', 49.28, -123.12, 'CA', 'metro', .18],
  ['Montreal', 'Quebec', 'Canada', 45.5, -73.57, 'CA', 'metro', .16], ['Calgary', 'Alberta', 'Canada', 51.05, -114.07, 'CA', 'metro', .10],
  ['Ottawa', 'Ontario', 'Canada', 45.42, -75.7, 'CA', 'tier2', .08], ['Edmonton', 'Alberta', 'Canada', 53.55, -113.49, 'CA', 'tier2', .06],
  ['London', 'Ontario', 'Canada', 42.98, -81.25, 'CA', 'tier2', .06], ['Halifax', 'Nova Scotia', 'Canada', 44.65, -63.58, 'CA', 'small', .04],
  ['Thunder Bay', 'Ontario', 'Canada', 48.38, -89.25, 'CA', 'rural', .02],
  // ---- UK (5%)
  ['London', 'England', 'United Kingdom', 51.51, -0.13, 'UK', 'metro', .42], ['Manchester', 'England', 'United Kingdom', 53.48, -2.24, 'UK', 'metro', .12],
  ['Birmingham', 'England', 'United Kingdom', 52.49, -1.89, 'UK', 'metro', .10], ['Glasgow', 'Scotland', 'United Kingdom', 55.86, -4.25, 'UK', 'metro', .07],
  ['Leeds', 'England', 'United Kingdom', 53.8, -1.55, 'UK', 'tier2', .06], ['Bristol', 'England', 'United Kingdom', 51.45, -2.59, 'UK', 'tier2', .05],
  ['Edinburgh', 'Scotland', 'United Kingdom', 55.95, -3.19, 'UK', 'tier2', .05], ['Cardiff', 'Wales', 'United Kingdom', 51.48, -3.18, 'UK', 'tier2', .04],
  ['Belfast', 'Northern Ireland', 'United Kingdom', 54.6, -5.93, 'UK', 'small', .03],
  ['Norwich', 'England', 'United Kingdom', 52.63, 1.3, 'UK', 'small', .03], ['Inverness', 'Scotland', 'United Kingdom', 57.48, -4.22, 'UK', 'rural', .03],
  // ---- Europe (9%)
  ['Paris', 'Île-de-France', 'France', 48.86, 2.35, 'EU', 'metro', .13], ['Berlin', 'Berlin', 'Germany', 52.52, 13.4, 'EU', 'metro', .11],
  ['Madrid', 'Madrid', 'Spain', 40.42, -3.7, 'EU', 'metro', .09], ['Amsterdam', 'North Holland', 'Netherlands', 52.37, 4.9, 'EU', 'metro', .07],
  ['Milan', 'Lombardy', 'Italy', 45.46, 9.19, 'EU', 'metro', .07], ['Barcelona', 'Catalonia', 'Spain', 41.39, 2.17, 'EU', 'metro', .06],
  ['Munich', 'Bavaria', 'Germany', 48.14, 11.58, 'EU', 'metro', .06], ['Warsaw', 'Mazovia', 'Poland', 52.23, 21.01, 'EU', 'metro', .05],
  ['Stockholm', 'Stockholm', 'Sweden', 59.33, 18.07, 'EU', 'tier2', .05], ['Lisbon', 'Lisbon', 'Portugal', 38.72, -9.14, 'EU', 'tier2', .05],
  ['Dublin', 'Leinster', 'Ireland', 53.35, -6.26, 'EU', 'tier2', .04], ['Rome', 'Lazio', 'Italy', 41.9, 12.5, 'EU', 'tier2', .04],
  ['Vienna', 'Vienna', 'Austria', 48.21, 16.37, 'EU', 'tier2', .04], ['Athens', 'Attica', 'Greece', 37.98, 23.73, 'EU', 'tier2', .04],
  ['Bucharest', 'Bucharest', 'Romania', 44.43, 26.1, 'EU', 'tier2', .04], ['Porto', 'Porto', 'Portugal', 41.15, -8.61, 'EU', 'small', .03],
  ['Trondheim', 'Trøndelag', 'Norway', 63.43, 10.4, 'EU', 'small', .03], ['Lublin', 'Lublin', 'Poland', 51.25, 22.57, 'EU', 'rural', .02],
  ['Kalamata', 'Peloponnese', 'Greece', 37.04, 22.11, 'EU', 'rural', .02],
  // ---- Middle East (6%)
  ['Dubai', 'Dubai', 'United Arab Emirates', 25.2, 55.27, 'ME', 'metro', .30], ['Abu Dhabi', 'Abu Dhabi', 'United Arab Emirates', 24.45, 54.38, 'ME', 'metro', .12],
  ['Riyadh', 'Riyadh', 'Saudi Arabia', 24.71, 46.68, 'ME', 'metro', .12], ['Doha', 'Doha', 'Qatar', 25.29, 51.53, 'ME', 'metro', .08],
  ['Kuwait City', 'Al Asimah', 'Kuwait', 29.38, 47.99, 'ME', 'metro', .06], ['Muscat', 'Muscat', 'Oman', 23.59, 58.41, 'ME', 'tier2', .05],
  ['Manama', 'Capital', 'Bahrain', 26.23, 50.59, 'ME', 'tier2', .04], ['Cairo', 'Cairo', 'Egypt', 30.04, 31.24, 'ME', 'metro', .10],
  ['Istanbul', 'Istanbul', 'Turkey', 41.01, 28.98, 'ME', 'metro', .08], ['Tel Aviv', 'Tel Aviv', 'Israel', 32.09, 34.78, 'ME', 'tier2', .03],
  ['Jerusalem', 'Jerusalem', 'Israel', 31.77, 35.21, 'ME', 'tier2', .02],
  // ---- Southeast Asia (8%)
  ['Singapore', 'Singapore', 'Singapore', 1.35, 103.82, 'SEA', 'metro', .16], ['Jakarta', 'Jakarta', 'Indonesia', -6.21, 106.85, 'SEA', 'metro', .16],
  ['Manila', 'Metro Manila', 'Philippines', 14.6, 120.98, 'SEA', 'metro', .14], ['Bangkok', 'Bangkok', 'Thailand', 13.76, 100.5, 'SEA', 'metro', .13],
  ['Kuala Lumpur', 'Selangor', 'Malaysia', 3.14, 101.69, 'SEA', 'metro', .11], ['Ho Chi Minh City', 'Ho Chi Minh', 'Vietnam', 10.82, 106.63, 'SEA', 'metro', .10],
  ['Hanoi', 'Hanoi', 'Vietnam', 21.03, 105.85, 'SEA', 'tier2', .06], ['Cebu', 'Central Visayas', 'Philippines', 10.32, 123.89, 'SEA', 'tier2', .05],
  ['Surabaya', 'East Java', 'Indonesia', -7.25, 112.75, 'SEA', 'tier2', .05], ['Chiang Mai', 'Chiang Mai', 'Thailand', 18.79, 98.99, 'SEA', 'small', .04],
  // ---- East Asia (7%)
  ['Tokyo', 'Tokyo', 'Japan', 35.68, 139.69, 'EA', 'metro', .22], ['Seoul', 'Seoul', 'South Korea', 37.57, 126.98, 'EA', 'metro', .20],
  ['Shanghai', 'Shanghai', 'China', 31.23, 121.47, 'EA', 'metro', .14], ['Hong Kong', 'Hong Kong', 'Hong Kong', 22.32, 114.17, 'EA', 'metro', .11],
  ['Taipei', 'Taipei', 'Taiwan', 25.03, 121.57, 'EA', 'metro', .09], ['Osaka', 'Osaka', 'Japan', 34.69, 135.5, 'EA', 'metro', .08],
  ['Beijing', 'Beijing', 'China', 39.9, 116.41, 'EA', 'metro', .07], ['Busan', 'Busan', 'South Korea', 35.18, 129.08, 'EA', 'tier2', .05],
  ['Kochi', 'Kochi', 'Japan', 33.56, 133.53, 'EA', 'small', .04],
  // ---- Australia / NZ (3%)
  ['Sydney', 'New South Wales', 'Australia', -33.87, 151.21, 'ANZ', 'metro', .32], ['Melbourne', 'Victoria', 'Australia', -37.81, 144.96, 'ANZ', 'metro', .27],
  ['Brisbane', 'Queensland', 'Australia', -27.47, 153.03, 'ANZ', 'metro', .13], ['Perth', 'Western Australia', 'Australia', -31.95, 115.86, 'ANZ', 'metro', .10],
  ['Auckland', 'Auckland', 'New Zealand', -36.85, 174.76, 'ANZ', 'metro', .10], ['Wellington', 'Wellington', 'New Zealand', -41.29, 174.78, 'ANZ', 'tier2', .05],
  ['Alice Springs', 'Northern Territory', 'Australia', -23.7, 133.88, 'ANZ', 'rural', .03],
  // ---- Latin America (7%)
  ['Sao Paulo', 'Sao Paulo', 'Brazil', -23.55, -46.63, 'LATAM', 'metro', .22], ['Mexico City', 'CDMX', 'Mexico', 19.43, -99.13, 'LATAM', 'metro', .20],
  ['Buenos Aires', 'Buenos Aires', 'Argentina', -34.6, -58.38, 'LATAM', 'metro', .14], ['Bogota', 'Bogota', 'Colombia', 4.71, -74.07, 'LATAM', 'metro', .11],
  ['Rio de Janeiro', 'Rio de Janeiro', 'Brazil', -22.91, -43.17, 'LATAM', 'metro', .10], ['Lima', 'Lima', 'Peru', -12.05, -77.04, 'LATAM', 'metro', .08],
  ['Santiago', 'Santiago', 'Chile', -33.45, -70.67, 'LATAM', 'metro', .07], ['Guadalajara', 'Jalisco', 'Mexico', 20.67, -103.35, 'LATAM', 'tier2', .05],
  ['Cordoba', 'Cordoba', 'Argentina', -31.42, -64.18, 'LATAM', 'small', .03],
  // ---- Africa (7%)
  ['Lagos', 'Lagos', 'Nigeria', 6.52, 3.38, 'AF', 'metro', .22], ['Nairobi', 'Nairobi', 'Kenya', -1.29, 36.82, 'AF', 'metro', .16],
  ['Johannesburg', 'Gauteng', 'South Africa', -26.2, 28.05, 'AF', 'metro', .15], ['Cape Town', 'Western Cape', 'South Africa', -33.92, 18.42, 'AF', 'metro', .11],
  ['Accra', 'Greater Accra', 'Ghana', 5.6, -0.19, 'AF', 'metro', .09], ['Casablanca', 'Casablanca-Settat', 'Morocco', 33.57, -7.59, 'AF', 'metro', .08],
  ['Addis Ababa', 'Addis Ababa', 'Ethiopia', 9.03, 38.74, 'AF', 'metro', .07], ['Kampala', 'Central', 'Uganda', 0.35, 32.58, 'AF', 'tier2', .05],
  ['Abuja', 'FCT', 'Nigeria', 9.06, 7.49, 'AF', 'tier2', .04], ['Kisumu', 'Kisumu', 'Kenya', -0.09, 34.77, 'AF', 'rural', .03],
];

export type Archetype = 'normal' | 'generic' | 'gamer' | 'catfish' | 'bot' | 'scammer' | 'agelie' | 'intentlie' | 'maximalist' | 'contradictory' | 'optimal';

export interface GP {
  id: string; market: string; city: string; state: string; country: string;
  lat: number; lng: number; tier: CityRow[6];
  gender: 'male' | 'female' | 'nonbinary';
  seeking: 'male' | 'female' | 'nonbinary' | 'any';
  orientation: 'straight' | 'gay' | 'lesbian' | 'bi' | 'other';
  age: number; statedAge: number; birthDate: Date;
  languages: string[];
  interests: string[];
  complete: 'thin' | 'partial' | 'full';
  archetype: Archetype;
  dx: DXProfile;
  /** latent, never seen by the engine */
  appeal: number;
  /** what they'd actually do, regardless of what they ticked */
  trueCommitted: boolean;
}

export function buildPopulation(n: number, seed = 42): GP[] {
  const rnd = rngFrom(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const wpick = (opts: string[], w: number[]): string => {
    let r = rnd(); for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; } return opts[opts.length - 1];
  };
  const maybe = <T,>(v: T, p: number): T | undefined => (rnd() < p ? v : undefined);

  // city cumulative table weighted by market share × within-market share
  const cum: { row: CityRow; upto: number }[] = [];
  let acc = 0;
  for (const row of CITIES) { acc += MARKETS[row[5]].share * row[7]; cum.push({ row, upto: acc }); }
  const TOT = acc;
  const AGE_BUCKETS: [number, number][] = [[18, 21], [22, 25], [26, 30], [31, 35], [36, 40], [41, 50], [51, 64]];

  const out: GP[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = rnd() * TOT;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid].upto < r) lo = mid + 1; else hi = mid; }
    const [city, state, country, lat, lng, mk, tier] = cum[lo].row;
    const M = MARKETS[mk];

    // gender & orientation
    const femaleShare = 1 / (1 + M.mf);
    const gr = rnd();
    let gender: GP['gender'] = gr < 0.012 ? 'nonbinary' : gr < 0.012 + femaleShare * 0.988 ? 'female' : 'male';
    const orr = rnd();
    let orientation: GP['orientation'] = orr < 0.90 ? 'straight' : orr < 0.935 ? 'bi' : orr < 0.965 ? (gender === 'female' ? 'lesbian' : 'gay') : orr < 0.99 ? (gender === 'male' ? 'gay' : 'lesbian') : 'other';
    if (gender === 'nonbinary') orientation = 'other';
    // Disclosure: in markets where it is unsafe, a non-straight user presents as straight.
    const disclosed = orientation === 'straight' || rnd() < M.lgbtDisclosure;
    const effOrient = disclosed ? orientation : 'straight';
    let seeking: GP['seeking'];
    if (gender === 'nonbinary') seeking = 'any';
    else if (effOrient === 'straight') seeking = gender === 'male' ? 'female' : 'male';
    else if (effOrient === 'gay' || effOrient === 'lesbian') seeking = gender;
    else seeking = 'any';                       // bi and "other" have no other way to say it

    // age
    const bi = wpick(AGE_BUCKETS.map((_, k) => String(k)), M.age);
    const [a0, a1] = AGE_BUCKETS[Number(bi)];
    const age = a0 + Math.floor(rnd() * (a1 - a0 + 1));
    const month = Math.floor(rnd() * 12), day = 1 + Math.floor(rnd() * 28);
    const birthDate = new Date(Date.UTC(2026 - age, month, day));

    // archetype
    const ar = rnd();
    const archetype: Archetype =
      ar < 0.008 ? 'catfish' : ar < 0.014 ? 'bot' : ar < 0.020 ? 'scammer' :
      ar < 0.032 ? 'agelie' : ar < 0.042 ? 'intentlie' : ar < 0.062 ? 'generic' :
      ar < 0.068 ? 'gamer' : ar < 0.098 ? 'maximalist' : ar < 0.118 ? 'contradictory' :
      ar < 0.121 ? 'optimal' : 'normal';

    const complete: GP['complete'] = archetype === 'bot' || archetype === 'generic' || archetype === 'optimal' ? 'full'
      : wpick(['thin', 'partial', 'full'], M.complete) as GP['complete'];

    const langs = [...new Set([...(rnd() < M.english ? ['English'] : []), pick(M.langs)])];

    const interests = archetype === 'gamer' || archetype === 'generic' || archetype === 'optimal' ? [...INTERESTS]
      : complete === 'thin' ? []
        : complete === 'partial' ? (rnd() < 0.5 ? [] : [pick(INTERESTS), pick(INTERESTS)])
          : [...new Set(Array.from({ length: 3 + Math.floor(rnd() * 5) }, () => pick(INTERESTS)))];

    const traits = archetype === 'gamer' || archetype === 'generic' || archetype === 'optimal' ? [...TRAITS]
      : [...new Set(Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => pick(TRAITS)))];
    const vals = archetype === 'gamer' || archetype === 'optimal' ? [...VALUES]
      : [...new Set(Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => pick(VALUES)))];

    const goal = wpick(GOAL_VOCAB, M.goal);
    const kids = wpick(CHILDREN, M.kids);
    const religion = wpick(RELIGIONS, M.rel);
    const diet = wpick(DIETS, M.diet);
    const smoking = wpick(SMOKE, M.smoke);
    const drinking = wpick(DRINK, M.drink);

    // chips — a gamer ticks none (a filter only ever costs them pool)
    const chips: string[] = [];
    if (archetype !== 'gamer' && complete !== 'thin' && rnd() < M.chipRate) {
      const k = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < k; j++) { const c = pick(CHIPS); if (!chips.includes(c) && chips.length < 5) chips.push(c); }
    }

    const base = { city, state, country, languages: langs };
    const wide = archetype === 'gamer';
    let dx: DXProfile;
    if (complete === 'thin') {
      dx = { ...base, prefAgeMin: null, prefAgeMax: null, dealBreakers: [] };
    } else if (complete === 'partial') {
      dx = {
        ...base, relationshipGoal: goal, diet: maybe(diet, 0.6), religion: maybe(religion, 0.35),
        dealBreakers: chips,
        prefAgeMin: maybe(age - 5, 0.4) ?? null, prefAgeMax: maybe(age + 6, 0.4) ?? null,
        prefDistanceKm: maybe(pick([50, 100, 200, 500]), 0.4) ?? null,
        prefDiet: maybe(diet, 0.2), wantsChildren: maybe(kids, 0.35),
        heightCm: maybe(150 + Math.floor(rnd() * 35), 0.5) ?? null,
      };
    } else {
      dx = {
        ...base, personalityTraits: traits, values: vals, relationshipGoal: goal,
        diet: maybe(diet, 0.85), smoking: maybe(smoking, 0.8), drinking: maybe(drinking, 0.8),
        fitnessLevel: maybe(wpick(FIT, [.2, .3, .25, .15, .1]), 0.7),
        religion: maybe(religion, 0.6),
        prefAgeMin: wide ? null : maybe(age - 5, 0.6) ?? null,
        prefAgeMax: wide ? null : maybe(age + 6, 0.6) ?? null,
        prefDistanceKm: wide ? null : maybe(pick([50, 100, 200, 500, 2000]), 0.5) ?? null,
        prefDiet: wide ? undefined : maybe(diet, 0.3),
        prefSmoking: wide ? undefined : maybe('Never', 0.25),
        prefDrinking: wide ? undefined : maybe(pick(DRINK), 0.2),
        dealBreakers: chips,
        wantsChildren: maybe(kids, 0.55),
        heightCm: 150 + Math.floor(rnd() * 40),
        prefHeightMinCm: wide ? null : maybe(gender === 'female' ? 170 : 150, 0.22) ?? null,
        prefHeightMaxCm: wide ? null : maybe(gender === 'female' ? 195 : 175, 0.22) ?? null,
      };
    }
    // Adversarial overrides.
    if (archetype === 'generic') {
      dx.relationshipGoal = 'Still figuring it out';
      dx.wantsChildren = 'Maybe'; dx.diet = undefined; dx.smoking = undefined; dx.drinking = undefined;
      dx.prefDiet = undefined; dx.prefSmoking = undefined; dx.prefDrinking = undefined;
      dx.prefAgeMin = null; dx.prefAgeMax = null; dx.prefDistanceKm = null; dx.dealBreakers = [];
      dx.religion = 'Prefer not to say';
    }
    if (archetype === 'intentlie') dx.relationshipGoal = GOAL_VOCAB[0];   // says Marriage, means casual
    if (archetype === 'contradictory') { dx.prefDiet = pick(DIETS.filter((d) => d !== dx.diet)); dx.dealBreakers = ['Diet', 'Distance']; dx.prefDistanceKm = 25; }
    if (archetype === 'maximalist') {
      dx.dealBreakers = CHIPS.slice(0, 5);
      dx.prefAgeMin = age - 2; dx.prefAgeMax = age + 2; dx.prefDistanceKm = 25;
      dx.prefDiet = diet; dx.religion = religion;
    }
    /**
     * THE OPTIMAL PROFILE — every rule in matching.ts read as an instruction.
     *
     *  · answer only the fields that can ONLY ADD (traits, values, interests):
     *    personalityScore is 35 + 13×shared, uncapped in the number of traits,
     *    so listing all ten maximises shared against everybody; the astrology
     *    interest bonus is a raw count, so listing all fourteen is always +8.
     *  · leave every FILTERABLE field blank (diet, smoking, drinking, religion,
     *    children, height). "A field neither side filled in filters nobody",
     *    so a blank answer is immunity from every deal-breaker chip anyone
     *    else ticks. It costs 0.05 of coverage — a ×0.978 multiplier.
     *  · state no preferences and tick no chips, so nothing is removed by your
     *    own side either.
     *  · relationshipGoal = 'Marriage', the only label GOAL_ORDER can parse.
     *  · gender female, seeking 'any' — the most-sought gender, seeking all.
     *  · live in the largest city the coordinate table can place.
     */
    if (archetype === 'optimal') {
      dx = {
        city: 'Mumbai', state: 'Maharashtra', country: 'India',
        personalityTraits: [...TRAITS], values: [...VALUES], relationshipGoal: 'Marriage',
        dealBreakers: [], prefAgeMin: null, prefAgeMax: null, prefDistanceKm: null,
        heightCm: null, prefHeightMinCm: null, prefHeightMaxCm: null,
      };
      gender = 'female'; seeking = 'any';
    }

    const statedAge = archetype === 'agelie' ? Math.max(18, age - (3 + Math.floor(rnd() * 8))) : age;

    const trueCommitted = archetype === 'intentlie' ? false
      : ['Marriage', 'Long-term relationship', 'Long-term Relationship', 'Serious dating', 'Serious Dating'].includes(goal);

    const isOpt = archetype === 'optimal';
    out[i] = {
      id: `u${i}`, market: isOpt ? 'IN' : mk,
      city: isOpt ? 'Mumbai' : city, state: isOpt ? 'Maharashtra' : state, country: isOpt ? 'India' : country,
      lat: isOpt ? 19.08 : lat, lng: isOpt ? 72.88 : lng, tier,
      gender, seeking, orientation, age, statedAge, birthDate, languages: langs, interests,
      complete, archetype, dx, appeal: rnd(), trueCommitted,
    };
  }
  return out;
}

export const R_KM = 6371;
export function trueKm(a: GP, b: GP): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R_KM * 2 * Math.asin(Math.min(1, Math.sqrt(s))));
}

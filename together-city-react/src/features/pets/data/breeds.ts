/**
 * BREEDS, AS FAR AS THIS HUB NEEDS THEM.
 *
 * Not a breed encyclopaedia — a size and life-stage lookup. The planner asks
 * three questions of a breed and no more: how heavy is an adult of it, at what
 * age does it stop being a puppy, and at what age does it become senior. Those
 * three change the calorie factor and nothing else here does.
 *
 * WHY THE ADULT WEIGHT MATTERS EVEN THOUGH THE OWNER TYPES A WEIGHT: a four-
 * month-old Labrador at 14 kg is not an under-weight adult, and a plan that
 * read 14 kg without knowing what it grows into would feed it like one. The
 * breed's adult range is what lets the growth plan say "on track" honestly.
 *
 * The list is the breeds Indian pet parents actually keep, which is why it
 * opens with the Indie / Indian Pariah — the most common dog in the country and
 * the one missing from every imported breed list.
 */

export interface BreedRef {
  name: string;
  species: 'dog' | 'cat';
  size: 'small' | 'medium' | 'large' | 'giant';
  adultKg: [number, number];
  puppyMonths: number;
  seniorYears: number;
  note: string;
}

export const BREEDS: BreedRef[] = [
  { name: 'Indie / Indian Pariah', species: 'dog', size: 'medium', adultKg: [15, 25], puppyMonths: 12, seniorYears: 8, note: 'Hardy, moderate build; India’s most common dog.' },
  { name: 'Labrador Retriever', species: 'dog', size: 'large', adultKg: [25, 36], puppyMonths: 15, seniorYears: 7, note: 'Prone to weight gain — portion control matters.' },
  { name: 'Golden Retriever', species: 'dog', size: 'large', adultKg: [25, 34], puppyMonths: 15, seniorYears: 7, note: 'Heavy coat; grooming load is high in Indian summers.' },
  { name: 'German Shepherd', species: 'dog', size: 'large', adultKg: [22, 40], puppyMonths: 18, seniorYears: 7, note: 'Large-breed growth needs controlled calcium — vet guidance.' },
  { name: 'Beagle', species: 'dog', size: 'medium', adultKg: [9, 11], puppyMonths: 12, seniorYears: 8, note: 'Food-motivated; treat budget is the whole battle.' },
  { name: 'Pug', species: 'dog', size: 'small', adultKg: [6, 8], puppyMonths: 10, seniorYears: 7, note: 'Brachycephalic — avoid exercise in daytime heat.' },
  { name: 'Shih Tzu', species: 'dog', size: 'small', adultKg: [4, 7], puppyMonths: 10, seniorYears: 8, note: 'Daily coat care; small mouths suit small kibble.' },
  { name: 'Golden Doodle', species: 'dog', size: 'large', adultKg: [20, 30], puppyMonths: 15, seniorYears: 8, note: 'Coat needs professional grooming every 6–8 weeks.' },
  { name: 'Rottweiler', species: 'dog', size: 'giant', adultKg: [40, 60], puppyMonths: 18, seniorYears: 6, note: 'Joint load is high — growth rate should be slow.' },
  { name: 'Dobermann', species: 'dog', size: 'large', adultKg: [30, 45], puppyMonths: 18, seniorYears: 7, note: 'Lean build; ribs should be easily felt.' },
  { name: 'Cocker Spaniel', species: 'dog', size: 'medium', adultKg: [12, 15], puppyMonths: 12, seniorYears: 8, note: 'Ear care is a weekly job, not a monthly one.' },
  { name: 'Dachshund', species: 'dog', size: 'small', adultKg: [7, 15], puppyMonths: 12, seniorYears: 8, note: 'Extra weight is a spinal risk, not a cosmetic one.' },
  { name: 'Great Dane', species: 'dog', size: 'giant', adultKg: [50, 80], puppyMonths: 24, seniorYears: 6, note: 'Giant-breed growth diets only — vet supervision.' },
  { name: 'Pomeranian', species: 'dog', size: 'small', adultKg: [2, 4], puppyMonths: 10, seniorYears: 8, note: 'Tiny stomach — small frequent meals.' },
  { name: 'Rajapalayam', species: 'dog', size: 'large', adultKg: [22, 35], puppyMonths: 15, seniorYears: 8, note: 'Indian sighthound; lean by nature, not underweight.' },
  { name: 'Mudhol Hound', species: 'dog', size: 'large', adultKg: [20, 30], puppyMonths: 15, seniorYears: 8, note: 'Indian sighthound; visible waist is correct.' },
  { name: 'Mixed / Unknown', species: 'dog', size: 'medium', adultKg: [10, 25], puppyMonths: 12, seniorYears: 8, note: 'Plan works from weight and body condition instead.' },

  { name: 'Indian Billi / Domestic Shorthair', species: 'cat', size: 'medium', adultKg: [3, 5], puppyMonths: 12, seniorYears: 10, note: 'India’s most common cat; robust and adaptable.' },
  { name: 'Persian', species: 'cat', size: 'medium', adultKg: [3, 5.5], puppyMonths: 12, seniorYears: 9, note: 'Flat face — kibble shape and daily grooming matter.' },
  { name: 'Siamese', species: 'cat', size: 'medium', adultKg: [2.5, 4.5], puppyMonths: 12, seniorYears: 10, note: 'Vocal and active; higher play requirement.' },
  { name: 'Bengal', species: 'cat', size: 'large', adultKg: [4, 7], puppyMonths: 15, seniorYears: 10, note: 'High energy — enrichment is a health need.' },
  { name: 'Maine Coon', species: 'cat', size: 'large', adultKg: [5, 9], puppyMonths: 24, seniorYears: 9, note: 'Grows slowly; still a kitten at 18 months.' },
  { name: 'Ragdoll', species: 'cat', size: 'large', adultKg: [4.5, 9], puppyMonths: 24, seniorYears: 9, note: 'Placid — weight creeps up quietly.' },
  { name: 'British Shorthair', species: 'cat', size: 'medium', adultKg: [4, 8], puppyMonths: 18, seniorYears: 9, note: 'Prone to obesity; measure, do not free-feed.' },
  { name: 'Himalayan', species: 'cat', size: 'medium', adultKg: [3, 6], puppyMonths: 12, seniorYears: 9, note: 'Long coat plus flat face — both need daily care.' },
  { name: 'Mixed / Unknown', species: 'cat', size: 'medium', adultKg: [3, 5], puppyMonths: 12, seniorYears: 10, note: 'Plan works from weight and body condition instead.' },
];

export const breedsFor = (species: 'dog' | 'cat') => BREEDS.filter((b) => b.species === species);
export const findBreed = (species: 'dog' | 'cat', name: string) =>
  BREEDS.find((b) => b.species === species && b.name === name) ?? null;

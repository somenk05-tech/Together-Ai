/**
 * PET SERVICES — a directory shape, filled with SAMPLE listings.
 *
 * Every other dataset in this hub is real and sourced. This one is not, and
 * saying so here is the point: inventing named veterinary clinics with star
 * ratings and opening hours would be indistinguishable, on screen, from a real
 * directory — and somebody would drive to one at eleven at night with a sick
 * animal.
 *
 * So these carry `verified: false`, the UI marks the whole section as a sample,
 * and the real directory is a join to Together City's own Local Services hub,
 * which already holds businesses, geography and reviews. The one thing that is
 * NOT sample data is the emergency guidance in the UI, which is generic and
 * true: an emergency is a phone call to the nearest open veterinary hospital.
 */

import type { ServiceListing } from '../types';

export const SERVICE_KINDS = [
  { key: 'vet', label: 'Veterinarians', glyph: '🩺' },
  { key: 'emergency', label: 'Emergency vets', glyph: '🚨' },
  { key: 'groomer', label: 'Groomers', glyph: '✂️' },
  { key: 'boarding', label: 'Boarding', glyph: '🏠' },
  { key: 'sitter', label: 'Pet sitters', glyph: '🧑‍🍼' },
  { key: 'walker', label: 'Dog walkers', glyph: '🦮' },
  { key: 'trainer', label: 'Trainers', glyph: '🎓' },
  { key: 'store', label: 'Pet stores', glyph: '🛍️' },
] as const;

export const SERVICE_CITIES = ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata'];

const s = (
  id: string, name: string, kind: ServiceListing['kind'], city: string, area: string,
  rating: number | null, reviews: number | null, open: string, note: string,
): ServiceListing => ({ id, name, kind, city, area, rating, reviews, open, species: 'both', note, verified: false });

export const SERVICES: ServiceListing[] = [
  s('svc-1', 'Whitefield Small Animal Clinic', 'vet', 'Bengaluru', 'Whitefield', 4.7, 312, 'Mon–Sat 9am–8pm', 'General practice, vaccination, diagnostics.'),
  s('svc-2', 'Indiranagar Veterinary Hospital', 'vet', 'Bengaluru', 'Indiranagar', 4.5, 208, 'Daily 10am–9pm', 'Surgery and in-house lab.'),
  s('svc-3', 'City 24-Hour Animal Emergency', 'emergency', 'Bengaluru', 'Koramangala', 4.4, 96, 'Open 24 hours', 'Critical care, admitted patients, ambulance on call.'),
  s('svc-4', 'Bandra Pet Emergency & ICU', 'emergency', 'Mumbai', 'Bandra West', 4.6, 141, 'Open 24 hours', 'Emergency and intensive care.'),
  s('svc-5', 'Powai Veterinary Centre', 'vet', 'Mumbai', 'Powai', 4.3, 187, 'Mon–Sat 10am–8pm', 'Preventive care and dentistry.'),
  s('svc-6', 'The Grooming Room', 'groomer', 'Mumbai', 'Andheri West', 4.8, 421, 'Tue–Sun 10am–7pm', 'Breed cuts, de-shedding, cat grooming.'),
  s('svc-7', 'Paws & Polish Spa', 'groomer', 'Bengaluru', 'HSR Layout', 4.6, 289, 'Daily 9am–7pm', 'Home service available.'),
  s('svc-8', 'Gurgaon Pet Resort', 'boarding', 'Delhi NCR', 'Sector 56', 4.5, 174, 'Daily 8am–8pm', 'Day boarding and overnight suites.'),
  s('svc-9', 'Happy Tails Boarding', 'boarding', 'Hyderabad', 'Gachibowli', 4.2, 88, 'Daily 9am–7pm', 'Small-group home boarding.'),
  s('svc-10', 'Neighbourhood Pet Sitters', 'sitter', 'Pune', 'Koregaon Park', 4.7, 63, 'By appointment', 'In-home sitting and drop-in visits.'),
  s('svc-11', 'Morning Walks Collective', 'walker', 'Bengaluru', 'Jayanagar', 4.4, 51, 'Daily 6am–10am, 5pm–8pm', 'Solo and small-group walks.'),
  s('svc-12', 'Good Dog Training', 'trainer', 'Delhi NCR', 'Vasant Kunj', 4.9, 132, 'By appointment', 'Force-free obedience and behaviour.'),
  s('svc-13', 'Calm Cats Behaviour', 'trainer', 'Mumbai', 'Colaba', 4.6, 44, 'By appointment', 'Feline behaviour consults, litter-box issues.'),
  s('svc-14', 'The Corner Pet Store', 'store', 'Chennai', 'Adyar', 4.3, 219, 'Daily 10am–9pm', 'Food, litter, accessories.'),
  s('svc-15', 'Salt Lake Pet Supplies', 'store', 'Kolkata', 'Salt Lake Sector V', 4.1, 97, 'Mon–Sat 10am–8pm', 'Food and basic supplies.'),
  s('svc-16', 'Hyderabad Animal Emergency', 'emergency', 'Hyderabad', 'Banjara Hills', 4.5, 118, 'Open 24 hours', 'Emergency and trauma.'),
  s('svc-17', 'Pune Veterinary Practice', 'vet', 'Pune', 'Baner', 4.4, 156, 'Mon–Sat 9am–7pm', 'Vaccination, deworming, wellness plans.'),
  s('svc-18', 'Adyar Grooming Studio', 'groomer', 'Chennai', 'Adyar', 4.5, 133, 'Tue–Sun 10am–7pm', 'Cat-friendly grooming.'),
];

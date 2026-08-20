/**
 * ── WHAT DOES YOUR PET NEED? ────────────────────────────────────────────────
 *
 * A quiz that ends in a scorecard rather than a product grid. Eight dimensions,
 * each scored out of 100 from answers the owner actually gave, each with the
 * one sentence that says what would move it.
 *
 * A SCORE IS NOT A DIAGNOSIS and the wording is careful about that. "Dental —
 * 40, nothing on file yet" is a prompt to book a check; it is not a claim that
 * the animal has dental disease, which no quiz can know.
 */

import type { Pet } from '../types';
import { readAge } from './nutrition';

export interface ScoreRow {
  key: string;
  label: string;
  score: number;
  note: string;
  action: string;
}

const clamp = (n: number) => Math.max(5, Math.min(100, Math.round(n)));

export function scorecard(pet: Pet, extras: { activityMinutes: number; groomedRecently: boolean; dentalRoutine: boolean; enrichment: boolean }): ScoreRow[] {
  const age = readAge(pet);
  const rows: ScoreRow[] = [];

  const dietKnown = pet.currentFood.trim().length > 0;
  rows.push({
    key: 'nutrition',
    label: 'Nutrition',
    score: clamp((dietKnown ? 55 : 25) + (pet.bodyCondition === 'ideal' ? 30 : 0) + (pet.weightKg ? 15 : 0)),
    note: pet.bodyCondition === 'ideal' ? 'Body condition is ideal and a diet is on file.' : 'Body condition is away from ideal.',
    action: pet.bodyCondition === 'ideal' ? 'Keep measuring portions rather than eyeballing them.' : 'A weight plan agreed with your vet is the single highest-value change here.',
  });

  const target = pet.species === 'dog' ? 60 : 30;
  rows.push({
    key: 'activity',
    label: 'Activity',
    score: clamp((extras.activityMinutes / target) * 100),
    note: `${extras.activityMinutes} minutes a day logged against a ${target}-minute guide for this species.`,
    action: extras.activityMinutes >= target ? 'Hold this — consistency beats intensity.' : 'Add one short session. Two twenty-minute walks beat one long one for most dogs.',
  });

  rows.push({
    key: 'grooming',
    label: 'Grooming',
    score: clamp(extras.groomedRecently ? 85 : 45),
    note: extras.groomedRecently ? 'Groomed recently.' : 'No recent grooming on file.',
    action: 'Coat type decides the interval — a double coat in an Indian summer needs more, not less.',
  });

  rows.push({
    key: 'dental',
    label: 'Dental',
    score: clamp(extras.dentalRoutine ? 80 : 35),
    note: extras.dentalRoutine ? 'A dental routine is in place.' : 'Nothing on file yet.',
    action: 'Dental disease is the most common and most missed condition in pets. A vet check tells you where you actually stand.',
  });

  rows.push({
    key: 'enrichment',
    label: 'Mental stimulation',
    score: clamp(extras.enrichment ? 80 : 40 + (pet.activity === 'high' ? 10 : 0)),
    note: extras.enrichment ? 'Puzzle or training work in the week.' : 'Little enrichment logged.',
    action: 'Ten minutes of nosework or a puzzle feeder tires most pets more than a longer walk.',
  });

  rows.push({
    key: 'environment',
    label: 'Environment',
    score: clamp(pet.housing === 'indoor' && pet.species === 'cat' ? 80 : pet.housing === 'both' ? 70 : 60),
    note: pet.species === 'cat' && pet.housing === 'indoor' ? 'Indoor cat — safest arrangement, needs vertical space and enrichment.' : 'Mixed indoor and outdoor time.',
    action: pet.species === 'cat' ? 'Cats need height, hiding places and one litter tray more than the number of cats.' : 'Shade and water matter more than space in Indian heat.',
  });

  rows.push({
    key: 'preventive',
    label: 'Preventive care',
    score: clamp((pet.sterilised ? 40 : 20) + (age.stage === 'senior' ? 20 : 30) + 20),
    note: 'Vaccination, deworming and parasite control drive this score.',
    action: 'Put the next vaccination and tick treatment in the wellness planner so they stop living in your head.',
  });

  rows.push({
    key: 'shopping',
    label: 'Supplies',
    score: clamp(dietKnown ? 70 : 40),
    note: dietKnown ? 'A current food is recorded.' : 'No current food recorded.',
    action: 'A replenishment schedule is the difference between planning and panic-buying.',
  });

  return rows;
}

export const scoreTone = (n: number): 'ok' | 'warn' | 'danger' => (n >= 70 ? 'ok' : n >= 45 ? 'warn' : 'danger');

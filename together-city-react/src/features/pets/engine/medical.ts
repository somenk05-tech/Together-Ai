/** An empty medical record, and the one place its shape is written down. */

import type { PetMedical } from '../types';

export const EMPTY_MEDICAL: PetMedical = {
  conditions: '', medications: '', vetName: '', vetPhone: '',
  microchipId: '', insurer: '', policyNumber: '', bloodGroup: '', notes: '',
};

/** Whether anything at all has been recorded — drives the empty state. */
export const hasMedical = (m: PetMedical) =>
  (Object.keys(m) as (keyof PetMedical)[]).some((k) => m[k].trim().length > 0);

export const MEDICAL_FIELDS: { key: keyof PetMedical; label: string; hint: string; wide?: boolean }[] = [
  { key: 'conditions', label: 'Ongoing conditions', hint: 'What your vet has diagnosed — not what an app guessed.', wide: true },
  { key: 'medications', label: 'Current medication', hint: 'Name, dose and how often.', wide: true },
  { key: 'vetName', label: 'Vet or clinic', hint: 'Who knows this animal.' },
  { key: 'vetPhone', label: 'Vet phone', hint: 'The number you would call first.' },
  { key: 'microchipId', label: 'Microchip number', hint: 'The number a shelter scans for.' },
  { key: 'bloodGroup', label: 'Blood group', hint: 'DEA 1.1 for dogs, A / B / AB for cats, if it has been typed.' },
  { key: 'insurer', label: 'Insurer', hint: 'If your pet is insured.' },
  { key: 'policyNumber', label: 'Policy number', hint: '' },
  { key: 'notes', label: 'Anything else', hint: 'Surgeries, reactions, things a locum would need to know.', wide: true },
];

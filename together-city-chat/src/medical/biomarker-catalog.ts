/**
 * Comprehensive manual-entry biomarker catalog. Drives the expanded blood-test
 * form: logical sections, reference ranges (adult, educational — not a lab's
 * exact assay range), units, and which hubs each marker personalises. The 9
 * "core" markers reuse the exact keys the clinical engine already analyses
 * (hb, ferritin, vitd, b12, folate, hba1c, ldl, trig, crp) so existing panels
 * and analysis keep working; the rest are stored for richer personalisation and
 * longitudinal trends. Values support up to 4 decimals (stored as Float).
 */
export interface BiomarkerDef {
  key: string; label: string; unit: string; min: number; max: number;
  hubs: string[]; optional?: boolean; higherBetter?: boolean;
}
export interface BiomarkerSection {
  key: string; label: string; hint?: string; markers: BiomarkerDef[];
}

export const BIOMARKER_SECTIONS: BiomarkerSection[] = [
  {
    key: 'sugar', label: 'Blood Sugar & Diabetes', hint: 'Nutrition · Weight loss · Fitness · Beauty (glycation)',
    markers: [
      { key: 'fbs', label: 'Fasting Blood Sugar (FBS)', unit: 'mg/dL', min: 70, max: 99, hubs: ['nutrition', 'fitness', 'beauty'] },
      { key: 'ppbs', label: 'Post-Prandial Blood Sugar (PPBS)', unit: 'mg/dL', min: 0, max: 140, hubs: ['nutrition', 'fitness'] },
      { key: 'hba1c', label: 'HbA1c', unit: '%', min: 4, max: 5.6, hubs: ['nutrition', 'fitness', 'beauty'] },
      { key: 'insulin', label: 'Fasting Insulin', unit: 'µIU/mL', min: 2.6, max: 24.9, hubs: ['nutrition', 'fitness'], optional: true },
      { key: 'homaIr', label: 'HOMA-IR', unit: '', min: 0, max: 2, hubs: ['nutrition', 'fitness'], optional: true },
    ],
  },
  {
    key: 'lipid', label: 'Lipid Profile', hint: 'Nutrition · Heart health · Weight loss',
    markers: [
      { key: 'totalChol', label: 'Total Cholesterol', unit: 'mg/dL', min: 0, max: 200, hubs: ['nutrition'] },
      { key: 'ldl', label: 'LDL Cholesterol', unit: 'mg/dL', min: 0, max: 130, hubs: ['nutrition'] },
      { key: 'hdl', label: 'HDL Cholesterol', unit: 'mg/dL', min: 40, max: 100, hubs: ['nutrition'], higherBetter: true },
      { key: 'trig', label: 'Triglycerides', unit: 'mg/dL', min: 0, max: 150, hubs: ['nutrition'] },
      { key: 'nonHdl', label: 'Non-HDL Cholesterol', unit: 'mg/dL', min: 0, max: 160, hubs: ['nutrition'] },
      { key: 'vldl', label: 'VLDL', unit: 'mg/dL', min: 2, max: 30, hubs: ['nutrition'], optional: true },
    ],
  },
  {
    key: 'iron', label: 'Iron & Blood Health', hint: 'Nutrition · Energy · Hair · Skin',
    markers: [
      { key: 'hb', label: 'Hemoglobin', unit: 'g/dL', min: 12, max: 17.5, hubs: ['nutrition', 'beauty', 'fitness'] },
      { key: 'ferritin', label: 'Ferritin', unit: 'ng/mL', min: 30, max: 300, hubs: ['nutrition', 'beauty'] },
      { key: 'serumIron', label: 'Serum Iron', unit: 'µg/dL', min: 60, max: 170, hubs: ['nutrition', 'beauty'] },
      { key: 'transferrinSat', label: 'Transferrin Saturation', unit: '%', min: 20, max: 50, hubs: ['nutrition'] },
      { key: 'tibc', label: 'TIBC', unit: 'µg/dL', min: 240, max: 450, hubs: ['nutrition'] },
      { key: 'uibc', label: 'UIBC', unit: 'µg/dL', min: 110, max: 370, hubs: ['nutrition'], optional: true },
      { key: 'folate', label: 'Folate', unit: 'ng/mL', min: 4, max: 20, hubs: ['nutrition', 'beauty'] },
      { key: 'b12', label: 'Vitamin B12', unit: 'pg/mL', min: 200, max: 900, hubs: ['nutrition', 'beauty'] },
    ],
  },
  {
    key: 'vitamins', label: 'Vitamin Status', hint: 'Nutrition · Hair · Skin · Immunity',
    markers: [
      { key: 'vitd', label: 'Vitamin D (25-OH)', unit: 'ng/mL', min: 20, max: 100, hubs: ['nutrition', 'beauty'], higherBetter: true },
      { key: 'magnesium', label: 'Magnesium', unit: 'mg/dL', min: 1.7, max: 2.2, hubs: ['nutrition', 'fitness'], optional: true },
      { key: 'zinc', label: 'Zinc', unit: 'µg/dL', min: 70, max: 120, hubs: ['nutrition', 'beauty'], optional: true },
    ],
  },
  {
    key: 'liver', label: 'Liver Function', hint: 'Nutrition · Fitness · Supplement planning',
    markers: [
      { key: 'alt', label: 'ALT (SGPT)', unit: 'U/L', min: 0, max: 40, hubs: ['nutrition', 'fitness'] },
      { key: 'ast', label: 'AST (SGOT)', unit: 'U/L', min: 0, max: 40, hubs: ['nutrition', 'fitness'] },
      { key: 'ggt', label: 'GGT', unit: 'U/L', min: 0, max: 55, hubs: ['nutrition'] },
      { key: 'alp', label: 'ALP', unit: 'U/L', min: 44, max: 147, hubs: ['nutrition'] },
      { key: 'bilirubin', label: 'Bilirubin (total)', unit: 'mg/dL', min: 0.1, max: 1.2, hubs: ['nutrition'] },
      { key: 'albumin', label: 'Albumin', unit: 'g/dL', min: 3.5, max: 5, hubs: ['nutrition', 'beauty'], higherBetter: true },
      { key: 'totalProtein', label: 'Total Protein', unit: 'g/dL', min: 6, max: 8.3, hubs: ['nutrition'] },
    ],
  },
  {
    key: 'kidney', label: 'Kidney Function', hint: 'Nutrition · Hydration · Fitness',
    markers: [
      { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', min: 0.6, max: 1.3, hubs: ['nutrition', 'fitness'] },
      { key: 'egfr', label: 'eGFR', unit: 'mL/min', min: 90, max: 200, hubs: ['nutrition'], higherBetter: true },
      { key: 'urea', label: 'Urea', unit: 'mg/dL', min: 15, max: 40, hubs: ['nutrition', 'fitness'] },
      { key: 'uricAcid', label: 'Uric Acid', unit: 'mg/dL', min: 3.5, max: 7.2, hubs: ['nutrition'] },
      { key: 'sodium', label: 'Sodium', unit: 'mmol/L', min: 135, max: 145, hubs: ['nutrition', 'fitness'] },
      { key: 'potassium', label: 'Potassium', unit: 'mmol/L', min: 3.5, max: 5.1, hubs: ['nutrition', 'fitness'] },
    ],
  },
  {
    key: 'inflammation', label: 'Inflammation', hint: 'Nutrition · Skin · Fitness',
    markers: [
      { key: 'crp', label: 'CRP', unit: 'mg/L', min: 0, max: 3, hubs: ['nutrition', 'beauty', 'fitness'] },
      { key: 'esr', label: 'ESR', unit: 'mm/hr', min: 0, max: 20, hubs: ['nutrition', 'beauty'], optional: true },
    ],
  },
  {
    key: 'thyroid', label: 'Thyroid', hint: 'Weight loss · Hair · Skin · Energy',
    markers: [
      { key: 'tsh', label: 'TSH', unit: 'µIU/mL', min: 0.4, max: 4, hubs: ['nutrition', 'beauty'] },
      { key: 'ft3', label: 'Free T3', unit: 'pg/mL', min: 2.3, max: 4.2, hubs: ['nutrition', 'beauty'] },
      { key: 'ft4', label: 'Free T4', unit: 'ng/dL', min: 0.8, max: 1.8, hubs: ['nutrition', 'beauty'] },
    ],
  },
];

/** Every valid biomarker key accepted by manual entry. */
export const BIOMARKER_KEYS: string[] = BIOMARKER_SECTIONS.flatMap((s) => s.markers.map((m) => m.key));

const BY_KEY = new Map<string, BiomarkerDef>(BIOMARKER_SECTIONS.flatMap((s) => s.markers.map((m) => [m.key, m] as const)));
export const biomarkerDef = (key: string): BiomarkerDef | undefined => BY_KEY.get(key);

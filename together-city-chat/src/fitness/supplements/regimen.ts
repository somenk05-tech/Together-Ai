import {
  nutrient, BIOTIN_INTERFERENCE,
  type NutrientFact, type MonitorClass,
} from './nutrients';
import { requirement, type Sex } from './exposure';
import type { Formulation } from './formulations';

/**
 * DOSE, DURATION, RETEST, AND WHEN TO STOP.
 *
 * The half of a supplement recommendation that almost nobody publishes. A
 * screen saying "take one tablet daily" has answered the easiest question and
 * left four harder ones alone: why that much, for how long, what would show
 * whether it worked, and what would mean stopping. This file answers those
 * four — and where the honest answer is that no interval has ever been
 * established, it says so instead of inventing one.
 *
 * ── THE FINDING THAT SHAPES THIS FILE ─────────────────────────────────────
 *
 * "Retest everything after three months" is the most-quoted interval in
 * consumer health and it has almost no guideline behind it. The Endocrine
 * Society's 2024 guideline recommends AGAINST routine follow-up 25(OH)D
 * testing. The British Society for Haematology says that once B12 treatment
 * has started, "no further testing for cobalamin levels is required". NICE's
 * 2024 B12 guideline found ZERO clinical studies comparing follow-up
 * frequencies and set its three-month interval by committee consensus, for
 * reviewing SYMPTOMS rather than for re-measuring anything. The only
 * three-month interval in this file with a real basis is vitamin D's, and it
 * is physiological — four half-lives of 25(OH)D — rather than institutional.
 * In obesity even that is wrong, because the half-life stretches to between 39
 * and 98 days, so a twelve-week retest reads low and invites a dose increase
 * nobody needed.
 *
 * A retest is therefore offered only where three things hold at once: the
 * marker reflects stores, it moves on a known timescale, and the result would
 * change a decision. Three clear that bar — 25(OH)D, ferritin with
 * haemoglobin, and red-cell folate. Zinc, magnesium, copper, selenium and
 * iodine do not, and for several of them the correct behaviour is to REFUSE
 * the test rather than sell it. Serum zinc rises on supplementation whether or
 * not the person was deficient. B12 on treatment measures the tablet. Urinary
 * iodine measures yesterday's salt. A test that cannot come back "no" is not a
 * test.
 *
 * ── AND THE INTERLOCK ─────────────────────────────────────────────────────
 *
 * Biotin at 5 mg corrupts the immunoassays for 25(OH)D, B12, folate and
 * ferritin — the four markers this entire system retests. Sandwich assays read
 * low and competitive assays read high, so a single draw can make B12 look
 * high and ferritin look low at once, and a hair supplement carries five to
 * ten milligrams as a matter of routine. `biotinInterlock()` is not a warning
 * for the bottom of a page. It is a precondition on booking the test.
 */

/* ── WHAT KIND OF DOSE IS THIS ─────────────────────────────────────────────*/

export type DoseBand =
  | 'token'                  // present so it can be counted on the front of the pack
  | 'nutritional'            // a sensible fraction of, or equal to, the requirement
  | 'above-indian-ceiling'   // over one RDA: lawful as a medicine, not as a food here
  | 'above-upper-limit'      // over a ceiling that covers what we can see
  | 'unknown';               // no Indian requirement published, so no band to assign

export interface BandedDose {
  band: DoseBand;
  pctOfRequirement: number | null;
  text: string;
}

/**
 * CLASSIFY A DOSE — and note what this does not do. It does not produce one.
 * Nothing in this hub produces a dose: a number a citizen swallows is either a
 * string copied from a reviewed source or it belongs to a clinician. An engine
 * that can divide a lab value by a threshold is exactly the kind of engine
 * that starts writing prescriptions by arithmetic.
 */
export const bandDose = (n: NutrientFact, amount: number, sex?: Sex): BandedDose => {
  const { ref, origin } = requirement(n, sex);
  if (!ref || origin !== 'india') {
    return {
      band: 'unknown', pctOfRequirement: null,
      text: `India publishes no requirement for ${n.name}, so there is no Indian figure to call this dose a fraction of. ${n.indiaSilentBecause ?? ''}`.trim(),
    };
  }
  const pct = Math.round((amount / ref.value) * 1000) / 10;
  const supplementScoped = n.ul && ['supplemental', 'supplemental-niacin', 'supplemental-alpha-tocopherol', 'synthetic-folic-acid'].includes(n.ul.scope);

  if (supplementScoped && amount > n.ul!.value) {
    return {
      band: 'above-upper-limit', pctOfRequirement: pct,
      text: `${pct}% of the Indian requirement, and above the ${n.ul!.value} ${n.ul!.unit} upper limit for exactly the part of intake that limit covers.`,
    };
  }
  if (pct > 100) {
    return {
      band: 'above-indian-ceiling', pctOfRequirement: pct,
      text: `${pct}% of the Indian requirement. Indian food law caps a health supplement at one requirement, so a dose above it is lawful as a medicine and not as a food.`,
    };
  }
  if (pct < 30) {
    return {
      band: 'token', pctOfRequirement: pct,
      text: `${pct}% of the Indian requirement — enough to print the nutrient's name on the front of the pack, not enough to close a gap.`,
    };
  }
  return { band: 'nutritional', pctOfRequirement: pct, text: `${pct}% of the Indian requirement — a nutritional amount.` };
};

/* ── THE MONITORING PLAN ───────────────────────────────────────────────────*/

export interface AfterRetest { outcome: string; then: string }

export interface Regimen {
  nutrientId: string;
  name: string;
  baselineTest: string | null;
  alongside?: string;
  markerLimitation: string;
  monitor: MonitorClass;
  /** How long before the question can be answered at all. null where there is
   *  no biomarker endpoint — and then `insteadWatch` carries the answer. */
  initialWeeks: [number, number] | null;
  /** The physiology or the guideline that sets the interval. Never a habit. */
  initialWhy: string;
  retestSource: string;
  insteadWatch?: string;
  afterRetest: AfterRetest[];
  stopRules: string[];
}

/**
 * WHAT HAPPENS AFTER THE RETEST — the step that turns a number back into a
 * decision. Written only for the nutrients that have a real retest; for the
 * rest the honest content is the stop rules and what to watch instead.
 */
const AFTER: Record<string, AfterRetest[]> = {
  'vitamin-d': [
    { outcome: 'Adequate — at or above the target your clinician set', then: 'Step down from any loading course to a maintenance dose. Correcting the deficiency was the goal; preventing disease in somebody already replete is the thing the trials could not show.' },
    { outcome: 'Risen, but still short', then: 'Adherence first. If you are heavier, steady state may simply not have arrived — half-lives run from 39 to 98 days in obesity, so the retest can read low on a dose that is working. Consider malabsorption before considering more.' },
    { outcome: 'Barely moved, on a dose you did take', then: 'Investigate rather than escalate: coeliac disease, inflammatory bowel disease, bariatric surgery, pancreatic insufficiency, or anticonvulsants, glucocorticoids and antiretrovirals. A doctor\'s question.' },
    { outcome: 'High — and especially alongside a raised calcium', then: 'Stop, and see a doctor. A loading course can unmask a primary hyperparathyroidism that was there all along, which is why an adjusted calcium a month after loading is part of the protocol rather than an afterthought.' },
  ],
  iron: [
    { outcome: 'Haemoglobin up by 10 g/L or more at two weeks', then: 'That response is itself strong evidence the deficiency really was iron. Continue.' },
    { outcome: 'Haemoglobin normal by about eight weeks', then: 'Not finished. Continue roughly three months more to refill stores — absorption caps near 10 to 25 mg a day even at full deficiency drive, so a gram of stores takes months, and the three-month rule is that arithmetic rather than a convention. Confirm ferritin above 50 before stopping.' },
    { outcome: 'Rising slowly', then: 'Adherence first, because gastrointestinal side effects are the dominant reason people stop. Then continuing blood loss, and tea, coffee, calcium or acid suppression taken alongside the dose.' },
    { outcome: 'Not responding', then: 'This leaves the app. The British Society of Gastroenterology says an inadequate response or a recurrence warrants investigation of the small bowel and the renal tract. Also consider thalassaemia trait, coeliac disease, and inflammation blocking absorption outright.' },
    { outcome: 'Ferritin above the overload thresholds, or transferrin saturation over 45%', then: 'Stop, and ask about haemochromatosis screening.' },
  ],
  folate: [
    { outcome: 'Red-cell folate above the protective threshold', then: 'For a preconception indication, that is the goal met.' },
    { outcome: 'Not there yet at eight weeks', then: 'Expected as often as not. The red cell takes up folate only as it is made, and the population turns over across about four months — so this is a reason to wait rather than to escalate.' },
    { outcome: 'Not responding', then: 'Exclude a concurrent B12 deficiency, which is mandatory, then coeliac disease, alcohol, and methotrexate, anticonvulsants, sulfasalazine or trimethoprim.' },
  ],
};

const STOPS: Record<string, string[]> = {
  'vitamin-d': [
    'Any hypercalcaemia, on any dose. Stop and investigate.',
    'A loading course is a course. Weekly 60,000 IU runs 8 to 12 weeks and is then followed by a maintenance dose — it is not a thing to continue indefinitely, and indefinitely is where the cumulative toxicity accrues.',
    'Do not self-manage a loading regimen at all in sarcoidosis, tuberculosis or other granulomatous disease, in primary hyperparathyroidism, with an eGFR below 30, or with a history of kidney stones or hypercalciuria.',
  ],
  iron: [
    'The ferritin target reached and the cause addressed.',
    'Never start on a haemoglobin alone. Iron deficiency explains under a third of Indian anaemia, and iron given to the other two thirds causes constipation while the diagnosis goes on being missed.',
    'Iron deficiency in an adult man or a post-menopausal woman is a gastrointestinal investigation, not a supplement.',
    'Keep it away from children. Acute iron overdose is a leading cause of paediatric poisoning death.',
  ],
  'vitamin-b12': [
    'Never correct folate before B12 in a macrocytic anaemia — folate can precipitate or worsen degeneration of the cord.',
    'Where the cause is irreversible, such as pernicious anaemia or an ileal resection, treatment is lifelong. Where it was dietary and the diet has changed, it can stop.',
    'Any neurological symptom is time-critical: residual disability becomes likely once treatment is delayed past about six months.',
  ],
  folate: [
    'Exclude B12 deficiency before giving folate for a macrocytic anaemia. This one is absolute.',
    'Folic acid at a milligram or more masks B12 deficiency, which is the reason the ceiling sits where it does.',
    'A preconception course can stop after the first trimester unless there is another indication.',
  ],
  zinc: [
    'Above 40 mg a day long-term, copper becomes the thing to worry about — and copper-deficiency myelopathy is often irreversible.',
    'Taste disturbance, nausea, or a falling HDL.',
  ],
  magnesium: [
    'Diarrhoea is the dose-limiting effect and the signal to reduce.',
    'Reduced kidney function changes everything here. Hypermagnesaemia is real and dangerous, and this becomes a doctor\'s decision rather than a shelf\'s.',
  ],
  calcium: [
    'Any hypercalcaemia.',
    'The ceiling exists because of kidney stones. Anybody who has had one should be talking to a doctor before adding calcium.',
  ],
  selenium: ['One of the narrowest windows of any micronutrient. Watch the arithmetic rather than a blood test, and stop at hair loss, brittle nails or a garlic odour on the breath.'],
  iodine: ['Any known or suspected thyroid disease makes this a medical decision — iodine precipitates both hypothyroidism and hyperthyroidism, by opposite mechanisms.'],
  'vitamin-a': ['Anybody who might become pregnant should keep preformed retinol under the ceiling, which is set on teratogenicity and not on anything milder.'],
  'beta-carotene': ['If you smoke, stop taking it. Two randomised trials were halted early for excess lung cancer and excess death from it.'],
  'vitamin-e': ['There is no reason to take a standalone vitamin E, and a haemorrhagic-stroke and all-cause-mortality signal not to.'],
  'vitamin-b6': ['New numbness or tingling on a high-dose B-complex. That is the presenting symptom of the neuropathy the ceiling exists to prevent — and it is also, uncomfortably, what several of those products are sold to treat.'],
  potassium: ['Not a supplement to take unsupervised with any kidney impairment, or on an ACE inhibitor, an ARB or a potassium-sparing diuretic. Hyperkalaemia arrives without a warning symptom.'],
};

export const regimenFor = (nutrientId: string): Regimen => {
  const n = nutrient(nutrientId);
  const m = n.marker;
  return {
    nutrientId: n.id,
    name: n.name,
    baselineTest: m.baseline,
    alongside: m.alongside,
    markerLimitation: m.limitation,
    monitor: m.monitor,
    initialWeeks: m.retestWeeks,
    initialWhy: m.why ?? (m.retestWeeks ? 'Set by the guideline named beside it.' : 'No interval, because no retest here is worth paying for.'),
    retestSource: m.retestSource,
    insteadWatch: m.insteadWatch,
    afterRetest: AFTER[n.id] ?? [],
    stopRules: STOPS[n.id] ?? [],
  };
};

/* ── THE BIOTIN INTERLOCK ──────────────────────────────────────────────────*/

export interface Interlock {
  blocked: boolean;
  biotinMcgPerDay: number;
  from: string[];
  text: string;
  source: string;
}

/**
 * BEFORE ANY BLOOD TEST IS BOOKED. Runs over everything the citizen is
 * actually taking and asks one question: is there enough biotin in it to make
 * the result meaningless? A hair supplement at 10,000 mcg will make a B12
 * result look high and a ferritin result look low in the same draw, and
 * neither of them will look wrong.
 */
export const biotinInterlock = (taking: Formulation[]): Interlock => {
  let total = 0;
  const from: string[] = [];
  for (const f of taking) {
    for (const row of f.nutrients) {
      if (row.nutrient !== 'biotin' || row.suspect) continue;
      const mcg = row.unit === 'mg' ? row.amount * 1000 : row.amount;
      const perDay = mcg * f.servingsPerDay;
      total += perDay;
      if (perDay > 0) from.push(`${f.brand} ${f.productName} (${perDay} mcg)`);
    }
  }
  const blocked = total >= BIOTIN_INTERFERENCE.mcgPerDay;
  return {
    blocked,
    biotinMcgPerDay: Math.round(total * 10) / 10,
    from,
    source: BIOTIN_INTERFERENCE.source,
    text: blocked
      ? `You are taking about ${Math.round(total)} mcg of biotin a day, at or above the ${BIOTIN_INTERFERENCE.mcgPerDay} mcg where it starts corrupting laboratory assays — and the assays it corrupts are ${BIOTIN_INTERFERENCE.affects.slice(0, 4).join(', ')}, which are the exact tests this plan would retest. Sandwich assays read falsely low and competitive assays falsely high, so one draw can make B12 look high and ferritin look low at the same time, and neither result will look wrong. Stop the biotin for at least ${BIOTIN_INTERFERENCE.washoutHours} hours before the test — ${BIOTIN_INTERFERENCE.highDoseWashoutHours} hours if the dose is 100 mg or more — or the money spent on the test is wasted.`
      : total > 0
        ? `About ${Math.round(total)} mcg of biotin a day, which is below the ${BIOTIN_INTERFERENCE.mcgPerDay} mcg at which it starts interfering with blood tests. Worth knowing if a hair or nail supplement is ever added on top.`
        : 'No biotin declared in what you are taking, so nothing here is going to corrupt a blood test.',
  };
};

/* ── TRIALS WITHOUT A BLOOD TEST ───────────────────────────────────────────*/

/**
 * HOW LONG BEFORE "IT DIDN'T WORK" IS A CONCLUSION RATHER THAN AN IMPATIENCE.
 *
 * These are the intervals for the outcomes people actually buy supplements
 * for, and the general principle underneath them is physical: the minimum
 * honest trial is set by the turnover time of the tissue or the frequency of
 * the event being counted. Twenty-eight days for epidermis. About a hundred
 * and twenty for a red cell and for the hair cycle. A whole season for an
 * infection count. Any product promising a thirty-day verdict on hair or
 * immunity is promising something the biology cannot deliver.
 */
export const TRIAL_LENGTH: Array<{ outcome: string; weeks: [number, number]; note: string; source: string }> = [
  {
    outcome: 'Sleep', weeks: [4, 8],
    note: 'Magnesium trials ran from 20 days to 8 weeks. Pooled: sleep onset 17 minutes shorter than placebo, total sleep time not significantly changed. GRADE certainty low to very low across 151 participants in total.',
    source: 'Mah & Pitre, BMC Complement Med Ther 2021',
  },
  {
    outcome: 'Fatigue, where ferritin is low but there is no anaemia', weeks: [6, 12],
    note: 'Significant by six weeks and continuing to twelve. Fatigue fell 47.7% against 28.8% on placebo while haemoglobin moved only 0.32 g/dL — so whatever the benefit is, it is not anaemia correction.',
    source: 'Vaucher et al., CMAJ 2012',
  },
  {
    outcome: 'Fatigue, on B12', weeks: [1, 12],
    note: 'Improvement begins within a week and is typically complete between six weeks and three months. No improvement by three months is a reason to reconsider the diagnosis, not to raise the dose.',
    source: 'Carmel, Blood 2008; NICE NG239',
  },
  {
    outcome: 'Fatigue, on vitamin D', weeks: [4, 8],
    note: 'A weak evidence base with inconsistent results, and what effect there is sits almost entirely in people who started low. Nobody should be promised energy from vitamin D while already replete.',
    source: 'RCT and narrative review evidence, 2016–2024',
  },
  {
    outcome: 'Hair', weeks: [26, 26],
    note: 'Six months minimum, and three is too short to call failure. The hair cycle sets it: shedding follows its trigger by two to three months, telogen effluvium runs three to six, and regrowth becomes visible across a further three to six. One trial\'s density gain roughly doubled between day 90 and day 180, with the anagen-to-telogen ratio only normalising at six months.',
    source: 'Dermatol Ther 2025 RCT; standard telogen effluvium course',
  },
  {
    outcome: 'Skin', weeks: [8, 12],
    note: 'Epidermal turnover of about 28 days and dermal remodelling set the floor. Oral collagen trials run 2 to 12 weeks and cluster at 8 and 12.',
    source: 'Nutrients 2023 meta-analysis',
  },
  {
    outcome: 'Immunity', weeks: [17, 26],
    note: 'A whole cold season, and an individual cannot evaluate this over weeks at all, because the endpoint is a count of episodes. Cochrane found regular vitamin C had no effect on cold incidence across 29 comparisons and 11,306 participants; duration fell 8% in adults.',
    source: 'Hemilä & Chalker, Cochrane CD000980',
  },
];

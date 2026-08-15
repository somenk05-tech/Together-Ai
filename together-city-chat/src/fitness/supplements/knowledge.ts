/**
 * THE SUPPLEMENT KNOWLEDGE BASE — INDIA EDITION.
 *
 * Every dose, upper limit and interaction in this file was READ OFF A CITED
 * EVIDENCE REVIEW (the owner's "Supplements, Honestly", August 2026: 19
 * supplements, 40+ meta-analyses, RCTs and national surveys). Nothing here is
 * computed, inferred, or written from a model's memory of nutrition, and that
 * is the single most important property of this file.
 *
 * THE HARD RULE THIS FILE EXISTS TO ENFORCE. Mira may EXPLAIN a dose that is
 * in here. She may not produce one that is not — not by arithmetic on a lab
 * value, not by scaling for body weight, not by reasoning from a mechanism.
 * Dietary supplements are not pre-approved for safety or efficacy the way
 * drugs are, they interact with real medicines, and a plausible number in a
 * confident sentence is indistinguishable from a correct one to the person
 * reading it. Every recommendation the engine ever shows resolves to a row
 * below, or it is not shown.
 *
 * WHERE THE LINE IS. Three of these require a blood test BEFORE the first
 * dose rather than after — iron, vitamin D at repletion doses, and B12 where
 * there are neurological symptoms — and this file marks them. A therapeutic
 * dose for a documented deficiency is a clinical decision, so the engine's
 * answer there is "your result and this range, take it to your doctor",
 * never a number of its own.
 *
 * Generated from the review, then read. Update it by updating the review.
 */

export type Grade = 'strong' | 'moderate' | 'emerging' | 'null-or-harm';

export interface SupplementFact {
  id: string;
  name: string;
  /** What the evidence supports it FOR — the grade is never unqualified. */
  grade: Grade;
  gradeFor: string;
  /** The form worth paying for, in the review's words. */
  form: string;
  /** A RANGE from the review. Never a computed personal number. */
  typicalDose: string;
  /** The tolerable upper limit, where one is set. */
  upperLimit: string;
  /** Drugs and conditions that change the answer. The engine reads this. */
  interactions: string;
  /** True when a blood test belongs BEFORE the first dose, not after. */
  testFirst?: boolean;
  /** Why the review says what it says — mechanism, trials, cautions. */
  detail?: { headline: string; sections: Array<{ q: string; a: string }>; notes: string[] };
}

export const SUPPLEMENTS: SupplementFact[] = [
  {
    id: "vitamin-d3",
    name: "Vitamin D3",
    grade: "strong",
    gradeFor: "Deficiency",
    form: "Cholecalciferol, with fat",
    typicalDose: "1,000–2,000 IU/d",
    upperLimit: "4,000 IU/d",
    interactions: "Thiazides (hypercalcaemia), orlistat, corticosteroids",
    testFirst: true,
    detail: {
      headline: "The one where the Indian case is strong and the global case is weak",
      sections: [
        { q: "Mechanism", a: "Liver 25-hydroxylase converts it to 25(OH)D — the storage form your blood test measures. The kidney's 1α-hydroxylase then makes calcitriol, a genuine steroid hormone acting on the nuclear vitamin D receptor to drive intestinal calcium absorption and bone mineralisation. It is a hormone, not a vitamin, in everything but name." },
        { q: "The evidence", a: "Correcting documented deficiency: settled. Preventing disease in people who are already replete: it failed. VITAL (n=25,871, 2,000 IU/day, 5.3 years) found no reduction in major cardiovascular events and none in invasive cancer. The VITAL fracture ancillary (NEJM 2022, 1,991 fractures) found no reduction in total, non-vertebral or hip fractures — with no effect modification by baseline 25(OH)D. Jolliffe's 2024 update (46 RCTs, 64,086 people) put respiratory-infection prevention at OR 0.94, p=0.057 — not significant." },
        { q: "Dose & form", a: "D3, not D2 — it raises and holds 25(OH)D better. Daily 1,000–2,000 IU is the sane maintenance range; the tolerable upper limit is 4,000 IU/day. India's characteristic 60,000 IU weekly sachet is a repletion protocol for a documented deficiency, typically 6–8 weeks, then stop and re-test. Take with a fatty meal." },
        { q: "Cautions", a: "Thiazide diuretics plus vitamin D raises hypercalcaemia risk. Orlistat cuts absorption; corticosteroids increase catabolism. Toxicity is real above ~150 ng/mL — hypercalcaemia, arrhythmia, renal injury. Don't self-prescribe 60K weekly indefinitely." },
      ],
      notes: ["On the \"+K2\" upsell: mechanistically lovely — vitamin K carboxylates osteocalcin and matrix Gla protein, which inhibits vascular calcification. Clinically it wobbles. Knapen 2013 (180 mcg MK-7, 3 years, healthy postmenopausal women) slowed bone loss at spine and femoral neck. Rønn 2020 — the larger dose, 375 mcg, 3 years, in women who actually had osteopenia — was flatly null at every site (all p>0.09) despite successfully carboxylating osteocalcin. A biomarker moving is not an outcome moving. And K2 antagonises warfarin: that interaction is hard, not soft. Grade: Emerging. Don't pay a premium for it."],
    },
  },
  {
    id: "vitamin-b12",
    name: "Vitamin B12",
    grade: "strong",
    gradeFor: "Deficiency correction",
    form: "Any form — cyanocobalamin is fine",
    typicalDose: "500–1,000 mcg/d oral",
    upperLimit: "None set",
    interactions: "Metformin, PPIs, H2 blockers deplete it",
    testFirst: true,
    detail: {
      headline: "The single most India-specific entry on this list",
      sections: [
        { q: "Mechanism", a: "Cofactor for exactly two human enzymes: methionine synthase, which remethylates homocysteine and feeds every methylation reaction in your body; and methylmalonyl-CoA mutase. That's why raised homocysteine and methylmalonic acid are the functional deficiency markers — serum B12 alone is a blunt test." },
        { q: "The evidence", a: "Deficiency correction is not in dispute. What makes it urgent here: B12 exists naturally only in animal foods, 39% of Indians are vegetarian and 81% limit meat, and pooled Indian deficiency runs at 53%. Yajnik's Pune Maternal Nutrition Study adds the sharpest argument — maternal B12 deficiency with adequate folate predicted greater adiposity and insulin resistance in the offspring, tying B12 directly to India's thin-fat phenotype and its 101 million people with diabetes." },
        { q: "Dose & form", a: "RDA is only 2.2 mcg (ICMR) but absorption is brutally dose-dependent: ~50% at 1–2 mcg, just 1.3% at 1,000 mcg. That 1% passive diffusion is precisely why high oral doses work even in malabsorption. A 2018 Cochrane review found oral 1,000–2,000 mcg normalised B12 comparably to intramuscular injection. Vegetarians: 500–1,000 mcg daily, or 2,000 mcg weekly." },
        { q: "Cautions", a: "Metformin depletes B12 — if you're on it long-term, screen. PPIs and H2 blockers impair release of food-bound B12. And never give folate without checking B12: folate fixes the anaemia while the neurological damage quietly continues." },
      ],
      notes: ["Don't pay extra for \"methylcobalamin\". NIH ODS states it flatly: \"No evidence indicates that absorption rates of vitamin B12 in supplements vary by form of the vitamin.\" Cyanocobalamin converts fine intracellularly and costs a fraction. The narrow real cases for methyl- or hydroxocobalamin are smokers and renal impairment. MTHFR variants are a folate issue, not a B12-form issue — that pairing is marketing."],
    },
  },
  {
    id: "omega-3",
    name: "Omega-3",
    grade: "moderate",
    gradeFor: "Triglycerides",
    form: "By EPA+DHA content; algal if vegan",
    typicalDose: "250–500 mg EPA+DHA/d",
    upperLimit: "FDA: ≤5 g/d",
    interactions: "Antiplatelets; AF risk rises above 1 g/d",
    detail: {
      headline: "Real intake gap, oversold benefits, and a genuine harm signal",
      sections: [
        { q: "Mechanism", a: "EPA and DHA are structural phospholipids concentrated in brain and retinal membranes, and substrates for eicosanoid signalling across cardiovascular, immune and endocrine systems. Plant ALA converts to EPA/DHA at a famously poor rate — which is the whole problem for Indian vegetarian diets." },
        { q: "The evidence", a: "Triglyceride lowering is the reliable effect — dose-dependent, roughly −5.9 mg/dL per additional gram per day. Beyond that it gets messy. REDUCE-IT (prescription icosapent ethyl, 4 g/day pure EPA) cut cardiovascular events 25% in high-risk patients with high triglycerides. STRENGTH, at the same 4 g/day of a different preparation, found no benefit and more atrial fibrillation. VITAL's 1 g/day arm missed its primary composite endpoint. Over-the-counter 1 g fish oil for primary prevention in a healthy person: weak to null." },
        { q: "Dose & form", a: "Judge by EPA+DHA content, never by \"1000 mg fish oil\" — a standard Indian 1,000 mg capsule usually delivers only 180 mg EPA + 120 mg DHA, so hitting 250–500 mg takes two capsules. Vegetarians should use algal oil. FDA considers ≤5 g/day EPA+DHA safe as used." },
        { q: "Cautions", a: "Antiplatelet effect at high doses; GI upset and fishy eructation; stop before surgery." },
      ],
      notes: ["The Indian gap is nevertheless large and genuine: even the highest omega-3 consumers here average ~50 mg/day EPA+DHA, and pregnant Indian women around 20 mg, against a 250–500 mg target — a 5–25× shortfall. But note what I'm not saying: the 30:1 or 40:1 \"Indian omega-6 to omega-3 ratio\" quoted throughout Indian supplement marketing has no traceable primary source. I couldn't find one. Treat it as advertising."],
    },
  },
  {
    id: "creatine",
    name: "Creatine",
    grade: "strong",
    gradeFor: "Strength & muscle",
    form: "Monohydrate, micronised",
    typicalDose: "3–5 g/d",
    upperLimit: "None; 30 g/d × 5 y safe",
    interactions: "Confounds creatinine-based eGFR — use cystatin C",
    detail: {
      headline: "The best-evidenced sports supplement that exists — and vegetarians start lower",
      sections: [
        { q: "Mechanism", a: "Loads the phosphocreatine pool inside muscle, letting creatine kinase regenerate ATP faster during and between maximal efforts. Secondary effects on glucose uptake, calcium reuptake and mTOR-mediated protein synthesis signalling, plus reduced protein breakdown." },
        { q: "The evidence", a: "The ISSN position stand calls creatine monohydrate \"the most effective ergogenic nutritional supplement currently available to athletes.\" Meta-analysis of creatine plus resistance training in older adults: +1.32 kg lean tissue mass versus placebo, chest press SMD 0.28, leg press SMD 0.20. It works in the population that needs it most." },
        { q: "Dose & form", a: "Monohydrate. The debate is over. Citrate, ethyl ester, buffered and nitrate forms show no absorption advantage — buy the cheapest verified monohydrate. 3–5 g daily, no loading needed (3 g/day for 28 days reaches the same saturation). Timing is irrelevant." },
        { q: "Cautions", a: "1–2 kg of intracellular water weight early on. Split large single doses to avoid GI upset." },
      ],
      notes: ["The kidney myth, put down properly. A November 2025 BMC Nephrology systematic review — 21 studies, meta-analysis of 12 (440 participants) — found serum creatinine rose by 0.07 µmol/L (p=0.03) with no significant difference in GFR, concluding the rise reflects metabolic turnover rather than renal impairment. The practical catch worth knowing: creatine users can show a mildly elevated serum creatinine and a falsely low creatinine-based eGFR. If your renal function genuinely needs assessing, ask for cystatin C.", "Relevant to India: creatine comes from meat. Vegetarians have lower baseline muscle creatine stores, so they tend to show larger responses to supplementation than omnivores. But — don't buy it for your brain. A 2024 systematic review concluded creatine research \"fails to support the theoretical basis for an effect on cognition\" in rested healthy adults."],
    },
  },
  {
    id: "psyllium",
    name: "Psyllium",
    grade: "strong",
    gradeFor: "LDL lowering",
    form: "Plain husk powder",
    typicalDose: "~10 g/d with water",
    upperLimit: "—",
    interactions: "Separate all medicines by ≥2 h; needs fluid",
    detail: {
      headline: "The best evidence-to-cost ratio on this entire page, and it's sitting in your kitchen",
      sections: [
        { q: "Mechanism", a: "Plantago ovata husk forms a viscous gel that binds bile acids and increases their faecal excretion. Your liver must then convert more cholesterol into bile acids and upregulate LDL receptors to keep up — which is where the lipid drop comes from. Separately, the same gel normalises stool form in both directions: bulking in diarrhoea, softening in constipation." },
        { q: "The evidence", a: "Jovanovski et al., AJCN 2018 — 28 RCTs, 1,924 participants, median ~10.2 g/day: LDL −0.33 mmol/L (≈ −13 mg/dL), non-HDL −0.39 mmol/L, and apolipoprotein B −0.05 g/L at HIGH GRADE certainty. High-certainty evidence for the atherogenic particle-count marker is genuinely rare in supplement science — most of this page can't claim it. Against 81% dyslipidaemia prevalence in Indian adults, that matters." },
        { q: "Dose & form", a: "~10 g/day of plain husk powder (1–2 teaspoons), with a full glass of water, split before meals. Titrate up over 1–2 weeks or you'll bloat. FDA health claim threshold is 7 g/day soluble fibre from psyllium." },
        { q: "Cautions", a: "Must be taken with adequate fluid — oesophageal and bowel obstruction have occurred without it. Contraindicated in dysphagia or known GI stricture. Separate from all medications by at least 2 hours. May reduce insulin requirements, which needs monitoring rather than avoidance." },
      ],
      notes: ["This is not a supplement so much as a food, it costs about ₹2 a day, and it is better evidenced for lipids than any branded \"heart health\" capsule on the Indian market. If you take one thing from this page and you're over 35 with an Indian lipid panel, make it this."],
    },
  },
  {
    id: "protein",
    name: "Protein",
    grade: "strong",
    gradeFor: "As food",
    form: "Certified whey or blended plant",
    typicalDose: "to ~1.6 g/kg/d total",
    upperLimit: "—",
    interactions: "ICMR cautions in existing renal disease",
    detail: {
      headline: "It's food, not medicine — and in India it's the category with the worst quality record",
      sections: [
        { q: "Mechanism", a: "Dietary protein supplies essential amino acids; leucine is the principal trigger of mTORC1-mediated muscle protein synthesis. Whey is rapidly digested and leucine-dense. Nothing exotic is happening — this is a convenient food." },
        { q: "The evidence", a: "Morton et al., BJSM 2018 — 49 studies, 1,863 participants: supplementation during resistance training added +0.30 kg fat-free mass and +2.49 kg 1RM strength. The number that saves you money is the breakpoint: beyond 1.62 g/kg/day total protein, more produced no further gains. If your diet already gets you there, powder adds nothing. Worth knowing alongside it: ICMR-NIN notes that cereal-based, lower-quality-protein diets need closer to 1 g/kg/day to deliver the same amino acids — which is the real Indian protein argument." },
        { q: "Whey vs plant", a: "The gap closes with dose. Van der Heijden et al., MSSE 2024 — 32 g whey (3.2 g leucine) versus a pea/rice/canola blend (2.5 g leucine) — found statistically indistinguishable myofibrillar protein synthesis at every timepoint (0–4 h, p=0.80). A well-formulated blend at an adequate dose is a legitimate equal. Single-source plant isolates at low doses are the weak option." },
        { q: "Cautions", a: "Whey concentrate carries lactose. ICMR-NIN's 2024 guidelines warn that prolonged protein supplementation may strain glomerular filtration and increase calcium loss — worth taking seriously if you already have kidney disease, less so if you don't." },
      ],
      notes: [],
    },
  },
  {
    id: "magnesium",
    name: "Magnesium",
    grade: "moderate",
    gradeFor: "Blood pressure",
    form: "Citrate (absorption) or glycinate (tolerance)",
    typicalDose: "200–400 mg elemental/d",
    upperLimit: "350 mg supplemental",
    interactions: "Bisphosphonates, tetracyclines, quinolones — space 2–6 h",
    detail: {
      headline: "Modest, real effects — and the form you've been told to buy isn't the best-absorbed one",
      sections: [
        { q: "Mechanism", a: "Cofactor in over 300 enzyme systems; Mg-ATP is the biologically active form of ATP itself. Also a physiological NMDA-receptor channel blocker and a GABAergic modulator — which is the mechanistic basis for the sleep and anxiety claims, though the clinical data behind them stays thin." },
        { q: "The evidence", a: "Blood pressure: Zhang et al., Hypertension 2016 — 34 double-blind RCTs, 2,028 participants, median 368 mg/day — found SBP −2.00 mmHg and DBP −1.78 mmHg. Consistent, causal-looking, and small. Migraine prophylaxis: the American Academy of Neurology rates magnesium \"probably effective\" — but preventive dosing is 300 mg twice daily, which exceeds the supplemental upper limit and needs supervision. Type 2 diabetes: NIH ODS finds insufficient evidence that supplementation improves glycaemic control." },
        { q: "Dose & form", a: "200–400 mg elemental. Note the trap: the 350 mg upper limit applies to supplemental magnesium only, not food magnesium — clinicians get this wrong routinely." },
        { q: "Cautions", a: "Chelates bisphosphonates, tetracyclines and quinolones — separate by 2–6 hours. Loop and thiazide diuretics waste magnesium; PPIs beyond a year can cause genuine hypomagnesaemia. Accumulates in renal impairment. Diarrhoea is the dose-limiting effect." },
      ],
      notes: ["Glycinate's absorption premium is not real. The one good randomised double-blind head-to-head — Walker et al., Magnesium Research 2003, 300 mg/day for 60 days — found citrate produced the highest plasma magnesium both acutely (p=0.026) and at 60 days (p=0.006), with the amino-acid chelate not superior, and oxide performing about as well as placebo. So: citrate for best-documented absorption (mildly laxative — a bonus if you're constipated); glycinate for gut tolerability and bedtime use, which is a genuine advantage but a different one; oxide is a cheap laxative and a multivitamin filler. Check the label — several popular Indian \"magnesium\" tablets are oxide."],
    },
  },
  {
    id: "iron",
    name: "Iron",
    grade: "strong",
    gradeFor: "If deficient",
    form: "Ferrous salts, alternate-day morning dosing",
    typicalDose: "18–65 mg elemental",
    upperLimit: "45 mg/d",
    interactions: "Levothyroxine (4 h gap), tea/coffee/calcium, PPIs",
    testFirst: true,
    detail: {
      headline: "India's most over-recommended and most misunderstood supplement",
      sections: [
        { q: "Mechanism", a: "Non-heme iron enters the enterocyte through DMT1 after ferric-to-ferrous reduction. Hepcidin is the master switch — it degrades ferroportin and shuts down both intestinal absorption and macrophage iron release. Heme iron runs at 14–18% bioavailability; non-heme at 5–12%, and in Indian cereal-pulse diets the ICMR puts real absorption at 1–5%." },
        { q: "The evidence", a: "Treating confirmed iron-deficiency anaemia: unambiguous. The problem is the indication. DABS-India (venous blood, 8 states) found iron deficiency accounts for under one-third of Indian anaemia in most groups — reaching ~45% only in adolescent girls — and that adult-woman anaemia is 41%, not NFHS-5's capillary-derived 57%. Supplementing iron off the back of the headline number means giving it to a majority of people whose anaemia isn't iron-driven." },
        { q: "Dose & form", a: "Alternate-day, single morning dosing beats daily. Stoffel et al., Lancet Haematology 2017 established this: hepcidin stays elevated for ~24 hours after a dose, so yesterday's tablet blunts today's absorption. Alternate-day dosing improves fractional absorption and tolerability at once. Pair with vitamin C; ferrous salts beat ferric." },
        { q: "Cautions", a: "Upper limit 45 mg/day. Separate from levothyroxine by 4+ hours and from tea, coffee, calcium and dairy by at least an hour — a controlled stable-isotope trial found even a 1-hour gap between a meal and tea meaningfully attenuates tannin inhibition. PPIs impair absorption. Iron overdose is a leading cause of fatal childhood poisoning: lock it away." },
      ],
      notes: [],
    },
  },
  {
    id: "zinc",
    name: "Zinc",
    grade: "moderate",
    gradeFor: "Cold duration",
    form: "Citrate/gluconate; acetate lozenges for colds",
    typicalDose: "8–11 mg/d",
    upperLimit: "40 mg/d",
    interactions: ">50 mg/d chronically → copper deficiency myeloneuropathy",
  },
  {
    id: "folate",
    name: "Folate",
    grade: "strong",
    gradeFor: "NTD prevention",
    form: "Folic acid or 5-MTHF",
    typicalDose: "400 mcg DFE; 400–800 preconception",
    upperLimit: "1,000 mcg folic acid",
    interactions: "Masks B12 deficiency; methotrexate, antiepileptics, sulfasalazine",
  },
  {
    id: "vitamin-c",
    name: "Vitamin C",
    grade: "moderate",
    gradeFor: "Narrow uses",
    form: "Plain ascorbic acid, split doses",
    typicalDose: "≤500 mg/d supplemental",
    upperLimit: "2,000 mg/d",
    interactions: "Boosts iron absorption — hazard in haemochromatosis; oxalate stones",
  },
  {
    id: "melatonin",
    name: "Melatonin",
    grade: "strong",
    gradeFor: "Circadian",
    form: "Immediate release",
    typicalDose: "~4 mg, 3 h before bed",
    upperLimit: "None set",
    interactions: "Fluvoxamine markedly raises levels; warfarin, antihypertensives",
  },
  {
    id: "l-theanine",
    name: "L-theanine",
    grade: "moderate",
    gradeFor: "Attention",
    form: "L-isomer (Suntheanine if branded)",
    typicalDose: "200 mg acute",
    upperLimit: "None set",
    interactions: "Additive with sedatives and antihypertensives",
  },
  {
    id: "ashwagandha",
    name: "Ashwagandha",
    grade: "emerging",
    gradeFor: "Bias-limited",
    form: "KSM-66 or Sensoril, cycled",
    typicalDose: "300–600 mg/d",
    upperLimit: "None set",
    interactions: "Liver and thyroid signals; antidiabetics, immunosuppressants, sedatives, thyroid hormone. Not in pregnancy.",
  },
  {
    id: "curcumin",
    name: "Curcumin",
    grade: "emerging",
    gradeFor: "Low certainty",
    form: "Plain curcuminoid + 20 mg piperine",
    typicalDose: "500–1,500 mg/d",
    upperLimit: "None set",
    interactions: "Piperine inhibits CYP3A4 and P-gp — raises levels of other drugs. Antiplatelets; hepatotoxicity reports",
  },
  {
    id: "coq10",
    name: "CoQ10",
    grade: "moderate",
    gradeFor: "Heart failure",
    form: "Oil-based softgel with a fatty meal",
    typicalDose: "100–300 mg/d",
    upperLimit: "None set",
    interactions: "May reduce warfarin efficacy; lowers BP and glucose modestly",
  },
  {
    id: "vitamin-k2",
    name: "Vitamin K2",
    grade: "emerging",
    gradeFor: "Bone markers, not bone density",
    form: "MK-7 (if at all)",
    typicalDose: "90–180 mcg/d",
    upperLimit: "None set",
    interactions: "Antagonises warfarin — hard interaction",
  },
  {
    id: "collagen",
    name: "Collagen",
    grade: "null-or-harm",
    gradeFor: "Funding bias",
    form: "Hydrolysed peptides",
    typicalDose: "2.5–10 g/d",
    upperLimit: "—",
    interactions: "Displaces higher-quality protein; marine = fish allergy",
  },
  {
    id: "multivitamin",
    name: "Multivitamin",
    grade: "null-or-harm",
    gradeFor: "Prevention",
    form: "Iron-free for men and postmenopausal women",
    typicalDose: "1/day",
    upperLimit: "—",
    interactions: "Check for beta-carotene if you smoke; stacking risk with separate zinc, selenium, vitamin A",
  },
];

/**
 * WHAT THE EVIDENCE SAYS TO SKIP — a third of the review, and the reason the
 * rest of it is trustworthy. This list is not decoration: the engine reads it
 * so that "Mira does not recommend this" is an answer she can give with a
 * citation, which is the most valuable thing a supplement screen can say.
 * Two of these caused measurable harm in large trials.
 *
 * THE THREE FIELDS ARE THREE DIFFERENT SENTENCES and none contains another.
 * `what` is the claim being refused, `why` is the evidence body ALONE, and
 * `source` is the citation ALONE. The first cut of this data was pasted from
 * the review with the title and the citation still fused onto the body — so
 * the page printed "…the funding pattern is the story.Myung & Park, Am J Med
 * 2025" and then printed the same citation again underneath it. A spec now
 * refuses a `why` that starts with its own `what` or ends with its own
 * `source`; composing them is the page's job, once.
 */
export interface SkipFact { what: string; why: string; source: string }

export const DO_NOT_RECOMMEND: SkipFact[] = [
  {
    what: "Vitamin E, 400 IU",
    why: "SELECT, n=34,887 men, median 7 years at final analysis: vitamin E significantly increased prostate cancer risk, HR 1.17 (99% CI 1.004–1.36) — 620 cases versus 529, an excess of 1.6 cancers per 1,000 person-years. Risk appeared at ~3 years and persisted.",
    source: "Klein et al., JAMA 2011",
  },
  {
    what: "Beta-carotene, if you smoke",
    why: "ATBC (>29,000 male smokers) and CARET were both stopped early for statistically significant excess lung cancer incidence and elevated overall mortality. Check any multivitamin for beta-carotene before recommending it to a smoker.",
    source: "ATBC and CARET, reviewed in JNCI",
  },
  {
    what: "Collagen for skin ageing",
    why: "23 RCTs, 1,474 participants. Pooled, it looked positive. Stratified, the finding collapses: \"High-quality studies revealed no significant effect in all categories, while low-quality studies revealed a significant improvement.\" Trials without industry funding showed no benefit. Industry bodies have contested the analysis, including some checkable data-extraction errors — but the funding pattern is the story.",
    source: "Myung & Park, Am J Med 2025",
  },
  {
    what: "Multivitamins for disease prevention",
    why: "PHS-II (11.2 years): no reduction in cardiovascular events or cognitive decline. COSMOS: no reduction in cancer, CVD or mortality. Pooled across 78 RCTs and 715,526 participants: they \"do not reliably reduce chronic disease risk.\" AHA and AICR recommend against. Nutritional insurance, not medicine.",
    source: "NIH ODS multivitamin fact sheet",
  },
  {
    what: "Glucosamine and chondroitin",
    why: "The BMJ network meta-analysis found no clinically relevant reduction in joint pain versus placebo, alone or combined, and recommended discontinuing reimbursement. GAIT missed its primary endpoint too.",
    source: "Wandel et al., BMJ 2010",
  },
  {
    what: "\"Bioavailability-enhanced\" curcumin",
    why: "In the 2025 knee OA network meta-analysis, enhanced formulations ranked below plain curcuminoid on WOMAC pain — the reverse of the marketing claim. The famous \"29-fold absorption increase\" for phytosome curcumin traces to a manufacturer press release, not to peer review.",
    source: "Rattanavipanon et al., BMC Complement Med Ther 2025",
  },
  {
    what: "Methylcobalamin's price premium",
    why: "\"No evidence indicates that absorption rates of vitamin B12 in supplements vary by form of the vitamin.\" Cyanocobalamin works and costs less.",
    source: "NIH ODS vitamin B12 fact sheet",
  },
  {
    what: "Magnesium glycinate's absorption claim",
    why: "The one good randomised head-to-head found citrate produced the highest plasma magnesium and the amino-acid chelate was not superior. Glycinate's real advantage is gut tolerability — a legitimate reason to buy it, just not the one on the box.",
    source: "Walker et al., Magnesium Research 2003",
  },
  {
    what: "Ubiquinol's premium over ubiquinone",
    why: "Every source supporting ubiquinol superiority that surfaced in this review was commercial. No peer-reviewed head-to-head bioavailability trial was located. What is uncontroversial: take any CoQ10 with a fatty meal, and oil-based softgels beat dry powder.",
    source: "Unverified claim — flagged as such",
  },
  {
    what: "Vitamin D beyond correcting deficiency",
    why: "VITAL: null for cancer and cardiovascular events. VITAL fracture ancillary: null for total, non-vertebral and hip fractures. D-Health: null for mortality. Jolliffe 2024: null for respiratory infection. It corrects deficiency; it does not prevent disease in the replete.",
    source: "VITAL, NEJM 2018–2022; Jolliffe 2024",
  },
  {
    what: "Omega-3 above 1 g/day without an indication",
    why: "Dose-dependent atrial fibrillation risk: HR 1.49 above 1 g/day versus 1.12 at or below. STRENGTH found no cardiovascular benefit at 4 g/day plus more AF.",
    source: "Albert et al., Circulation 2021",
  },
  {
    what: "Generic probiotics for general \"gut health\"",
    why: "The AGA endorses only 3 of 8 GI indications and recommends against probiotics for acute paediatric gastroenteritis. The ACG recommends against them for C. difficile prevention — the very indication the AGA rated best. The two societies disagree with each other.",
    source: "AGA 2020 guideline; ACG",
  },
  {
    what: "Vitamin C megadoses",
    why: "Absorption is 70–90% at 30–180 mg/day and drops below 50% above 1 g. Tissues saturate around 100 mg/day and oral plasma plateaus at ~220 µmol/L regardless of dose. Above 2 g you get osmotic diarrhoea and, in susceptible people, oxalate kidney stones.",
    source: "NIH ODS vitamin C fact sheet",
  },
  {
    what: "BCAAs with adequate protein intake",
    why: "A scoop of whey already delivers ~5.5 g of BCAAs. Buying them separately is buying a subset of a thing you already own.",
    source: "Product labels; Morton BJSM 2018",
  },
  {
    what: "Vitamin K2 for bone density",
    why: "3 years, 375 mcg MK-7, in postmenopausal women with osteopenia, on top of calcium and vitamin D: null at total hip, femoral neck and lumbar spine (all p>0.09), and null on microarchitecture — despite successfully carboxylating osteocalcin.",
    source: "Rønn et al., Osteoporos Int 2020",
  },
  {
    what: "Iron without a ferritin test",
    why: "Iron deficiency explains under a third of Indian anaemia. Supplementing on the strength of an anaemia headline means giving an agent with a real harm profile to a majority who don't need it.",
    source: "DABS-India, Eur J Clin Nutr 2024",
  },
];

/** The population facts that make this an INDIAN engine rather than a
 *  translated American one. Read by the "why you" line when a citizen has no
 *  blood work yet: a base rate is not a diagnosis, and the copy says so. */
export const INDIA_CONTEXT = [
  { fact: '67% of Indian adults have vitamin D below 20 ng/mL', source: 'India subgroup, 39 studies, n=38,672 — BMC Public Health 2021' },
  { fact: '53% pooled vitamin B12 deficiency across Indian studies', source: 'J Nutritional Science 2021; IJEM 2019 calls it endemic' },
  { fact: '39% of Indians are vegetarian; 81% limit meat', source: 'Pew Research Center, n=29,999, 2019–20' },
  { fact: '1–5% of iron is absorbed from a typical cereal-and-pulse diet', source: 'ICMR Bulletin — phytates and tea tannins block it' },
  { fact: '81% of Indian adults have dyslipidaemia', source: 'ICMR-INDIAB-17, n=113,043 — Lancet Diab Endo 2023' },
  { fact: '~50 mg daily EPA+DHA even among India’s highest omega-3 consumers', source: 'against a 250–500 mg international target' },
  { fact: 'ICMR lowered India’s protein RDA to 0.83 g/kg/day in 2020 and warns against protein supplements', source: 'ICMR-NIN 2020' },
];

/** The review, as one citable object. Every card the city draws says where it
 *  came from and when — an evidence date is part of the evidence. */
export const SOURCE = {
  title: 'Supplements, Honestly — An Evidence Guide for India',
  edition: 'India edition',
  reviewed: '2026-08',
  assessed: 19,
  note: 'General health information in a clinical voice. Not a diagnosis, a prescription, or personal medical advice.',
};

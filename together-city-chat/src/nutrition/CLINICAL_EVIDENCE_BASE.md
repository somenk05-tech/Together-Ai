# Together City — Clinical Nutrition Engine: evidence base

The nutrition engine is a **transparent, cited rules engine** — every biomarker threshold,
interpretation and dietary recommendation is traceable to a professional source. It is
decision-support/education, **not diagnosis**, and every screen says so.

## Sources

| ID | Source | Drives |
|----|--------|--------|
| `ESPEN-MN` | ESPEN micronutrient guideline (2022) — Berger MM et al., *Clin Nutr* 41:1357-1424 | Vitamin D, B12, folate, iron/ferritin thresholds & repletion; acute-phase (CRP) behaviour |
| `ESPEN-OB` | ESPEN-UEG obesity in GI/liver disease (2024) | Glycemic & lipid dietary patterns; weight-loss protein targets; omega-3 |
| `ESPEN-LIV` | ESPEN liver-disease practical guideline | Protein/energy targets; Mediterranean pattern |
| `ESPEN-GER` | ESPEN geriatrics practical guideline | Protein ≥1.0 g/kg, energy ~30 kcal/kg, hydration, avoid restrictive diets |
| `ESPEN-CAN` | ESPEN cancer practical guideline | 25-30 kcal/kg, >1.0 g/kg protein, glycemic-load guidance |
| `ESPEN-POLY` | ESPEN polymorbid-inpatients guideline | Protein 1.2-1.5 g/kg; ONS-to-target |
| `KRAUSE` | Krause's Food & the Nutrition Care Process, 14th ed. — Ch.7 (Biochemical Assessment, Litchford), Ch.32 (Anemia), Ch.33 (CVD) | Lab reference ranges; anemia-of-chronic-disease logic; iron/B12/folate food sources & absorption |
| `NIH-ODS` | NIH Office of Dietary Supplements — consumer fact sheets (ods.od.nih.gov) | Supplement RDAs, tolerable upper limits, food sources, safety (e.g. vitamin D UL 4,000 IU; folic-acid masks B12; iron UL 45 mg) |
| `LABREF` | Standard ADA / NCEP-ATP lab tiers | HbA1c (<5.7 / 5.7-6.4 / ≥6.5%), LDL and triglyceride tiers |

## Medical Hub — source of truth (`src/medical`)

Per the architecture, the **Medical Hub owns health data**. It stores dated blood-test
panels (`MedicalBloodTest` + `MedicalBiomarker`), so analysis shows **trends vs the prior
panel**, and it derives a **per-user supplement plan** — each item named to the exact flag or
goal that triggered it, with an NIH-ODS RDA/upper-limit reference. Interpretation reuses the
same cited engine (`src/nutrition/clinical-engine.ts`), so Nutrition, Beauty and Fitness read
the *same* biomarkers by reference (with consent) and stay consistent. Endpoints:
`GET/POST /medical/blood-tests`, `GET /medical/blood-tests/latest|:id`, `GET /medical/supplement-plan`.

*(Krause's excerpt corrected two reference ranges the earlier draft had wrong — e.g.
hemoglobin M 14-18 / F 12-16 g/dL — which the engine now uses.)*

## What the engine does

**1. Biomarker panel (`GET/POST /nutrition/blood`).** Nine consumer markers (Hb, ferritin,
25-OH vitamin D, B12, folate, HbA1c, LDL, triglycerides, CRP) evaluated against cited
reference ranges → LOW / NORMAL / HIGH, each with food-first dietary guidance and its
citation chip.

**2. Inflammation-aware interpretation (the key clinical nuance).** Each marker carries an
`acutePhase` behaviour. When CRP is raised, the engine adds a caveat:
- **Ferritin** is a *positive* acute-phase reactant — a "normal" ferritin with high CRP can
  mask iron deficiency ("anemia of chronic/inflammatory disease", Krause Ch.32). Flagged.
- **Vitamin D, folate, zinc** fall in inflammation — a low value during a flare may overstate
  true depletion; recheck when CRP is normal (ESPEN-MN).
- **B12** can be *falsely raised* by inflammation — a normal value doesn't fully exclude
  deficiency (ESPEN-MN).

**3. Critical "seek care" alerts (`alerts`).** Hard safety floor above the dietary layer:
severe anemia (Hb <8), HbA1c >9, triglycerides >500 (pancreatitis risk), LDL >190 (possible
FH), B12 <150, ferritin >1000, CRP >100 — surfaced as "see a doctor / seek care", because
these are beyond what diet fixes.

**4. Condition modules (`conditions`).** Flag combinations surface cited guidance blocks:
anemia (iron/B12/folate), glycemic control, heart-healthy lipids.

**5. Supplement engine.** Goal-matched base kit upgraded by flags (low D → D3, low B12 → B12,
low folate → folate+B12 so it isn't masked, low iron → Iron+C). Oral/consumer framing only;
clinical-only content (IV/enteral/parenteral, drugs, high-dose repletion) is deliberately
excluded per each guideline's scope.

**6. Condition-aware meal planning (`planningModes` / `scoreRecipe`).** Blood flags + goal
switch on planning *modes* that re-rank each meal slot's candidates toward the guideline
direction, then the generator rotates among the top candidates (variety preserved):
- **Low-glycemic** (HbA1c high) — higher fibre, lower refined carbs (ESPEN-OB, ESPEN-CAN).
- **Heart-healthy** (LDL/trig high) — fish, fibre, unsaturated fat over saturated (ESPEN-OB, Krause).
- **Iron-supportive** (low Hb/ferritin) — iron-rich, protein-dense meals (ESPEN-MN, Krause).
- **Weight-loss / Muscle-gain** (goal) — protein/energy per ESPEN targets.
The planner shows *why* it leaned, with sources.

## The ML layer (future, by design)

This engine is the **clinical floor** — deterministic and explainable. A learned
preference model (which recipes a user actually eats, swaps, or rates) should sit **on top**:
it re-ranks the *top-scored, guideline-compliant candidates* by personal taste, never below
the clinical bias. `scoreRecipe`/`rankByModes` already return ranked candidate lists, so a
learned re-ranker is a drop-in over `ranked[slot].slice(0, K)` — the clinical constraints stay
intact while personalisation improves. (Not yet implemented; noted so the boundary is clear.)

## Safety

Educational guidance grounded in ESPEN/Krause — not a diagnosis or treatment plan. The
Medical Hub remains the source of truth for records. Users are told to confirm with a doctor
or dietitian, especially alongside medication or a diagnosed condition.

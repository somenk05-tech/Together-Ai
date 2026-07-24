# Nutrition Hub — Clinical Review Packet (for dietitian/physician sign-off)

Purpose: a registered dietitian / physician review of the **targets, clinical caps, condition
logic, and supplement recommendations** the Nutrition Hub generates, before the
"not certified for unsupervised clinical use" caveat is dropped (Phase-4 gate).

Everything below is what the code actually does (file references given). Please annotate any
value you'd change. This is decision-support / educational guidance, not a prescription; the
app surfaces "confirm with your clinician" throughout and blocks (warns on) any plan it cannot
keep within a medical cap.

## 1. Energy & macro targets (`computeTargets`, nutrition.service.ts)
- **Energy:** Mifflin-St Jeor BMR × activity (1.2–1.9). Goal adjustment: lose −18%, gain +10%
  (0% if BMI ≥ 27), maintain 0%. Floor 1400 kcal.
- **Protein (g/kg/day, highest applicable wins; kidney overrides all):** healthy 0.8; age >65 1.1;
  weight-loss 1.4; muscle-gain 1.8; endurance (activity ≥1.8) 1.4; T2 diabetes 1.0–1.5;
  CKD 1–2 ≤0.9; CKD 3–5 no dialysis 0.7; dialysis 1.1. Protein uses reference weight (BMI-25
  weight if overweight).
- **Fat** 27% kcal. **Fiber** 14 g/1000 kcal (25–50 g), raised to ≥35 g for diabetes/dyslipidemia.
- **Life-stage:** pregnancy +340 kcal (T2) / +450 (T3), +25 g protein, iron 27 mg, folate 600 mcg,
  calcium 1000 mg, **no deficit**. Lactation +400 kcal, +25 g protein. Pediatric (<18): **no
  weight-loss deficit**, protein ≥1.0 g/kg, flagged for pediatric-dietitian supervision.

**Review Q:** Are the protein g/kg bands and the pregnancy/pediatric handling appropriate for your population?

## 2. Clinical caps enforced on the plate (per day)
- **Diabetes:** added sugar ≤ 20 g; low-glycemic bias; rice de-prioritized.
- **Hypertension:** sodium ≤ 1500 mg (DASH); potassium floor raised.
- **Dyslipidemia / high LDL/trig:** saturated fat ≤ 6% kcal; more soluble fibre.
- **Fatty liver:** added sugar ≤ 20 g, satfat ≤ 7% kcal, lean protein ≥1.2 g/kg, alcohol avoided.
- **CKD (from stage/eGFR):** protein per above; sodium ≤ 2000 mg; potassium ≤ 2500 mg (stage 3–5 / dialysis),
  ≤ 3000 (early); phosphorus ≤ 900 mg (late) / 1000 (dialysis/early). Renal K/P also enforced
  per-dish (ceilings) and dal/curd de-emphasized.
- **Multi-condition:** caps compose — the tighter value wins (verified: HTN 1500 mg sodium is kept
  under a co-existing renal 2000 mg limit).
- **Enforcement:** no single dish may exceed ~60% of a daily cap; a breaching clinical day is
  regenerated up to 6× and, if it still can't comply, the plan is **blocked and the user warned**
  ("review with your clinician") — never silently served.

**Review Q:** Are these caps and thresholds correct? Any condition needing a cap we don't set (e.g. gout purine target, potassium *floor* for specific meds)?

## 3. Blood-marker → condition/target mapping (`conditionsFromBlood`, clinical-engine.ts)
- eGFR <15 → CKD 5; <30 → CKD 4; <60 → CKD 3. Creatinine >1.3 (no eGFR) → conservative CKD 3.
- ALT/AST >40 or GGT >55 → fatty-liver handling.
- Uric acid >7 → gout avoids (organ meat, high-purine seafood, alcohol, added sugar).
- HbA1c ≥6.5 → diabetes caps. LDL ≥160 or trig ≥200 or HDL <40 → heart-healthy caps.
- TSH >4.5 → hypothyroid note. Critical alerts: eGFR<15, creatinine>4, ALT>200, uric acid>10,
  HbA1c>9, trig>500, LDL>190, Hb<8, folate<2, CRP>100 → "seek medical care" messaging.

**Review Q:** Are these thresholds and the auto-staging of CKD from eGFR clinically acceptable as decision-support?

## 4. Supplement logic (`supplementKit`, clinical-engine.ts) — safety-gated
- Base: omega-3 + a multivitamin. **CKD →** renal vitamin (low A/K/P), **no** whey/creatine/generic multivit.
  **Pregnancy/lactation →** prenatal (explicit high-dose-retinol warning) + folate + iron; **no** creatine.
  **Under-18 →** no whey/creatine. Blood-driven additions: D3 (low vit D), B12, folate (paired), iron+C (low Hb/ferritin).
- Cautions surfaced for renal, pregnancy, lactation, liver, and minors.

**Review Q:** Any supplement here you'd remove/add, or a dose/upper-limit to change?

## 5. What the app does NOT do (scope guardrails)
- No drug dosing or medication changes. No diagnosis — conditions are user-declared or derived from
  labs as decision-support. No claims of treatment. Alcohol modeled at near-zero macros and avoided
  for liver. Micronutrients (iron/calcium/vit D/C) are estimates from a partial food table (honest
  under-estimate, not fabricated).

## 6. Evidence base referenced in code
ESPEN guidelines (obesity/GI-liver, micronutrients, geriatrics, liver, cancer, polymorbid), Krause's
Food & the Nutrition Care Process (14th ed.), and NIH ODS fact sheets (RDA/upper limits). Citation ids
are attached to each marker and supplement.

---
**Sign-off:** _______________________  (name, credential, date). Please list any required changes;
the release gate (RELEASE-GATE.md) treats this sign-off as mandatory before Phase-4 completion.

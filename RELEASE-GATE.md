# Together City — Nutrition Hub Release Gate

The objective finish line for declaring the Nutrition Hub production-ready and dropping the
"not certified for unsupervised clinical use" caveat. "100/100" means **every gate below passes**,
not a subjective judgement. Each round re-runs the full battery and records measured results.

## Battery (must all run and be green each round)
- `together-city-chat` — `npx jest` (full suite, currently 147 tests / 22 suites)
- `sim-150.spec.ts` — 150 virtual-user simulation (distribution + behaviours)
- `qa-matrix.spec.ts` — 152-profile clinical stress matrix
- Frontend — `npx tsc --noEmit` + `npx vite build` clean
- (Phase 3+) live load test + end-to-end HTTP suite

## Hard safety gates (must be exactly 0 — non-negotiable, every round)
- Crashes in the simulation: **0**
- Clinical breaches shipped without a `blocked` warning: **0**
- Supplement contraindications (whey/creatine→CKD, retinol→pregnancy, perf→minors): **0**
- Diet violations: **0**
- Allergen leaks into a plan: **0**
- Salt (or any "to taste" item) appearing as a purchasable grocery line: **0**
- Life-stage safety (pregnancy no-deficit + prenatal kit; pediatric no-deficit): **all true**

## Phase gates

| Phase | Target score | Exit criteria |
|---|---|---|
| **1 — close the four Highs** | ~82 | Zero High findings open; calorie ±10% ≥ 90% and protein-met ≥ 90% of days; family members planned from their own prefs; library diet filters correct; blood breadth ingested (eGFR→CKD staging). Sim re-run green. |
| **2 — deepen the data** | ~90 | `nutrientComplete` ≥ 60%; iron/calcium/vit D/C present; token/ontology allergen matching passes an adversarial test set; grocery canonicalized; MNT avoids applied; budget influences selection; honest sorts; recipe images sourced. No clinical cohort > ~5% blocked plans. |
| **3 — harden production** | ~96 | Real load test at 150+ concurrent users on Railway (p95 latency, DB locks, memory, cold-boot pool warm-up); e2e HTTP tests for blood upload, ordering, manual meal edit, concurrent saves; a11y polish; Low items closed; family-recipient endpoint shipped. Performance dimension measured (not inferred). |
| **4 — certify & release** | 100 | Full Round-4 battery green; zero Critical/High; blocked-plan rate within tolerance; every score dimension ≥ 90; clinician sign-off on targets, caps and supplement logic. Only then drop the clinical caveat. |

## Score dimensions (each ≥ 90 required for release)
Medical accuracy · Personalization · Recipe quality · Grocery synchronization ·
AI/clinical recommendations · User experience · Performance · Accessibility · Production readiness

## Current status (Round 3 → Phase 1 in progress)
- Hard safety gates: **all passing** (0 unsafe shipped, 0 supplement contraindications, 0 diet/allergen leaks, 0 salt-in-grocery, life-stage true).
- Calorie ±10%: **80%** (±20%: 91%), protein-met **75%** — improved from 44%/65% but the ≥90% ±10% gate is **not yet met** (data-limited; carried to Phase 2).
- Highs closed: family-member safety, library diet filter, blood breadth. Adherence partially (Phase-2 data dependency).
- Not yet done: Phase 2 data depth, Phase 3 load/e2e/performance measurement, clinician sign-off.

**Dependencies:** Phase 2 blood-driven selection needs Phase 1's blood schema (done). The load test must run after adherence + data changes land, or it benchmarks soon-to-change code.

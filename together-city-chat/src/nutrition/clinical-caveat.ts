/**
 * ── THE CAVEAT THE RELEASE GATE REQUIRES (launch gate, third reading, 4 Sep) ─
 *
 * RELEASE-GATE.md says the Nutrition Hub carries a "not certified for
 * unsupervised clinical use" caveat until Phase 4 — a clinician's sign-off
 * on targets, caps and supplement logic — and that the caveat is dropped
 * only then. The sentence existed nowhere in the web or the API: a CKD-3
 * citizen's daily plan page warned only when a day could not be kept
 * within its caps, and said nothing on the days it could.
 *
 * One string, sent with every CLINICAL plan (a plan built under condition
 * caps rather than the guideline caps everybody gets), rendered by the page
 * under the plan. Deleting this file is Phase 4's job and nobody else's.
 */
export const CLINICAL_CAVEAT =
  'Not certified for unsupervised clinical use. This plan applies published clinical-nutrition caps to your results and conditions; it is not a prescription and has not been reviewed by a clinician for you. Follow it with your doctor or dietitian.';

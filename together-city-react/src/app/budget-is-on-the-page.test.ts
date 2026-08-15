import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments out first — this file's own header names the things it forbids. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * A BUDGET YOU CANNOT SEE BEING SPENT IS NOT A BUDGET.
 *
 * The engine had been right for a week and the page said nothing about it. Four
 * products with four purchase prices — ₹284, ₹569, ₹408, ₹474 — against a
 * MONTHLY limit of ₹5,000. Every number on the screen was true and the sum of
 * them answered a question nobody had asked, because a cleanser lasting six
 * weeks and a serum lasting eight months do not belong in the same total.
 *
 * The four things below are the ones that would each go quiet on their own:
 *
 *   THE JOIN. The plan and the steps meet on `productId`, and they meet nowhere
 *   else. The server used to send the whole product inside the plan while this
 *   app's type claimed an id — a join on `undefined` renders a page with no
 *   monthly costs and throws nothing. (The server side of that is asserted in
 *   budget-is-a-limit.spec.ts; this is the other end of the same wire.)
 *
 *   THE MONTHLY FIGURE, beside every purchase price rather than instead of it.
 *   Both are true and they answer different questions: what it costs to buy
 *   today, and what it costs to keep.
 *
 *   THE WORKING. "≈ ₹366/month" without "one 88 ml pack — about 3 months" is an
 *   assertion, and an assertion about somebody's money is one they are entitled
 *   to check.
 *
 *   THE CALM. The bar fills in the hub's accent and nothing else. A budget
 *   four-fifths spent is a budget working; painting it in the danger tokens
 *   would make the app anxious on the citizen's behalf about a number they
 *   themselves chose. Those tokens are reserved here for things that can hurt
 *   somebody's skin.
 */
describe('the routine sheet shows what it is spending', () => {
  const routine = code('features/beauty/pages/Routine.tsx');
  const budgetPanel = code('features/beauty/components/BudgetPanel.tsx');

  it('joins the plan to the steps on the id the server actually sends', () => {
    expect(routine).toMatch(/RoutinePick/);
    expect(routine).toMatch(/m\.set\(p\.productId, p\)/);
    expect(routine).toMatch(/picks\.get\(s\.productId\)/);
  });

  it('prints the monthly cost next to the purchase price, not instead of it', () => {
    expect(routine).toMatch(/s\.priceInr/);
    expect(routine).toMatch(/pick\.monthlyInr/);
    expect(routine).toMatch(/\/month/);
  });

  it('shows how long a pack lasts, so the monthly figure can be checked', () => {
    expect(routine).toMatch(/pick\.packLabel/);
    expect(routine).toMatch(/pick\.lastsLabel/);
  });

  it('quotes those phrases rather than recomputing them here', () => {
    // The pack size, the dose and the twelve-month cap are judgements made once,
    // in the server's monthly-cost.ts. A second copy in the browser is a second
    // answer the first time either is corrected.
    expect(routine).not.toMatch(/monthsOfUse\s*[*/]/);
    expect(routine).not.toMatch(/\bml\b\s*\)/);
    expect(routine).not.toMatch(/about \$\{/);
  });

  it('states all three numbers a limit needs', () => {
    // "Monthly budget" until 16 Aug, and by then it had been wrong for two
    // commits: "The budget is the shopping trip" moved the planner onto
    // purchase prices and this label kept the old unit, over a figure the
    // engine now spends at the counter. The word came off rather than being
    // corrected to "purchase budget" — a budget on this page is what you hand
    // over, and the monthly number is right underneath it saying what it is.
    for (const phrase of ['Budget', 'Routine cost', 'remaining']) {
      expect({ phrase, on: routine.includes(phrase) }).toEqual({ phrase, on: true });
    }
  });

  it('never says a budget is monthly, anywhere the citizen can read it', () => {
    /**
     * THE RATCHET ON THE UNIT. The purchase-price change landed in the
     * arithmetic and then took three commits to finish landing in the COPY —
     * "One unit on the page" caught two strings, and fourteen more were still
     * telling somebody their ₹8,000 was a monthly limit. A unit lives in the
     * strings as much as in the numbers, and a page that mixes them is lying
     * twice: once about the money, once about the time.
     *
     * `/month` beside a PRICE is the honest one and stays — this only refuses
     * the word next to the word "budget".
     */
    for (const src of [routine, budgetPanel]) {
      expect(src).not.toMatch(/monthly budget/i);
      expect(src).not.toMatch(/budget[^.]{0,40}\ba month\b/i);
      expect(src).not.toMatch(/monthly limit/i);
      expect(src).not.toMatch(/spending each month/i);
    }
  });

  it('draws the bar in the accent and never in an alarm colour', () => {
    expect(routine).toMatch(/--accent/);
    // Not "is the budget nearly gone" — that is the citizen's own decision,
    // already made, being reported back to them as a problem.
    expect(routine).not.toMatch(/--danger/);
    expect(routine).not.toMatch(/pct\s*[><]=?\s*\d+\s*\?/);
  });

  it('asks before raising a short budget, and never raises it silently', () => {
    expect(routine).toMatch(/minimumInr/);
    // Both doors, and the one that costs money is not the only one.
    expect(routine).toMatch(/Keep \{rupees/);
    expect(routine).toMatch(/Set \$\{rupees/);
  });

  it('explains a lean routine with the plan\'s own reason, not a written-here one', () => {
    // The sentence belongs to the planner: it is the only thing that knows
    // every compatible step is already in and every step already holds the best
    // product for it. A cheerful line composed on this page would be a second
    // claim about the same arithmetic, and the wrong one the day the planner
    // changes.
    expect(routine).toMatch(/c\.leanReason/);
    expect(routine).not.toMatch(/don&rsquo;t recommend adding products/);
  });

  it('says out loud when the routine went over the number somebody set', () => {
    // Five per cent of headroom exists for a meaningfully better match. Using
    // it silently would make the budget advisory, which is the one thing it is
    // not.
    expect(routine).toMatch(/c\.overInr/);
    expect(routine).toMatch(/above budget/);
    // And the bar's fill is capped while the figure is not — a percentage
    // clamped to 100 would hide the overrun the sentence just admitted.
    expect(routine).toMatch(/Math\.min\(100, pct\)/);
  });

  it('asks before crossing the budget for a better routine', () => {
    // `idealInr` is the best compatible routine when it costs more than the
    // ceiling allows. Offered as a question with both amounts on the buttons.
    expect(routine).toMatch(/c\.idealInr/);
    expect(routine).toMatch(/won&rsquo;t go over your budget without asking/);
  });

  it('sends anyone changing a budget back to the one place it is set', () => {
    // One place, and it is the profile. A second set of dials here would be the
    // duplicate control that was already removed once.
    expect(routine).toMatch(/Adjust budget/);
    expect(routine).toMatch(/to="\/beauty\/profile"/);
    expect(routine).not.toMatch(/BudgetPanel/);
    expect(routine).not.toMatch(/type="range"/);
  });

  it('draws no card for a category the citizen set to nothing', () => {
    expect(routine).toMatch(/!c!?\.skipped/);
  });
});

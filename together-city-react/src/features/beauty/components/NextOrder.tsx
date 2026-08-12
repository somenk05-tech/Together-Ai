import { daysUntil, type ReorderDue } from '../api';

/**
 * WHEN TO BUY THIS AGAIN — the one thing a routine could not answer.
 *
 * Somebody who has just paid for ten products owns between six weeks and five
 * months of different things, and the question they will have in a month is not
 * "what did I buy" but "when do I have to do this again". Until this, the only
 * place that answer lived was a drawer with ten bottles in it.
 *
 * EVERY JUDGEMENT ON THIS CARD WAS MADE ON THE SERVER — which product runs out
 * first, how long a pack of it lasts, how many days before empty to ask. This
 * component turns one ISO day into "35 days" and does nothing else, which is
 * why the number is right at midnight without anybody refetching anything.
 *
 * AND IT NAMES WHAT RUNS OUT. "35 days" is a number that has to be trusted;
 * "35 days — your sunscreen runs out first, a pack lasts about 6 weeks" is a
 * number that can be checked against the bottle on the shelf. The whole hub is
 * built on showing the working behind a figure rather than asserting it, and a
 * countdown is the figure most likely to be wrong about somebody who uses more
 * sunscreen than the honest dose assumes.
 */
export function NextOrder({ due, variant = 'card' }: { due: ReorderDue; variant?: 'card' | 'row' }) {
  const days = daysUntil(due.dueAt);
  const what = due.productCategory.toLowerCase();

  /**
   * ZERO MEANS "NOW", NOT "TODAY", and it deliberately covers overdue as well.
   * `daysUntil` floors at zero, so an order placed four months ago and never
   * repeated reads the same as one due this morning — which is the same
   * instruction either way. Counting UP past the date ("11 days overdue") would
   * be a scolding, and this is a supply note.
   */
  const headline = days === 0
    ? 'Time to reorder'
    : `${days} day${days === 1 ? '' : 's'} till your next order`;
  const because = `Your ${what} runs out first — a pack lasts ${due.lastsLabel}`;

  if (variant === 'row') {
    return (
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        <strong style={{ color: 'var(--ink)' }}>{headline}</strong> · {because.toLowerCase()}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--accent-line)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '-.005em' }}>{headline}</div>
      <div className="muted" style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.45 }}>{because}</div>
    </div>
  );
}

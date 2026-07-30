import { OPTIMAL_HEALTH_THRESHOLD, optimalHealthGate } from './health-gate';

describe('when the Optimal Health plan is offered', () => {
  it('is offered below the threshold', () => {
    expect(optimalHealthGate({ score: 55 }).show).toBe(true);
    expect(optimalHealthGate({ score: 79 }).show).toBe(true);
    expect(optimalHealthGate({ score: 0 }).show).toBe(true);
  });

  it('collapses at or above it', () => {
    expect(optimalHealthGate({ score: 80 }).show).toBe(false);
    expect(optimalHealthGate({ score: 95 }).show).toBe(false);
  });

  it('reads the threshold from config, not from a literal', () => {
    // The ticket's requirement, and a real one: this number decides whether
    // somebody is shown clinical guidance at all.
    expect(optimalHealthGate({ score: OPTIMAL_HEALTH_THRESHOLD }).show).toBe(false);
    expect(optimalHealthGate({ score: OPTIMAL_HEALTH_THRESHOLD - 1 }).show).toBe(true);
    expect(optimalHealthGate({ score: 50 }).threshold).toBe(OPTIMAL_HEALTH_THRESHOLD);
  });
});

/**
 * The case that could quietly do harm.
 */
describe('an unknown score', () => {
  it('SHOWS the section rather than collapsing it', () => {
    // A null score means the app has not been told enough to judge — no panel,
    // no weight. Collapsing on that treats absence of evidence as evidence of
    // health, and hides clinical guidance from the people it knows least about.
    for (const score of [null, Number.NaN]) {
      const g = optimalHealthGate({ score });
      expect([score, g.show]).toEqual([score, true]);
      expect(g.because).toBe('score-unknown');
    }
  });

  it('offers no confirmation line, because there is nothing to confirm', () => {
    expect(optimalHealthGate({ score: null }).confirmation).toBe('');
  });
});

describe('the collapsed line', () => {
  it('says what was measured rather than passing a verdict', () => {
    const g = optimalHealthGate({ score: 88 });
    expect(g.confirmation).toContain('88/100');
    expect(g.confirmation).toMatch(/recorded markers/);
    // Not "you are healthy". This is a score built from what somebody chose to
    // record, and it should not sound like a clinical opinion about them.
    expect(g.confirmation).not.toMatch(/you are healthy|you're healthy/i);
  });

  it('is empty whenever the section is shown', () => {
    for (const score of [null, 10, 79]) {
      expect(optimalHealthGate({ score }).confirmation).toBe('');
    }
  });
});

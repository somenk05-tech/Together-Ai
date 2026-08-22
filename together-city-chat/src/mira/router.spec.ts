import { route, isUncertain, AMBIGUOUS_BELOW } from './router';
import type { Capability } from './mira.registry';

const cap = (over: Partial<Capability>): Capability => ({
  id: 'x GET y',
  controller: 'XController',
  method: 'GET',
  path: 'x/y',
  intent: 'do a thing',
  risk: 'R0',
  ...over,
});

const CAPS: Capability[] = [
  cap({ id: 'financial GET wallet', path: 'financial/wallet', intent: 'Tell the citizen their wallet balance',
        utterances: ["what's my balance", 'how much do I have', 'wallet balance'] }),
  cap({ id: 'financial GET transactions', path: 'financial/transactions', intent: 'List recent transactions',
        utterances: ['what did I spend', 'recent transactions', 'what have I paid for'] }),
  cap({ id: 'nutrition GET targets', path: 'nutrition/targets', intent: 'Tell the citizen what to eat toward today',
        utterances: ['what should I eat today', 'my targets', 'how much protein do I need'] }),
  cap({ id: 'drive GET', path: 'drive', intent: 'Find one of the citizen own documents',
        utterances: ["where's my insurance document", 'find my policy', 'my documents'] }),
];

const r = (t: string) => route(t, { capabilities: CAPS });

describe('the person comes before the task', () => {
  it('routes a feeling to LISTEN', () => {
    expect(r('i feel terrible today').lane).toBe('LISTEN');
    expect(r('everything feels stuck').lane).toBe('LISTEN');
    expect(r('can we talk').lane).toBe('LISTEN');
  });

  it('LISTEN wins even when a task is in the same sentence', () => {
    // The single most important ordering decision in this file. Someone saying
    // they feel terrible and mentioning a booking is a person telling you
    // something; answering by cancelling the booking is the worst available
    // response. The listen lane wins ties, deliberately.
    expect(r("i feel terrible, what's my balance").lane).toBe('LISTEN');
    expect(r('i had a rough day, find somewhere for dinner').lane).toBe('LISTEN');
  });
});

/**
 * A crisis turn matched no listen signal and no capability, so it came out of
 * here as AMBIGUOUS — whose base levity is L2. LISTEN is L0, and it is the only
 * correct lane for these sentences.
 */
describe('a crisis takes the listen lane', () => {
  it.each([
    'i want to kill myself',
    'i want to die',
    'i feel suicidal',
    'my friend wants to die',
  ])('%j routes to LISTEN', (t) => {
    expect(r(t).lane).toBe('LISTEN');
  });

  it('and still wins when a task is in the same sentence', () => {
    expect(r('i want to die, find somewhere for dinner').lane).toBe('LISTEN');
  });
});

describe('interpretation is not retrieval', () => {
  it('routes a "why" question to ADVISE', () => {
    expect(r('why has this year been so hard').lane).toBe('ADVISE');
    expect(r('what do you think').lane).toBe('ADVISE');
    expect(r('read my chart').lane).toBe('ADVISE');
  });
});

describe('retrieval', () => {
  it('finds the balance', () => {
    const v = r("what's my balance");
    expect(v.lane).toBe('RETRIEVE');
    expect(v.capabilityId).toBe('financial GET wallet');
  });

  it('finds a document', () => {
    expect(r("where's my insurance document").capabilityId).toBe('drive GET');
  });

  it('finds the food room', () => {
    expect(r('what should I eat today').capabilityId).toBe('nutrition GET targets');
  });

  it('an R0 capability is never routed to ACT', () => {
    // Phase 1 is read-only. A read cannot become an action by phrasing.
    for (const t of ["what's my balance", 'find somewhere for dinner', 'my documents']) {
      expect(r(t).lane).not.toBe('ACT');
    }
  });
});

describe('ambiguity is a lane, not a failure', () => {
  it('"cancel friday" asks rather than guessing', () => {
    const v = r('cancel friday');
    expect(v.lane).toBe('AMBIGUOUS');
    expect(v.why).toMatch(/cancel what/);
  });

  it('a bare "book it" is ambiguous', () => {
    expect(r('book it').lane).toBe('AMBIGUOUS');
  });

  it('an unmatched turn is ambiguous, never a low-confidence guess', () => {
    const v = r('please refactor the deployment pipeline');
    expect(v.lane).toBe('AMBIGUOUS');
    expect(v.capabilityId).toBeUndefined();
  });

  it('a near-tie is ambiguous rather than a winner', () => {
    // Two capabilities that both describe "recent spending" — taking the top
    // of a near-tie is exactly how an assistant answers the wrong question.
    const TIED: Capability[] = [
      cap({ id: 'a GET one', intent: 'Show spending', utterances: ['my spending this month'] }),
      cap({ id: 'b GET two', intent: 'Show spending', utterances: ['my spending this month'] }),
    ];
    const v = route('my spending this month', { capabilities: TIED });
    expect(v.lane).toBe('AMBIGUOUS');
    expect(v.why).toMatch(/score the same/);
  });

  it('empty input is ambiguous, not a crash', () => {
    expect(r('').lane).toBe('AMBIGUOUS');
    expect(r('   ').lane).toBe('AMBIGUOUS');
  });
});

describe('the confidence floor', () => {
  it('is set high on purpose', () => {
    // A clarifying question costs one turn. A wrong action costs trust. If
    // somebody lowers this to make Mira feel snappier, this test should make
    // them say so out loud.
    expect(AMBIGUOUS_BELOW).toBeGreaterThanOrEqual(0.5);
  });

  it('isUncertain catches both the lane and the score', () => {
    expect(isUncertain({ lane: 'AMBIGUOUS', confidence: 0.9, why: '' })).toBe(true);
    expect(isUncertain({ lane: 'RETRIEVE', confidence: 0.2, why: '' })).toBe(true);
    expect(isUncertain({ lane: 'RETRIEVE', confidence: 0.9, why: '' })).toBe(false);
  });
});

describe('the router never reaches for capabilities itself', () => {
  it('given none, it routes to AMBIGUOUS rather than guessing', () => {
    // This is the guard for the production defect. The router used to fall
    // back to a module-level source parse, which is empty in a compiled build —
    // so every capability silently disappeared and Mira answered questions she
    // could actually do with the navigation fallback. Capabilities are now
    // passed in by the caller, and their absence is loud rather than invisible.
    const v = route("what's my balance", { capabilities: [] });
    expect(v.lane).toBe('AMBIGUOUS');
    expect(v.capabilityId).toBeUndefined();
  });
});

import { readForget, readForgetConfirm } from './forget';

/**
 * The parser half of the delete.
 *
 * `she-remembers-and-forgets.spec.ts` holds the original figure-of-speech
 * guards, which are correct and are not repeated here. This file is the set of
 * sentences that were observed going wrong: the ones that returned null when
 * they were plainly a request, and the ones that returned a topic when they
 * were plainly not.
 */
describe('the verb is not only "forget"', () => {
  it('takes the words people actually use for a delete', () => {
    expect(readForget('delete my history')).toEqual({ scope: 'everything' });
    expect(readForget('erase everything you know about me')).toEqual({ scope: 'everything' });
    expect(readForget('wipe my data')).toEqual({ scope: 'everything' });
    expect(readForget('remove what I told you about my job')).toEqual({ scope: 'topic', topic: 'my job' });
  });

  /** The guards are the point of this module and they apply to every verb,
   *  not only to the one that had them first. */
  it('and keeps the guards for all of them', () => {
    expect(readForget("don't delete my history")).toBeNull();
    expect(readForget('never erase our chats')).toBeNull();
    expect(readForget('i forgot my keys again')).toBeNull();
    expect(readForget('how do i delete my ex from my head')).toBeNull();
  });
});

describe('the anchor lets a person be polite', () => {
  it.each([
    'i want you to forget everything',
    'could you kindly forget everything',
    'you can forget everything',
    'just forget everything',
    'maybe forget everything',
  ])('%j is a request', (t) => {
    expect(readForget(t)).toEqual({ scope: 'everything' });
  });
});

/**
 * ── WHAT USED TO COME OUT AS A TOPIC ──────────────────────────────────────
 *
 * Every string below was handed to a delete as a topic. A topic is a search
 * over her whole memory, so a garbage topic is a garbage deletion, and the
 * honest answer to a sentence she has misread is to ask rather than to act.
 */
describe('a topic has to be a topic', () => {
  it('does not invent one out of "everything else"', () => {
    expect(readForget('forget everything else and tell me about my day')).toEqual({ scope: 'unclear' });
  });

  it('reads a narrowed everything as the narrowing', () => {
    expect(readForget('forget everything i told you yesterday')).toEqual({ scope: 'topic', topic: 'yesterday' });
    expect(readForget('forget everything about the loan')).toEqual({ scope: 'topic', topic: 'the loan' });
  });

  it('refuses a bare pronoun', () => {
    expect(readForget('forget her')).toEqual({ scope: 'unclear' });
    expect(readForget('forget him')).toEqual({ scope: 'unclear' });
    expect(readForget('forget them')).toEqual({ scope: 'unclear' });
  });

  it('still takes a real one', () => {
    expect(readForget('forget about the loan')).toEqual({ scope: 'topic', topic: 'the loan' });
    expect(readForget('forget what i said about my boss')).toEqual({ scope: 'topic', topic: 'my boss' });
  });
});

/** Undefined means ask again. It is not a soft yes, and the call site is the
 *  one turn between a citizen and a deletion nobody can undo. */
describe('the confirm is a closed list', () => {
  it.each(['yes', 'yeah', 'yep', 'do it', 'go ahead', 'confirm', 'haan'])('%j is yes', (t) => {
    expect(readForgetConfirm(t)).toBe('yes');
  });

  it.each(['no', 'nope', 'cancel', 'stop', 'leave it', 'nahi'])('%j is no', (t) => {
    expect(readForgetConfirm(t)).toBe('no');
  });

  it.each(['maybe', 'i think so', 'what does that mean', 'yes but only the loan part', ''])(
    '%j is neither',
    (t) => {
      expect(readForgetConfirm(t)).toBeUndefined();
    },
  );
});

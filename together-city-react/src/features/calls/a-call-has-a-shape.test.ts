import { describe, it, expect } from 'vitest';
import { isCall } from './api';

/**
 * "INCOMING UNDEFINED CALL", FROM SOMEONE.
 *
 * Calls is the one feature that does not pass through the `apiGet` + zod
 * chokepoint, so both doors a call comes through — the `call_ringing` socket
 * frame and the `/calls/ringing` recovery fetch — accepted whatever arrived and
 * cast it to `Call`. The render guard checked truthiness, not shape. Any
 * truthy non-call (an HTML error page returned 200, a service-worker-cached
 * index.html, a partial frame) therefore produced a full-screen alertdialog
 * ringing at the citizen with the word "undefined" in it, whose Answer button
 * called `join(undefined)`.
 *
 * The failure mode worth remembering: it needed no bug on the happy path. Every
 * real call was fine. It took a bad *day* — a proxy, a stale worker, a deploy
 * mid-flight — for the app to start shouting at people.
 */
const CALL = {
  id: 'call_1',
  conversationId: 'c1',
  createdById: 'u1',
  type: 'audio',
  status: 'ringing',
  avatarId: null,
  startedAt: null,
  endedAt: null,
  endedReason: null,
  durationSeconds: null,
  createdAt: '2026-08-10T00:00:00.000Z',
  participants: [],
};

describe('a call has a shape', () => {
  it('accepts a real one', () => {
    expect(isCall(CALL)).toBe(true);
  });

  it('refuses every truthy thing that is not one', () => {
    // Each of these reached setCall before the guard existed.
    for (const junk of [
      '<!doctype html><html><body>Bad gateway</body></html>', // 200 with an error page
      '',                                                     // empty body, axios yields a string
      {},                                                     // parsed but empty
      { id: 'call_1' },                                       // partial socket frame
      { ...CALL, type: 'hologram' },                          // a type the UI cannot render
      { ...CALL, status: 'dialling' },                        // a status the UI cannot render
      { ...CALL, id: '' },                                    // join('') is join(nothing)
      { ...CALL, createdById: undefined },                    // "is this my own call?" unanswerable
      [CALL],                                                 // an array of calls is not a call
      0, 1, true, null, undefined,
    ]) {
      expect({ junk, isCall: isCall(junk) }).toEqual({ junk, isCall: false });
    }
  });
});

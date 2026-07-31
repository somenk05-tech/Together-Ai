import {
  blockDirection, blockedMessage, blockedWith, isBlockedPair,
  type BlockRow, type ConnectionBlockRow,
} from './blocking';

const A = 'user-a';
const B = 'user-b';
const C = 'user-c';

const block = (blockerId: string, blockedId: string): BlockRow => ({ blockerId, blockedId });
const conn = (userOneId: string, userTwoId: string, status = 'BLOCKED'): ConnectionBlockRow =>
  ({ userOneId, userTwoId, status });

describe('blockDirection', () => {
  it('knows nothing stands between two strangers', () => {
    expect(blockDirection(A, B, [], [])).toBe('none');
    expect(blockDirection(A, B, [block(A, C), block(C, B)], [])).toBe('none');
  });

  it('tells the blocker from the blocked', () => {
    expect(blockDirection(A, B, [block(A, B)])).toBe('i-blocked-them');
    expect(blockDirection(A, B, [block(B, A)])).toBe('they-blocked-me');
    expect(blockDirection(A, B, [block(A, B), block(B, A)])).toBe('both');
  });

  it('counts a connection-level block in both directions, because it records no direction', () => {
    expect(blockDirection(A, B, [], [conn(A, B)])).toBe('both');
    expect(blockDirection(B, A, [], [conn(A, B)])).toBe('both');
  });

  it('ignores connections that are not blocked', () => {
    expect(blockDirection(A, B, [], [conn(A, B, 'ACCEPTED')])).toBe('none');
    expect(blockDirection(A, B, [], [conn(A, B, 'PENDING')])).toBe('none');
    expect(blockDirection(A, B, [], [conn(A, B, 'REMOVED')])).toBe('none');
  });

  it('never reports a person as blocked with themselves', () => {
    expect(blockDirection(A, A, [block(A, A)])).toBe('none');
    expect(blockDirection('', B, [])).toBe('none');
  });
});

describe('isBlockedPair', () => {
  it('is true whichever of the two did it', () => {
    expect(isBlockedPair(A, B, [block(A, B)])).toBe(true);
    expect(isBlockedPair(A, B, [block(B, A)])).toBe(true);
    expect(isBlockedPair(A, B, [], [conn(B, A)])).toBe(true);
    expect(isBlockedPair(A, B, [block(A, C)])).toBe(false);
  });

  it('is symmetric — the answer cannot depend on who is asking', () => {
    const cases: [BlockRow[], ConnectionBlockRow[]][] = [
      [[block(A, B)], []],
      [[block(B, A)], []],
      [[], [conn(A, B)]],
      [[], [conn(A, B, 'ACCEPTED')]],
      [[], []],
    ];
    for (const [blocks, conns] of cases) {
      expect(isBlockedPair(A, B, blocks, conns)).toBe(isBlockedPair(B, A, blocks, conns));
    }
  });
});

describe('blockedWith', () => {
  it('gathers both directions and both sources', () => {
    const set = blockedWith(A, [block(A, B), block(C, A)], [conn(A, 'user-d')]);
    expect([...set].sort()).toEqual([B, C, 'user-d'].sort());
  });

  it('leaves out people the user has nothing to do with', () => {
    expect([...blockedWith(A, [block(B, C)], [conn(B, C)])]).toEqual([]);
  });

  it('never includes the user themselves', () => {
    expect(blockedWith(A, [block(A, A)], [conn(A, A)]).has(A)).toBe(false);
  });

  it('is empty for nobody', () => {
    expect(blockedWith('', [block(A, B)]).size).toBe(0);
  });
});

describe('blockedMessage', () => {
  it('tells the blocker what they did and where to undo it', () => {
    for (const d of ['i-blocked-them', 'both'] as const) {
      expect(blockedMessage(d)).toContain('You have blocked');
      // A place, not just an instruction. The first version of this said
      // "unblock them from their profile", which nobody could act on: a block
      // takes that profile out of the feed, out of search and out of your
      // circle. The screen it names now is /settings/blocked.
      expect(blockedMessage(d)).toContain('Blocked citizens');
    }
  });

  it('never tells someone they have been blocked', () => {
    for (const d of ['they-blocked-me', 'none'] as const) {
      const m = blockedMessage(d);
      expect(m.toLowerCase()).not.toContain('block');
      expect(m).toBe('This citizen is not accepting messages right now.');
    }
  });
});

import { REMOVED, VISIBLE, VISIBLE_ONLY, removedNotice, visibleToViewer } from './post-visibility';

const ME = 'me';
const THEM = 'them';

describe('visibleToViewer', () => {
  it('shows an ordinary post to anybody', () => {
    expect(visibleToViewer({ authorId: THEM, moderation: VISIBLE }, ME)).toBe(true);
  });

  it('treats a post with no moderation value as visible', () => {
    // Rows written before the column existed, and any read that did not select it.
    expect(visibleToViewer({ authorId: THEM }, ME)).toBe(true);
    expect(visibleToViewer({ authorId: THEM, moderation: null }, ME)).toBe(true);
  });

  it('hides a removed post from everybody else', () => {
    expect(visibleToViewer({ authorId: THEM, moderation: REMOVED }, ME)).toBe(false);
  });

  it('still shows a removed post to the person who wrote it', () => {
    expect(visibleToViewer({ authorId: ME, moderation: REMOVED }, ME)).toBe(true);
  });
});

describe('VISIBLE_ONLY', () => {
  it('is the shape a Prisma where clause wants', () => {
    expect({ ...VISIBLE_ONLY }).toEqual({ moderation: 'visible' });
  });
});

describe('removedNotice', () => {
  it('says what happened without naming who reported it', () => {
    const n = removedNotice();
    expect(n).toContain('removed by a moderator');
    expect(n).toContain('visible only to you');
    expect(n.toLowerCase()).not.toContain('reported by');
    expect(n.toLowerCase()).not.toContain('@');
  });
});

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..');

/**
 * Blocking stays joined up.
 *
 * The city shipped with two block tables and one gate that read only one of
 * them, so a citizen who blocked someone in the Social hub had their posts
 * hidden and went on receiving their messages. Nothing was broken in a way
 * anybody could see: the button worked, the posts disappeared, and the block
 * did not hold. connections/blocking.ts is now the single answer, and this
 * spec is what stops a second answer growing back.
 *
 * It checks two different things. First, that the four places a citizen can be
 * reached still consult the gate — a `git revert` of any one of them is the
 * likely way this regresses. Second, that nobody reads the Block table on
 * their own, because a hand-rolled read is how the first split happened: it
 * looks complete, and it silently omits the other half.
 */

function sourceFiles(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
    }
  })(SRC);
  return out;
}

const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** The body of a method, from its signature to the next one at the same depth. */
function methodBody(source: string, signature: string): string {
  const at = source.indexOf(signature);
  if (at < 0) return '';
  const end = source.indexOf('\n  }', at);
  return end < 0 ? source.slice(at) : source.slice(at, end);
}

/**
 * Every way one citizen reaches another, and the call that has to be in it.
 * A surface is on this list because being reached through it is contact:
 * a message, a request landing in someone's list, a face in a match stack,
 * a grid of someone's posts.
 */
const REACH = [
  {
    what: 'messages, calls and new conversations',
    file: 'connections/connection-permission.service.ts',
    method: 'async canCommunicate(',
    mustCall: 'this.blocking.isBlocked(',
  },
  {
    what: 'a dating-match chat, which needs no connection to exist',
    file: 'connections/connection-permission.service.ts',
    method: 'async assertCanPostToConversation(',
    mustCall: 'this.blocking.assertNotBlocked(',
  },
  {
    what: 'a connection request landing in someone’s list',
    file: 'connections/connections.service.ts',
    method: 'async request(',
    mustCall: 'this.blocking.assertNotBlocked(',
  },
  {
    what: 'the dating match stack, discover, and activity invites',
    file: 'dating/dating.service.ts',
    method: 'private async connectionExclusions(',
    mustCall: 'this.blocking.blockedWith(',
  },
  {
    what: 'someone’s public post grid',
    file: 'profile/profile.service.ts',
    method: 'async publicPosts(',
    mustCall: 'this.blocking.isBlocked(',
  },
  {
    what: 'the City Feed',
    file: 'social/social.service.ts',
    method: 'private async blockedWith(',
    mustCall: 'this.blocking.blockedWith(',
  },
];

/**
 * social.service.ts owns block/unblock/listBlocks — it is the writer, and a
 * writer has to touch its own table. Everybody else asks BlockingService.
 */
const MAY_TOUCH_BLOCK_TABLE = [
  'connections/blocking.service.ts',
  'social/social.service.ts',
];

describe('blocking reaches every surface', () => {
  for (const surface of REACH) {
    it(`${surface.what} consults the block gate`, () => {
      const body = methodBody(read(surface.file), surface.method);
      if (!body) throw new Error(`${surface.method} has gone missing from ${surface.file}`);
      expect(body).toContain(surface.mustCall);
    });
  }

  it('nobody reads the Block table on their own', () => {
    const offenders = sourceFiles()
      .filter((f) => /this\.prisma\.block\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .filter((f) => !MAY_TOUCH_BLOCK_TABLE.includes(f));

    if (offenders.length) {
      throw new Error([
        'These files query the Block table directly, which means they see a Social-hub',
        'block and miss a connection-level one — the exact split this module exists to',
        'close. Use BlockingService.isBlocked / blockedWith instead.',
        ...offenders.map((f) => `  - ${f}`),
      ].join('\n'));
    }
    expect(offenders).toEqual([]);
  });

  it('the gate itself refuses to be the thing that decides', () => {
    // connection-permission.service.ts must not grow its own block query back.
    // (The dating-match branch is the one that used to return early with no
    //  check at all, which is why it has its own entry in REACH above.)
    const gate = read('connections/connection-permission.service.ts');
    expect(gate).not.toMatch(/status:\s*ConnectionStatus\.BLOCKED/);
    expect(gate).toContain('this.blocking.');
  });
});

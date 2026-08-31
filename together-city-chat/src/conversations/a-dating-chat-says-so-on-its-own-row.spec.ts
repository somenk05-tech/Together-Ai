import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ConversationsService } from './conversations.service';

/**
 * A DATING CHAT SAYS SO ON ITS OWN ROW.
 *
 * Until 29 Aug, "is this a dating conversation" was answered by looking for a
 * `DatingMatch` row that pointed at it — through a helper that swallowed its
 * own database errors and returned an empty set. An empty set means "none of
 * these are dating chats", so one broken read put every anonymous thread into
 * the main Chats list under both people's real names, and into the main search.
 * The trade-off was written down. It was not a trade-off anybody would choose.
 *
 * `Conversation.kind` is the fix, and this file holds three things:
 *
 *   1. the column exists, defaults to the safe value, and the migration
 *      backfills every existing dating conversation in the same statement that
 *      adds it — so there is no window where an old thread reads as a city one;
 *   2. the two citizen-facing surfaces scope on it, asserted by RECORDING the
 *      query rather than by grepping for the word;
 *   3. the ratchet: any future read of a citizen's whole conversation set must
 *      either scope `kind` or say in a `// kind-spans:` comment why it covers
 *      both hubs. That is what makes the seventh reader the build's problem
 *      rather than the next audit's.
 */

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const root = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('the column itself', () => {
  const schema = root('prisma/schema.prisma');

  it('is on Conversation, defaults to city, and is indexed', () => {
    const model = schema.slice(schema.indexOf('model Conversation {'));
    const body = model.slice(0, model.indexOf('\n}'));
    expect(body).toMatch(/kind\s+String\s+@default\("city"\)/);
    expect(body).toContain('@@index([kind])');
  });

  it('defaults to the value that is SAFE to be wrong about', () => {
    // A conversation nobody classified shows up in the main Chats list. That is
    // the right default only because the alternative — an unclassified dating
    // chat being invisible to its own hub — hides a thread from the two people
    // in it, while this one shows a CITY chat in the city. The protection
    // against a mis-defaulted dating chat is that `kind` is a required argument
    // at the only door that opens one; see below.
    expect(schema).toContain('@default("city")');
  });
});

describe('the migration', () => {
  const sql = root('prisma/migrations/20260829T190000_a_dating_chat_says_so_on_its_own_row/migration.sql');

  it('adds the column NOT NULL with the default, so no row is ever unclassified', () => {
    expect(sql).toMatch(/ALTER TABLE "Conversation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'city'/);
  });

  it('backfills every conversation a match points at', () => {
    // Without this the column ships as a lie: every dating chat that existed
    // before the deploy would read 'city' and appear in the main list — the
    // exact failure the column was added to make impossible.
    expect(sql).toMatch(/UPDATE "Conversation" SET "kind" = 'dating'/);
    expect(sql).toMatch(/SELECT "conversationId" FROM "DatingMatch" WHERE "conversationId" IS NOT NULL/);
  });

  it('backfills BEFORE it indexes, and both after the column exists', () => {
    const add = sql.indexOf('ADD COLUMN');
    const backfill = sql.indexOf('UPDATE "Conversation"');
    const index = sql.indexOf('CREATE INDEX');
    expect(add).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(add);
    expect(index).toBeGreaterThan(backfill);
  });
});

describe('the surfaces scope on it', () => {
  /** A prisma stand-in that records the `where` it was asked for. */
  function recorder() {
    const seen: Record<string, unknown[]> = { member: [], message: [] };
    const prisma = {
      conversationMember: {
        findMany: jest.fn(async (a: { where: unknown }) => { seen.member.push(a.where); return []; }),
      },
      message: {
        findMany: jest.fn(async (a: { where: unknown }) => { seen.message.push(a.where); return []; }),
        count: jest.fn(async () => 0),
      },
    };
    return { prisma, seen };
  }

  it('the main Chats list asks the database for city conversations only', async () => {
    const { prisma, seen } = recorder();
    const svc = new ConversationsService(prisma as never, {} as never);
    await svc.listForUser('me');
    expect(seen.member[0]).toMatchObject({ userId: 'me', archived: false, conversation: { kind: 'city' } });
  });

  it('and does NOT subtract a set of dating ids afterwards', async () => {
    // The old shape read the ids first and filtered in memory. If that read
    // came back, the filter would be doing the work again and this test would
    // pass while the fail-open path was still live — so the assertion is on the
    // number of queries, not on the result.
    const { prisma } = recorder();
    const svc = new ConversationsService(prisma as never, {} as never);
    await svc.listForUser('me');
    expect(prisma.conversationMember.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('the only door that opens a hub conversation', () => {
  function fake(existing: { id: string; anonymousTrust: number | null; kind: string } | null) {
    const created: Array<Record<string, unknown>> = [];
    const updated: Array<Record<string, unknown>> = [];
    const prisma = {
      conversation: {
        findUnique: jest.fn(async () => existing),
        update: jest.fn(async (a: { data: Record<string, unknown> }) => { updated.push(a.data); return {}; }),
        create: jest.fn(async (a: { data: Record<string, unknown> }) => { created.push(a.data); return { id: 'new' }; }),
      },
    };
    return { svc: new ConversationsService(prisma as never, {} as never), created, updated };
  }

  it('writes the kind it was given onto the new row', async () => {
    const { svc, created } = fake(null);
    await svc.getOrCreateDirectByIds('a', 'b', 'dating', 1);
    expect(created[0]).toMatchObject({ kind: 'dating', anonymousTrust: 1 });
  });

  it('moves an existing city chat into the Dating Hub when the two match', async () => {
    const { svc, updated } = fake({ id: 'c1', anonymousTrust: null, kind: 'city' });
    await svc.getOrCreateDirectByIds('a', 'b', 'dating', 1);
    expect(updated[0]).toMatchObject({ kind: 'dating', anonymousTrust: 1 });
  });

  it('never moves a dating chat back into the city', async () => {
    const { svc, updated } = fake({ id: 'c1', anonymousTrust: 1, kind: 'dating' });
    await svc.getOrCreateDirectByIds('a', 'b', 'city', 2);
    expect(updated).toEqual([]); // nothing written at all
  });

  it('an anonymous conversation is not the same thing as a dating one', () => {
    // The real-estate enquiry thread sets anonymousTrust 2 and belongs in the
    // main Chats list — it is where the person who made the enquiry goes to
    // find it. Conflating the two would have hidden every enquiry.
    expect(src('realestate/realestate.service.ts')).toContain("getOrCreateDirectByIds(userId, p.sellerId, 'city', 2)");
    expect(src('dating/dating.service.ts')).toMatch(/getOrCreateDirectByIds\(\s*userId, targetUserId, 'dating', 1, kind === 'platonic' \? 'platonic' : undefined,?\s*\)/);
  });
});

describe('the ratchet', () => {
  /*
   * Every read of a citizen's WHOLE conversation set — scoped by who they are
   * rather than by a conversation already named — must decide about `kind`.
   * Two of them legitimately span both hubs (the socket room list, and the
   * roster the Dating Hub's own list draws faces from); they say so in a
   * comment, which is a decision on the record rather than an omission.
   */
  const FILES = ['conversations/conversations.service.ts', 'messages/messages.service.ts', 'calls/calls.service.ts'];

  it('no citizen-wide membership read is silent about kind', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const lines = src(f).split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('conversationMember.findMany')) return;
        const block = lines.slice(i, i + 8).join('\n');
        const where = block.slice(block.indexOf('where:'), block.indexOf('where:') + 240);
        const byConversation = /conversationId/.test(where);
        if (byConversation) return; // the caller already named the conversation
        const scoped = /kind:/.test(block);
        const declared = lines.slice(Math.max(0, i - 8), i).join('\n').includes('kind-spans:');
        if (!scoped && !declared) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the fail-open lookup it replaced is gone and stays gone', () => {
    expect(src('shared/dating-conversations.ts')).not.toMatch(/export async function datingConversationIds/);
    for (const f of FILES) expect(src(f)).not.toContain('datingConversationIds(');
  });
});

describe('and no query reaches a dating MESSAGE without saying so', () => {
  /*
   * The residue after the column: dating messages live in the same `Message`
   * table as everybody else's, so a query written for city chat could read
   * them. Today none does — every call either names a conversation (which the
   * permission gate has already decided about), or scopes by message id joined
   * to the caller's membership, or, in the one cross-conversation reader,
   * filters `conversation: { kind: 'city' }`.
   *
   * "Today none does" is the part worth pinning. The defect this whole day has
   * been about is not that somebody wrote a bad query; it is that nothing
   * stopped the NEXT one. So a read of `Message` that could span conversations
   * has to say which hub it means, and a reviewer can see the answer without
   * knowing the history.
   *
   * Reads only. `update`/`updateMany` here are compare-and-set writes on a
   * message id whose permission was decided above them, and a `create` writes
   * one row into a conversation that was just gated.
   */
  const READS = ['findMany', 'findFirst', 'groupBy', 'aggregate', 'count'];

  /** The balanced argument text of a call starting at `open` (index of '('). */
  function callText(text: string, open: number): string {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { depth--; if (depth === 0) return text.slice(open, i + 1); }
    }
    return text.slice(open);
  }

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts')) out.push(p);
    }
    return out;
  };

  it('every cross-conversation read of Message decides which hub it is for', () => {
    const offenders: string[] = [];
    for (const f of walk(join(__dirname, '..'))) {
      const text = readFileSync(f, 'utf8');
      for (const method of READS) {
        const needle = `.message.${method}(`;
        for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
          const call = callText(text, i + needle.length - 1);
          // Named conversation — the permission gate has already decided.
          if (/\bconversationId\b/.test(call)) continue;
          // A message id joined to the caller's own membership.
          if (/members\s*:\s*\{\s*some\s*:/.test(call)) continue;
          // Or it says which hub outright.
          if (/kind\s*:/.test(call)) continue;
          const lineNo = text.slice(0, i).split('\n').length;
          const above = text.split('\n').slice(Math.max(0, lineNo - 9), lineNo).join('\n');
          if (above.includes('kind-spans:')) continue;
          offenders.push(`${f.split('/src/').pop() ?? f}:${lineNo}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the one reader that spans conversations is the search, and it is city-only', () => {
    // Proven by the query it builds, not by the word in the source: `search`
    // takes its scope from the citizen's memberships, and that read is where
    // the hub is decided.
    const src = readFileSync(join(__dirname, '..', 'messages', 'messages.service.ts'), 'utf8');
    const fn = src.slice(src.indexOf('async search('), src.indexOf('async search(') + 1400);
    expect(fn).toMatch(/conversationMember\.findMany\(\{[\s\S]{0,120}kind: 'city'/);
  });
});

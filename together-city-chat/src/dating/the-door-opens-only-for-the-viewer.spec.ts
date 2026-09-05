/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DatingService } from './dating.service';
import { DatingController } from './dating.controller';
import { isSealedCardId, openCardId, sealCardId } from './card-id';

/**
 * ── THE DOOR OPENS ONLY FOR THE VIEWER (fifth audit, H3, closed 31 Aug) ─────
 *
 * The id on a card, a chat row and an undo result is now sealed to the viewer
 * (card-id.ts), and every `:targetUserId` route a citizen can call resolves
 * it before the service sees an id. A raw id survives for one reason only —
 * a DatingMatch row already links the pair — so notification links written
 * before the seal keep working and a matched pair, who already share real ids
 * in their chat, lose nothing; a raw id for a stranger is the hub's 404.
 *
 * `@handle → /users/lookup → id → /dating/matches/:id` is closed by this
 * file's second describe. The first holds what the routes hand out.
 */

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

function svcWith(prisma: any, secret?: string) {
  const svc: any = Object.create(DatingService.prototype);
  svc.prisma = prisma;
  if (secret) svc.config = { get: (k: string) => (k === 'jwt.accessSecret' ? secret : undefined) };
  return svc;
}

describe('what the routes hand out is sealed', () => {
  it('cardIdentity seals the id to the viewer and keeps the chosen name', () => {
    const svc = svcWith({}, 'access-secret');
    const card = svc.cardIdentity('viewer', { id: 'real-id', name: 'Angel' }, { firstName: 'priya' });
    expect(card.name).toBe('Priya');
    expect(card.id).not.toBe('real-id');
    expect(isSealedCardId(card.id)).toBe(true);
    expect(openCardId('access-secret', 'viewer', card.id)).toBe('real-id');
    expect(openCardId('access-secret', 'someone-else', card.id)).toBeNull();
  });

  it('a hand-built service without a config still seals — with a key nobody knows', () => {
    const svc = svcWith({});
    const a = svc.cardIdentity('viewer', { id: 'real-id', name: 'Angel' }, {});
    const b = svc.cardIdentity('viewer', { id: 'real-id', name: 'Angel' }, {});
    expect(a.id).toBe(b.id);            // deterministic within the process
    expect(isSealedCardId(a.id)).toBe(true);
    expect(openCardId('access-secret', 'viewer', a.id)).toBeNull(); // not the configured secret
  });

  it('every card, chat row and undo result goes through the seal', () => {
    const src = code(read('dating.service.ts'));
    expect((src.match(/this\.cardIdentity\(userId, cand\.user, /g) ?? []).length).toBe(3);
    expect(src).toMatch(/otherUserId: sealCardId\(this\.cardSecret\(\), userId, otherId\)/);
    expect(src).toMatch(/targetUserId: sealCardId\(this\.cardSecret\(\), userId, targetId\)/);
    // No card ships a raw id any more.
    expect(src).not.toMatch(/return \{ id: user\.id, name: shownName/);
  });
});

describe('the door opens only for the viewer', () => {
  const secret = 'access-secret';

  it('opens a sealed id minted for this viewer', async () => {
    const svc = svcWith({ datingMatch: { findFirst: jest.fn() } }, secret);
    const token = sealCardId(secret, 'me', 'them');
    await expect(svc.resolveTarget('me', token)).resolves.toBe('them');
    expect(svc.prisma.datingMatch.findFirst).not.toHaveBeenCalled();
  });

  it('refuses another viewer’s token with the uniform 404', async () => {
    const svc = svcWith({ datingMatch: { findFirst: jest.fn() } }, secret);
    const theirs = sealCardId(secret, 'somebody-else', 'them');
    await expect(svc.resolveTarget('me', theirs)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a raw id for a stranger — the handle lookup goes nowhere', async () => {
    const svc = svcWith({ datingMatch: { findFirst: jest.fn(async () => null) } }, secret);
    await expect(svc.resolveTarget('me', 'looked-up-coworker')).rejects.toBeInstanceOf(NotFoundException);
    expect(svc.prisma.datingMatch.findFirst).toHaveBeenCalledWith({ where: { userOneId: 'looked-up-coworker', userTwoId: 'me', status: 'matched' }, select: { id: true } });
  });

  it('accepts a raw id for a pair that has MATCHED — they already share real ids in their chat', async () => {
    const svc = svcWith({ datingMatch: { findFirst: jest.fn(async () => ({ id: 'm1' })) } }, secret);
    await expect(svc.resolveTarget('me', 'them')).resolves.toBe('them');
  });

  /**
   * ONLY A MATCH SHARES REAL IDS (launch gate, third reading, 4 Sep). A
   * `pending` row is what like() and pass() write on the first tap, so
   * accepting a raw id on ANY row let somebody probe a suspect's real id and
   * learn, from 200 vs 404, that the suspect has a dating profile and has
   * liked or passed them. The query names `status: 'matched'`, and the
   * fixture below proves a pending-only pair is a stranger to this door.
   */
  it('refuses a raw id for a pair linked only by a pending like or pass', async () => {
    const rows = [{ id: 'm1', userOneId: 'me', userTwoId: 'them', status: 'pending' }];
    const findFirst = jest.fn(async ({ where }: { where: { userOneId: string; userTwoId: string; status?: string } }) =>
      rows.find((r) => r.userOneId === where.userOneId && r.userTwoId === where.userTwoId && (!where.status || r.status === where.status)) ?? null);
    const svc = svcWith({ datingMatch: { findFirst } }, secret);
    await expect(svc.resolveTarget('me', 'them')).rejects.toBeInstanceOf(NotFoundException);
    rows[0].status = 'matched';
    await expect(svc.resolveTarget('me', 'them')).resolves.toBe('them');
  });

  it('lets your own id through so the writers can say "That is you."', async () => {
    const svc = svcWith({ datingMatch: { findFirst: jest.fn() } }, secret);
    await expect(svc.resolveTarget('me', 'me')).resolves.toBe('me');
  });
});

describe('every citizen route resolves before the service is called', () => {
  it('the controller hands the service the opened id, not the token', async () => {
    const dating: any = {
      resolveTarget: jest.fn(async () => 'real'),
      like: jest.fn(async () => ({ matched: false })),
      pass: jest.fn(async () => ({ ok: true })),
      matchDetail: jest.fn(async () => ({})),
      blockMatch: jest.fn(async () => ({ blocked: true })),
    };
    const c = new DatingController(dating);
    const user = { sub: 'me' } as any;
    await c.like(user, 'dv1_token', { kind: 'romantic' });
    await c.pass(user, 'dv1_token', { kind: 'romantic' });
    await c.matchDetail(user, 'dv1_token', { kind: 'romantic' });
    await c.blockMatch(user, 'dv1_token', { kind: 'romantic' });
    expect(dating.resolveTarget).toHaveBeenCalledTimes(4);
    expect(dating.resolveTarget).toHaveBeenCalledWith('me', 'dv1_token');
    expect(dating.like).toHaveBeenCalledWith('me', 'real', 'romantic');
    expect(dating.pass).toHaveBeenCalledWith('me', 'real', 'romantic');
    expect(dating.matchDetail).toHaveBeenCalledWith('me', 'real', 'romantic');
    expect(dating.blockMatch).toHaveBeenCalledWith('me', 'real', 'romantic');
  });

  it('all nine citizen routes resolve; the moderator route keeps raw ids', () => {
    const src = code(read('dating.controller.ts'));
    for (const call of ['matchDetail(', 'like(', 'connect(', 'unmatch(', 'reveal(', 'pass(', 'blockMatch(', 'reportMatch(']) {
      const re = new RegExp(`this\\.dating\\.${call.replace('(', '\\(')}user\\.sub, await this\\.dating\\.resolveTarget\\(user\\.sub, targetUserId\\)`, 'g');
      expect(src).toMatch(re);
    }
    expect((src.match(/await this\.dating\.resolveTarget\(user\.sub, targetUserId\)/g) ?? []).length).toBe(9);
    expect(src).toMatch(/this\.dating\.moderateDecision\(user\.sub, targetUserId, dto\.decision, dto\.reason\)/);
  });
});

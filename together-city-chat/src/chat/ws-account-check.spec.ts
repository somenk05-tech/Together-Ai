import { ChatGateway } from './chat.gateway';
import { TokenService } from '../auth/token.service';

/**
 * A socket is authenticated by signature AND account. (26 Aug launch audit.)
 *
 * The HTTP side has refused deleted, suspended and revoked sessions since
 * JwtStrategy.issuedAfter; the gateway checked only that the token was
 * signed, so a banned citizen with a still-valid access token kept a live
 * socket for the token's whole lifetime, and "sign out everywhere" did not
 * reach the tab that was open. The gateway now asks TokenService for both at
 * connect, and again on an interval while the socket lives.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

describe('TokenService.assertAccountLive', () => {
  const svc = (user: Record<string, unknown> | null) => {
    const t: any = Object.create(TokenService.prototype);
    t.prisma = { user: { findUnique: async () => user } };
    return t as TokenService;
  };
  const live = { id: 'u1', deletedAt: null, suspendedAt: null, sessionsRevokedAt: null };

  it('passes a live account', async () => {
    await expect(svc(live).assertAccountLive({ sub: 'u1', iat: 100 })).resolves.toBeUndefined();
  });

  it('refuses a deleted, suspended or missing account', async () => {
    await expect(svc({ ...live, deletedAt: new Date() }).assertAccountLive({ sub: 'u1', iat: 100 })).rejects.toThrow(/deleted/);
    await expect(svc({ ...live, suspendedAt: new Date() }).assertAccountLive({ sub: 'u1', iat: 100 })).rejects.toThrow(/suspended/);
    await expect(svc(null).assertAccountLive({ sub: 'u1', iat: 100 })).rejects.toThrow(/no longer exists/);
  });

  it('refuses a token issued before "sign out everywhere", and one with no issue time at all', async () => {
    const revokedAt = new Date('2026-08-26T10:00:00Z');
    const s = svc({ ...live, sessionsRevokedAt: revokedAt });
    const at = Math.floor(revokedAt.getTime() / 1000);
    await expect(s.assertAccountLive({ sub: 'u1', iat: at - 1 })).rejects.toThrow(/revoked/);
    await expect(s.assertAccountLive({ sub: 'u1' })).rejects.toThrow(/revoked/);
    await expect(s.assertAccountLive({ sub: 'u1', iat: at })).resolves.toBeUndefined();
  });
});

describe('the gateway', () => {
  function build(verify: () => Promise<unknown>) {
    const g: any = Object.create(ChatGateway.prototype);
    g.logger = { log: () => undefined, warn: () => undefined };
    g.tokens = { verifyAccessAndAccount: verify, assertAccountLive: async () => undefined };
    g.presence = { markOnline: async () => false, markOffline: async () => false };
    g.messages = { conversationIdsFor: async () => [], deliverBacklog: async () => 0, pendingForUser: async () => [] };
    g.bus = { publish: () => undefined };
    g.redis = { setOpenConversation: async () => undefined };
    const clientOut: unknown[] = [];
    let disconnected = false;
    const client: any = {
      id: 's1', handshake: { auth: { token: 't' }, headers: {} },
      join: async () => undefined, emit: (e: string, p: unknown) => clientOut.push({ e, p }),
      disconnect: () => { disconnected = true; },
    };
    return { g, client, clientOut, state: () => ({ disconnected }) };
  }

  it('refuses the connection when the account check fails, even with a valid signature', async () => {
    const { g, client, clientOut, state } = build(async () => { throw new Error('account suspended'); });
    await g.handleConnection(client);
    expect(state().disconnected).toBe(true);
    expect(clientOut).toEqual([{ e: 'error_event', p: { message: 'Unauthorized' } }]);
  });

  it('keeps re-checking an open socket and closes it the moment the account is not live', async () => {
    jest.useFakeTimers();
    try {
      const { g, client, state } = build(async () => ({ sub: 'u1', handle: 'h', iat: 1 }));
      let alive = true;
      g.tokens.assertAccountLive = async () => { if (!alive) throw new Error('account suspended'); };
      await g.handleConnection(client);
      expect(client.recheck).toBeDefined();
      alive = false;
      jest.advanceTimersByTime(60_000);
      await Promise.resolve(); await Promise.resolve();
      expect(state().disconnected).toBe(true);
      await g.handleDisconnect(client);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the socket send ceiling', () => {
  it('lets sixty through in a minute and refuses the sixty-first, then resets', async () => {
    const g: any = Object.create(ChatGateway.prototype);
    const sent: unknown[] = [];
    const errors: unknown[] = [];
    g.messages = { send: async () => { sent.push(1); return { id: 'm' }; } };
    const client: any = { userId: 'u1', emit: (e: string, p: unknown) => { if (e === 'error_event') errors.push(p); } };
    const body = { conversationId: '11111111-1111-4111-8111-111111111111', clientId: 'c', text: 'hi' };
    for (let i = 0; i < 61; i += 1) await g.onSend(client, body);
    expect(sent).toHaveLength(60);
    expect(errors).toHaveLength(1);
    // A minute later the window starts over.
    client.sendWindow.startedAt -= 60_000;
    await g.onSend(client, body);
    expect(sent).toHaveLength(61);
  });
});

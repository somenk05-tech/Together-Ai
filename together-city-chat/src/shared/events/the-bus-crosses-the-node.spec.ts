import { ChatEventBus, type ChatEvent } from './chat-events';

/**
 * TWO NODES, ONE CITY.
 *
 * `ChatEventBus` was an in-process `EventEmitter` while Socket.IO's Redis
 * adapter carried room broadcasts across instances — so on a second replica the
 * room heard a message everywhere and everything the gateway does OFF the bus
 * (the badge frame, the bell row, the push, pulling recipients into a room they
 * had not joined) happened only on the node that handled the send. Half the
 * city's notifications, silently, with nothing in a log.
 *
 * These build TWO buses over one fake Redis — which is the only way to test
 * this at all, since the defect is invisible inside a single process.
 */

/** The smallest Redis that can be wrong in the ways that matter. */
function fakeRedis() {
  const subscribers: Array<{ channel: string | null; on: Map<string, (...a: never[]) => void> }> = [];
  const published: string[] = [];
  const make = (): unknown => {
    const self = { channel: null as string | null, on: new Map<string, (...a: never[]) => void>() };
    subscribers.push(self);
    return {
      duplicate: () => make(),
      connect: async () => undefined,
      subscribe: async (c: string) => { self.channel = c; },
      quit: async () => { self.channel = null; },
      on: (ev: string, cb: (...a: never[]) => void) => { self.on.set(ev, cb); },
      publish: async (channel: string, payload: string) => {
        published.push(payload);
        for (const s of subscribers) {
          if (s.channel === channel) (s.on.get('message') as ((c: string, p: string) => void) | undefined)?.(channel, payload);
        }
      },
    };
  };
  const raw = make();
  return { service: { raw } as never, published };
}

const event: ChatEvent = { kind: 'message.created', conversationId: 'c1', message: { id: 'm1' }, recipientIds: ['u2'] };

/** ioredis connects asynchronously; the subscribe is a promise chain. */
const settled = () => new Promise((r) => setImmediate(r));

describe('a chat event reaches the other instance', () => {
  it('is handled once on the node that published it', async () => {
    const { service } = fakeRedis();
    const a = new ChatEventBus(service);
    await settled();
    const heard: ChatEvent[] = [];
    a.subscribe((e) => heard.push(e));
    a.publish(event);
    await settled();
    // Once — not twice. The publisher emits locally AND publishes, so without
    // the origin check the node that sent it would file two bell rows and send
    // two pushes for one message.
    expect(heard).toEqual([event]);
  });

  it('is handled on a node that did not publish it', async () => {
    const { service } = fakeRedis();
    const a = new ChatEventBus(service);
    const b = new ChatEventBus(service);
    await settled();
    const heard: ChatEvent[] = [];
    b.subscribe((e) => heard.push(e));
    a.publish(event);
    await settled();
    expect(heard).toEqual([event]);
  });

  it('the two nodes together handle it exactly once each — no duplicate push', async () => {
    const { service } = fakeRedis();
    const a = new ChatEventBus(service);
    const b = new ChatEventBus(service);
    await settled();
    const onA: ChatEvent[] = []; const onB: ChatEvent[] = [];
    a.subscribe((e) => onA.push(e));
    b.subscribe((e) => onB.push(e));
    a.publish(event);
    await settled();
    expect(onA).toHaveLength(1);
    expect(onB).toHaveLength(1);
  });

  it('still works with no Redis at all, which is a legitimate deployment', async () => {
    const bus = new ChatEventBus();
    const heard: ChatEvent[] = [];
    bus.subscribe((e) => heard.push(e));
    bus.publish(event);
    expect(heard).toEqual([event]);
  });

  it('delivers locally even when the publish fails', async () => {
    // A Redis outage must not stop the node in front of the citizen from doing
    // the work. This is the property that makes the fan-out an ADDITION.
    const broken = { raw: {
      duplicate: () => ({ connect: async () => { throw new Error('down'); }, subscribe: async () => undefined, on: () => undefined, quit: async () => undefined }),
      publish: async () => { throw new Error('down'); },
    } } as never;
    const bus = new ChatEventBus(broken);
    await settled();
    const heard: ChatEvent[] = [];
    bus.subscribe((e) => heard.push(e));
    bus.publish(event);
    await settled();
    expect(heard).toEqual([event]);
  });

  it('drops a frame it cannot decode instead of throwing into the socket layer', async () => {
    const { service } = fakeRedis();
    const bus = new ChatEventBus(service);
    await settled();
    const heard: ChatEvent[] = [];
    bus.subscribe((e) => heard.push(e));
    expect(() => (bus as unknown as { receive(c: string, p: string): void }).receive('chat:events', 'not json')).not.toThrow();
    expect(heard).toEqual([]);
  });
});

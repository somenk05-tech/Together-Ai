import { QueueService } from './queue.service';

/**
 * With no Redis the queue is simply off: `add` says so and callers run the
 * work themselves. Handlers register regardless, so the moment a queue
 * exists the same functions serve it.
 */
describe('the queue, off', () => {
  it('reports itself off and refuses nothing loudly', async () => {
    const q = new QueueService({ get: () => '' } as never);
    await q.onModuleInit();
    expect(q.enabled).toBe(false);
    expect(await q.add('x', {})).toBe(false);
    expect(await q.schedule('x', '* * * * *')).toBe(false);
    q.handle('x', async () => undefined);
    await q.onModuleDestroy();
  });
});

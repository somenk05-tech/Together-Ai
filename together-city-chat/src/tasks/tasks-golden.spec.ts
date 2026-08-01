/**
 * Golden master — the three background jobs' decisions. The shared contract
 * being recorded: a failing job LOGS and SURVIVES; it never takes down the
 * process that is also sending medicine reminders.
 */
import { RetentionService } from './retention.service';
import { MedicineRemindersService } from './medicine-reminders.service';
import { StaleCallsService } from './stale-calls.service';

describe('tasks golden master', () => {
  afterEach(() => jest.restoreAllMocks());

  it('credential sweep: four tables, one grace cutoff, a missing model is zero and a failing one is survived', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-01T21:00:00Z').getTime());
    const svc = Object.create(RetentionService.prototype) as RetentionService;
    const logs: string[] = [];
    const wheres: Record<string, unknown> = {};
    const model = (name: string, fail = false) => ({
      deleteMany: async (a: { where: unknown }) => { wheres[name] = a.where; if (fail) throw new Error('db'); return { count: name.length }; },
    });
    (svc as any).logger = { log: (m: string) => logs.push(m), warn: (m: string) => logs.push('WARN ' + m), error: () => undefined };
    (svc as any).prisma = {
      refreshToken: model('refreshToken'),
      verificationToken: model('verificationToken', true), // this one fails tonight
      recoveryCode: model('recoveryCode'),
      // passwordReset intentionally absent — a schema drift must read as zero, not a crash
    };
    await svc.sweepExpiredCredentials();
    expect({ wheres, logs }).toMatchSnapshot();
  });

  it('account purge: aggregates the night into one line and names the incomplete', async () => {
    const svc = Object.create(RetentionService.prototype) as RetentionService;
    const logs: string[] = [];
    (svc as any).logger = { log: (m: string) => logs.push(m), error: (m: string) => logs.push('ERROR ' + m) };
    (svc as any).purge = { sweep: async () => [
      { rowsDeleted: 120, objectsDeleted: 4, stuck: [] },
      { rowsDeleted: 3, objectsDeleted: 0, stuck: ['MedicalRecord'] },
    ] };
    await svc.purgeDeletedAccounts();
    (svc as any).purge = { sweep: async () => { throw new Error('db unreachable'); } };
    await svc.purgeDeletedAccounts(); // must not throw
    expect(logs).toMatchSnapshot();
  });

  it('medicine dispatch: sends each due reminder once, counts only real sends, survives a dead read', async () => {
    const svc = Object.create(MedicineRemindersService.prototype) as MedicineRemindersService;
    const logs: string[] = [];
    (svc as any).logger = { log: (m: string) => logs.push(m), warn: (m: string) => logs.push('WARN ' + m) };
    (svc as any).prescriptions = {
      dueReminders: async () => ['a', 'b', 'c'],
      dispatchReminder: async (r: string) => r !== 'b', // b was claimed by an earlier pass
    };
    await svc.dispatchDue();
    (svc as any).prescriptions = { dueReminders: async () => { throw new Error('db'); } };
    await svc.dispatchDue(); // must not throw
    expect(logs).toMatchSnapshot();
  });

  it('stale calls: closes the abandoned ring, stays quiet at zero, survives a failure', async () => {
    const svc = Object.create(StaleCallsService.prototype) as StaleCallsService;
    const logs: string[] = [];
    (svc as any).logger = { log: (m: string) => logs.push(m), warn: (m: string) => logs.push('WARN ' + m) };
    (svc as any).calls = { sweepStale: async () => 2 };
    await svc.sweep();
    (svc as any).calls = { sweepStale: async () => 0 };
    await svc.sweep();
    (svc as any).calls = { sweepStale: async () => { throw new Error('db'); } };
    await svc.sweep(); // must not throw
    expect(logs).toMatchSnapshot();
  });
});

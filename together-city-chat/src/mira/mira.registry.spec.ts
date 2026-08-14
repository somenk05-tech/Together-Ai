import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { MetadataScanner } from '@nestjs/core';
import { Controller, Get } from '@nestjs/common';
import { MiraRegistry } from './mira.registry';
import { Mira } from './mira.decorator';

@Controller('wallet')
class RealController {
  @Mira({ intent: 'Tell the citizen their balance', utterances: ['my balance'], risk: 'R0' })
  @Get('balance')
  balance(): string { return '₹0'; }

  @Get('untouched')
  untouched(): string { return 'not hers'; }
}

/** Nest's own shape, as far as this class reads it. `metatype` is typed
 *  `Type | Function | null` upstream — the null is the whole point of this file. */
type Wrapper = { name: string; instance: unknown; metatype: unknown };
const discovery = (wrappers: Wrapper[]) =>
  ({ getControllers: () => wrappers }) as unknown as ConstructorParameters<typeof MiraRegistry>[0];

const build = (wrappers: Wrapper[]) =>
  new MiraRegistry(discovery(wrappers), new MetadataScanner(), new Reflector());

const real: Wrapper = { name: 'RealController', instance: new RealController(), metatype: RealController };

describe('the registry reads what is actually mounted', () => {
  it('finds a decorated handler and leaves an undecorated one alone', () => {
    const r = build([real]);
    r.onModuleInit();
    expect(r.all().map((c) => c.id)).toEqual(['wallet GET balance']);
    expect(r.all()[0].path).toBe('wallet/balance');
    expect(r.all()[0].intent).toMatch(/balance/i);
  });

  it('filters by risk', () => {
    const r = build([real]);
    r.onModuleInit();
    expect(r.upTo('R0')).toHaveLength(1);
    expect(r.byId('wallet GET balance')?.method).toBe('GET');
  });
});

/**
 * THIS METHOD MUST NOT BE ABLE TO STOP THE API FROM BOOTING — and it could.
 *
 * `onModuleInit` throwing aborts Nest's bootstrap. The container never becomes
 * healthy, and the host keeps the PREVIOUS release serving. From outside,
 * everything looks fine: /api/health returns 200, every endpoint answers, and
 * the only symptom is that a deploy has silently no effect.
 *
 * The throw was one cast. `wrapper.metatype` can be null, and
 * `Reflect.getMetadata(key, null)` does not return undefined — it throws a
 * TypeError. It was written `wrapper.metatype as never` to stop the compiler
 * objecting, which is exactly how the null case was hidden from the person
 * writing it.
 *
 * Nothing caught it because a unit test never builds a Nest container, and every
 * wrapper in a hand-made fixture has a metatype. So these fixtures deliberately
 * do not.
 */
describe('and it cannot take the API down with it', () => {
  it('survives a controller wrapper with no metatype', () => {
    const r = build([{ name: 'Weird', instance: {}, metatype: null }, real]);
    expect(() => r.onModuleInit()).not.toThrow();
    // …and still finds the real one. Skipping the broken wrapper must not
    // abandon the scan.
    expect(r.all().map((c) => c.id)).toEqual(['wallet GET balance']);
  });

  it('survives a wrapper with no instance', () => {
    const r = build([{ name: 'Empty', instance: null, metatype: RealController }, real]);
    expect(() => r.onModuleInit()).not.toThrow();
    expect(r.all()).toHaveLength(1);
  });

  it('survives an instance whose prototype is bare', () => {
    const r = build([{ name: 'Bare', instance: Object.create(null), metatype: RealController }, real]);
    expect(() => r.onModuleInit()).not.toThrow();
  });

  /**
   * AND IF THE WHOLE SCAN FAILS, THE PROCESS STILL COMES UP.
   *
   * The asymmetry is not close: Mira with no capabilities is a degraded
   * assistant; an API that will not boot is the whole city. A feature this
   * optional may never be load-bearing for the process — so the outer catch is
   * the guard that matters, and the specific null check above is only the one
   * failure already paid for.
   */
  it('comes up empty rather than not at all when discovery itself throws', () => {
    const exploding = { getControllers: () => { throw new Error('graph is on fire'); } };
    const r = new MiraRegistry(
      exploding as unknown as ConstructorParameters<typeof MiraRegistry>[0],
      new MetadataScanner(),
      new Reflector(),
    );
    expect(() => r.onModuleInit()).not.toThrow();
    expect(r.all()).toEqual([]);
  });

  /** The registry is useless in that state, and says so where an operator will
   *  see it — the boot log — rather than failing quietly. */
  it('says so in the log rather than failing quietly', () => {
    const exploding = { getControllers: () => { throw new Error('graph is on fire'); } };
    const r = new MiraRegistry(
      exploding as unknown as ConstructorParameters<typeof MiraRegistry>[0],
      new MetadataScanner(),
      new Reflector(),
    );
    const seen: string[] = [];
    // @ts-expect-error — reaching past `private` on purpose; the log line IS the
    // operator-facing behaviour here, so it is worth asserting.
    r.logger = { error: (m: string) => seen.push(m), log: (m: string) => seen.push(m) };
    r.onModuleInit();
    expect(seen.join(' ')).toMatch(/capability scan failed/i);
    expect(seen.join(' ')).toMatch(/the API is up/i);
  });
});

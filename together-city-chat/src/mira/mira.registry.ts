import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { MIRA_CAPABILITY, type MiraCapability, type Risk } from './mira.decorator';

export interface Capability extends MiraCapability {
  id: string;
  method: string;
  /** Full path as the API serves it, without the /api prefix. */
  path: string;
  controller: string;
}

const ORDER: Risk[] = ['R0', 'R1', 'R2', 'R3', 'R4'];
const METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET', [RequestMethod.POST]: 'POST', [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE', [RequestMethod.PATCH]: 'PATCH',
};

/**
 * What Mira may want, read from the decorators AT RUNTIME.
 *
 * ── Why this exists, and what it replaces ─────────────────────────────────
 *
 * The first version read `@Mira()` by parsing the controller SOURCE, reusing
 * `route-inventory.ts`. That works in dev and in every spec, and it is empty in
 * production: `start:prod` is `node dist/main.js`, `dist/` holds compiled `.js`,
 * and `controllerFiles()` globs for `*.controller.ts`. Nothing matched, the
 * manifest came back with zero entries, and Mira answered every question with
 * the navigation fallback instead of the answer — a defect that no test could
 * see, because tests run against source.
 *
 * `route-inventory.ts` was only ever consumed by specs. Reusing it in a service
 * built a RUNTIME dependency on a BUILD-TIME mechanism, and the two look
 * identical until the code is deployed.
 *
 * So the runtime path reads real metadata off the real handlers. The source
 * parse stays where it belongs — in `manifest.ts`, used by the build gates,
 * which are about what is WRITTEN and are correct to read the source.
 */
@Injectable()
export class MiraRegistry implements OnModuleInit {
  private readonly logger = new Logger('MiraRegistry');
  private caps: Capability[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  /**
   * ── THIS METHOD MUST NOT BE ABLE TO STOP THE API FROM BOOTING ──────────────
   *
   * It did. `onModuleInit` throwing aborts Nest's bootstrap, the container never
   * becomes healthy, and Railway — correctly — keeps the PREVIOUS release
   * serving. From the outside everything looks fine: /api/health returns 200,
   * every endpoint answers, and the only symptom is that a deploy silently has
   * no effect. It cost a night of looking at the wrong thing.
   *
   * The throw was one cast. `wrapper.metatype` is typed `Type | Function | null`
   * by Nest, and a controller wrapper CAN have none. `Reflect.getMetadata(key,
   * null)` does not return undefined, it throws a TypeError — so the first
   * metatype-less wrapper in the graph took the whole API down. It was written
   * `wrapper.metatype as never` to make the compiler stop objecting, which is
   * precisely how the null case got hidden from the person writing it.
   *
   * No spec caught it because a unit test never builds a Nest container, and
   * every wrapper in a hand-made fixture has a metatype.
   *
   * SO THERE ARE TWO GUARDS, AND THE SECOND IS THE IMPORTANT ONE. The narrow
   * one skips a wrapper with no metatype. The broad one accepts that this scan
   * touches every controller in the application and that some future one will
   * do something unexpected: THE ASYMMETRY IS NOT CLOSE. Mira with no
   * capabilities is a degraded assistant. An API that will not boot is the whole
   * city. A feature this optional may never be load-bearing for the process.
   */
  onModuleInit(): void {
    try {
      this.caps = this.scan();
    } catch (e) {
      this.caps = [];
      this.logger.error(
        `capability scan failed — Mira will answer nothing, but the API is up: ${String(e)}`,
      );
      return;
    }

    // Say so, loudly. An empty registry is exactly the failure that shipped
    // once already, and it is silent from the outside — Mira simply stops
    // being able to do anything and falls back to navigation.
    if (!this.caps.length) {
      this.logger.error('NO CAPABILITIES FOUND — Mira can answer nothing. Check the @Mira() decorators.');
    } else {
      this.logger.log(`${this.caps.length} capabilities: ${this.caps.map((c) => c.path).join(', ')}`);
    }
  }

  private scan(): Capability[] {
    const out: Capability[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      // A wrapper can have an instance and no metatype, or the reverse. Both are
      // skipped rather than coerced: there is nothing to read off either.
      if (!instance || !metatype) continue;
      const proto = Object.getPrototypeOf(instance) as object;
      if (!proto) continue;
      const prefix = String(this.reflector.get<string>(PATH_METADATA, metatype) ?? '').trim();

      this.scanner.scanFromPrototype(instance, proto, (name: string) => {
        const handler = (instance as Record<string, unknown>)[name];
        if (typeof handler !== 'function') return;
        const cap = this.reflector.get<MiraCapability>(MIRA_CAPABILITY, handler);
        if (!cap) return;

        const rawPath = String(this.reflector.get<string>(PATH_METADATA, handler) ?? '').trim();
        const verb = METHOD_NAME[this.reflector.get<number>(METHOD_METADATA, handler) ?? 0] ?? 'GET';
        const path = [prefix, rawPath].filter((p) => p && p !== '/').join('/');

        out.push({ ...cap, id: `${prefix} ${verb} ${rawPath}`.trim(), method: verb, path, controller: wrapper.name });
      });
    }

    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  all(): Capability[] { return this.caps; }
  byId(id: string): Capability | undefined { return this.caps.find((c) => c.id === id); }
  upTo(max: Risk): Capability[] {
    const ceiling = ORDER.indexOf(max);
    return this.caps.filter((c) => ORDER.indexOf(c.risk) <= ceiling);
  }
}

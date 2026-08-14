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

  onModuleInit(): void {
    const out: Capability[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const { instance } = wrapper;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance) as object;
      const prefix = String(this.reflector.get<string>(PATH_METADATA, wrapper.metatype as never) ?? '').trim();

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

    this.caps = out.sort((a, b) => a.id.localeCompare(b.id));

    // Say so, loudly. An empty registry is exactly the failure that shipped
    // once already, and it is silent from the outside — Mira simply stops
    // being able to do anything and falls back to navigation.
    if (!this.caps.length) {
      this.logger.error('NO CAPABILITIES FOUND — Mira can answer nothing. Check the @Mira() decorators.');
    } else {
      this.logger.log(`${this.caps.length} capabilities: ${this.caps.map((c) => c.path).join(', ')}`);
    }
  }

  all(): Capability[] { return this.caps; }
  byId(id: string): Capability | undefined { return this.caps.find((c) => c.id === id); }
  upTo(max: Risk): Capability[] {
    const ceiling = ORDER.indexOf(max);
    return this.caps.filter((c) => ORDER.indexOf(c.risk) <= ceiling);
  }
}

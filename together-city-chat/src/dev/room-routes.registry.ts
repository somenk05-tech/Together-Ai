import { Injectable, Logger, OnModuleInit, RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { ROOM_ROUTE } from './room.decorator';

export interface RoomRoute { method: string; path: string }

const METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET', [RequestMethod.POST]: 'POST', [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE', [RequestMethod.PATCH]: 'PATCH',
};

/**
 * ── WHAT A ROOM'S KILL SWITCH ACTUALLY REFUSES ──────────────────────────────
 *
 * The operator's page must be able to say, before the press, exactly which
 * routes stop answering — "closes the page for every citizen and refuses GET
 * /astrology/ask, POST /astrology/ask, GET /astrology/questions" — because a
 * switch whose consequence is a paragraph of prose is a switch nobody presses
 * with confidence, and one whose consequence is unstated is worse.
 *
 * IT ASKS THE APPLICATION, IT DOES NOT KEEP A COPY. The same choice the web's
 * routeIndex.ts makes: a hand-written list of what each room refuses is wrong
 * within a week, and wrong in the direction that matters — it would keep
 * promising to close a route somebody has since moved. This walks the live
 * controllers at boot and reads the decorators that are actually there.
 *
 * ── AND IT MAY NEVER STOP THE API FROM BOOTING ──────────────────────────────
 *
 * The lesson MiraRegistry paid for in a night of looking at the wrong thing: a
 * scan that throws in onModuleInit aborts Nest's bootstrap, Railway keeps the
 * previous release, and from outside the deploy simply has no effect. The
 * asymmetry is not close — an operator page that cannot list a room's routes is
 * a worse page; an API that will not boot is the whole city. So the scan is
 * wrapped, and a failure leaves an empty map and a loud log.
 *
 * NOTHING GATES ON THIS. The request gate reads the decorator directly, per
 * request, through the Reflector. If this registry is empty the switches still
 * work exactly as before — only the sentence describing them goes quiet.
 */
@Injectable()
export class RoomRoutesRegistry implements OnModuleInit {
  private readonly logger = new Logger('RoomRoutes');
  private byRoom = new Map<string, RoomRoute[]>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    try {
      this.byRoom = this.scan();
    } catch (e) {
      this.byRoom = new Map();
      this.logger.error(`room route scan failed — /dev cannot list what a room refuses, but the API is up: ${String(e)}`);
      return;
    }
    const routes = [...this.byRoom.values()].reduce((n, rs) => n + rs.length, 0);
    this.logger.log(`${routes} routes across ${this.byRoom.size} rooms carry @Room()`);
  }

  private scan(): Map<string, RoomRoute[]> {
    const out = new Map<string, RoomRoute[]>();
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      // A wrapper can have an instance and no metatype, or the reverse. Both
      // are skipped rather than coerced — see MiraRegistry for what coercing
      // one of them cost.
      if (!instance || !metatype) continue;
      const proto = Object.getPrototypeOf(instance) as object;
      if (!proto) continue;
      const prefix = String(this.reflector.get<string>(PATH_METADATA, metatype) ?? '').trim();

      this.scanner.scanFromPrototype(instance, proto, (name: string) => {
        const handler = (instance as Record<string, unknown>)[name];
        if (typeof handler !== 'function') return;
        const room = this.reflector.get<string>(ROOM_ROUTE, handler);
        if (!room) return;
        const rawPath = String(this.reflector.get<string>(PATH_METADATA, handler) ?? '').trim();
        const method = METHOD_NAME[this.reflector.get<number>(METHOD_METADATA, handler) ?? 0] ?? 'GET';
        const path = `/${[prefix, rawPath].filter((p) => p && p !== '/').join('/')}`;
        const list = out.get(room) ?? [];
        list.push({ method, path });
        out.set(room, list);
      });
    }
    for (const [, list] of out) list.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
    return out;
  }

  /** What this room's kill switch refuses. Empty means the room owns no route
   *  of its own — which the page says out loud rather than implying otherwise. */
  routesOf(room: string): RoomRoute[] { return this.byRoom.get(room) ?? []; }
  all(): Map<string, RoomRoute[]> { return this.byRoom; }
}

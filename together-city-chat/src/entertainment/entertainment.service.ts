import { swallowed } from '../shared/swallow';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { demoDataEnabled } from '../shared/demo-data';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CATEGORIES } from './entertainment.constants';
import type { SaveWatchDto } from './dto/entertainment.dto';

/** One saved Watchlist title (stored as JSON on the user). */
export interface WatchItem {
  id: number; type: 'movie' | 'tv'; title: string;
  posterUrl: string | null; rating: number | null; releaseDate: string | null;
  language: string; genres: string[]; platform: string | null; savedAt: string;
}

@Injectable()
export class EntertainmentService implements OnModuleInit {
  private readonly logger = new Logger('EntertainmentService');

  /** Ids the deleted EVENT_SEEDS constant used to create. See entertainment.constants.ts. */
  private static readonly RETIRED_SEED_EVENT_IDS = [
    'ev_arijit', 'ev_dune', 'ev_zakir', 'ev_mughal', 'ev_rcbmi', 'ev_hotair', 'ev_indie', 'ev_kunal',
  ];

  /**
   * Nobody is left holding a paid ticket to a flow that no longer exists.
   *
   * Owner decision, 2 Aug: REMOVE the events flow. It charged the city wallet
   * against a table with no UI anywhere in the app — four endpoints, a seat-lock
   * transaction, a receipt email, and no screen from which any of it could be
   * reached.
   *
   * Deleting the code is the easy half. The half that matters is that money may
   * already have moved: an earlier deploy seeded invented events (a concert that
   * was never scheduled), and those rows were bookable. The previous version of
   * this hook deleted those eight seed rows and shouted if a booking blocked the
   * delete. That warning was the only thing in the codebase that knew a refund
   * might be owed, so it does not get deleted along with the feature it was
   * warning about — it gets widened, because with the flow gone EVERY
   * TicketBooking row is a charge for something its owner can no longer see,
   * use, or cancel.
   *
   * TicketBooking rows are NOT deleted. They are the evidence a refund is owed.
   * The Event and TicketBooking tables stay for the same reason: dropping a
   * table this cannot verify is empty is not a thing to do from a code change.
   */
  async onModuleInit(): Promise<void> {
    if (demoDataEnabled()) return;
    const ids = EntertainmentService.RETIRED_SEED_EVENT_IDS;
    const paid = await this.prisma.ticketBooking.count().catch(swallowed('entertainment.onModuleInit count', null));
    if (paid) {
      this.logger.error(
        `${paid} ticket booking(s) exist for the removed events flow. Those citizens paid, and there is no longer any screen on which they can see or use what they bought — some of them for seeded events that were never scheduled (${ids.join(', ')}). These need refunding by hand; the rows are deliberately left in place as the record of it.`,
      );
    }
    // The invented rows themselves still go, so nothing can list them again.
    // A booking no longer blocks this — the count above is the alarm.
    await this.prisma.event.deleteMany({ where: { id: { in: ids } } }).catch(swallowed('entertainment.onModuleInit', null));
  }

  // The wallet, the mailer and the clock came out with the events flow: this
  // service no longer takes money, sends a receipt, or has a time to localise.
  // Watchlist is a JSON column on the user, and the catalogue is TMDB.
  constructor(private readonly prisma: PrismaService) {}

  categories() {
    return CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.icon }));
  }

  // ─────────────── personal Watchlist (saved movies & series) ───────────────

  private async readWatchlist(userId: string): Promise<WatchItem[]> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } }) as ({ watchlistJson?: string | null } | null);
    if (!u?.watchlistJson) return [];
    try { return JSON.parse(u.watchlistJson) as WatchItem[]; } catch { return []; }
  }

  private async writeWatchlist(userId: string, items: WatchItem[]): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { watchlistJson: JSON.stringify(items) } });
  }

  async watchlist(userId: string) {
    return { items: await this.readWatchlist(userId) };
  }

  /** Save a title — newest first, de-duplicated, capped at 300. */
  async addToWatchlist(userId: string, dto: SaveWatchDto) {
    const items = await this.readWatchlist(userId);
    const rest = items.filter((i) => !(i.id === dto.id && i.type === dto.type));
    const next: WatchItem[] = [{ ...dto, savedAt: new Date().toISOString() }, ...rest].slice(0, 300);
    await this.writeWatchlist(userId, next);
    return { items: next };
  }

  async removeFromWatchlist(userId: string, type: string, id: string) {
    const numId = Number(id);
    if (!Number.isInteger(numId) || (type !== 'movie' && type !== 'tv')) throw new BadRequestException('bad watchlist ref');
    const items = await this.readWatchlist(userId);
    const next = items.filter((i) => !(i.id === numId && i.type === type));
    await this.writeWatchlist(userId, next);
    return { items: next };
  }
}

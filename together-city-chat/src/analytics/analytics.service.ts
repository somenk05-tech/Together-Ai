import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { swallow } from '../shared/swallow';

/**
 * The funnel, first-party. (26 Aug launch audit: "no instrument on the
 * dashboard to tell you any of it had happened".)
 *
 * A closed set of names, so the dashboard is a fixed list of steps and not a
 * search box over whatever anybody logged. Adding a step means adding a name
 * here and a call at the one place it happens. Nothing here is awaited by a
 * request: an event that fails to write is a gap in a chart, not a failed
 * like.
 */
export const EVENT_NAMES = [
  'dating.profile.started',
  'dating.profile.approved',
  'dating.profile.review',
  'dating.profile.rejected',
  'dating.matches.viewed',
  'dating.like',
  'dating.super_like',
  'dating.pass',
  'dating.match',
  'dating.connect',
  'dating.report',
  'dating.photo.held',
  'dating.photo.rejected',
  'dating.appeal',
  'dating.auto_held', // a card taken out of Browse by a pattern of reports (5 Sep)
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** The steps a citizen passes through, in order, for the funnel table. */
export const FUNNEL: readonly EventName[] = [
  'dating.profile.started', 'dating.profile.approved', 'dating.matches.viewed', 'dating.like', 'dating.match', 'dating.connect',
];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fire and forget. Never awaited by the caller, never throws. */
  track(name: EventName, userId?: string | null, props: Record<string, unknown> = {}): void {
    void swallow(
      this.prisma.appEvent.create({ data: { name, userId: userId ?? null, props: JSON.stringify(props).slice(0, 2000) } }),
      'analytics: track', { name },
    );
  }

  /**
   * Distinct people per step over a window, in funnel order, and every named
   * event's raw count. Distinct users, not events: forty likes from one person
   * is one person who liked.
   */
  async funnel(days: number): Promise<{
    days: number; since: string;
    steps: Array<{ name: EventName; users: number; events: number; ofPrevious: number | null }>;
    counts: Record<string, number>;
  }> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.appEvent.groupBy({
      by: ['name'], where: { at: { gte: since } }, _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.name] = r._count._all;
    const steps: Array<{ name: EventName; users: number; events: number; ofPrevious: number | null }> = [];
    let prev: number | null = null;
    for (const name of FUNNEL) {
      // unbounded: a distinct-user count over the window — truncating it would report a smaller funnel than the truth
      const distinct = await this.prisma.appEvent.findMany({
        where: { name, at: { gte: since }, userId: { not: null } }, distinct: ['userId'], select: { userId: true },
      });
      const users = distinct.length;
      steps.push({ name, users, events: counts[name] ?? 0, ofPrevious: prev == null ? null : (prev === 0 ? 0 : Math.round((users / prev) * 100)) });
      prev = users;
    }
    return { days, since: since.toISOString(), steps, counts };
  }
}

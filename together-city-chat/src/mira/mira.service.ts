import { Injectable, Logger } from '@nestjs/common';
import { FinancialService } from '../financial/financial.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { DriveService } from '../drive/drive.service';
import { route, isUncertain, type Routed } from './router';
import { levity, type LevityLevel, type LevityVerdict } from './levity';
import { MiraRegistry } from './mira.registry';
import { acceptOrFallback, violations } from './voice';
import { findInCity, whyWeAsk } from './city';

/**
 * Narrowing helpers, because the hub services return their own shapes.
 *
 * The first cut of the executor below used `any` in nine places and the lint
 * ceiling caught every one. It was right to: `any` here means a hub changing
 * the name of a field surfaces as "₹NaN" in front of a citizen rather than as
 * a red build. These read one field at a time and admit when it is missing.
 */
function pick(o: unknown, key: string): unknown {
  return o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}
/** A list, however the hub chose to wrap it. */
function asList(v: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(v)) return v;
  for (const k of keys) {
    const inner = pick(v, k);
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

export interface MiraTurn {
  text: string;
  lane: Routed['lane'];
  capabilityId?: string;
  confidence: number;
  levity: LevityLevel;
  /** Set when the answer carries data the citizen can act on. */
  payload?: unknown;
  /**
   * Where she is offering to take them.
   *
   * The honest slice of "Mira controls the app" that phase 1 can actually
   * deliver: navigation changes nothing, so it needs no confirmation and can
   * ship alongside the reads. Ordering and booking are a later phase and she
   * says so rather than implying otherwise.
   */
  goto?: { label: string; path: string };
  /** Everything the turn decided, for the inspector and for a misfire post-mortem. */
  trace: string[];
}

export interface AskContext {
  userId: string;
  /** Whole weeks since their first turn with her. Humour is earned. */
  weeksKnown: number;
  /** Local hour in THEIR timezone. Never the server's. */
  hour: number;
  dial?: 0 | 1 | 2;
  distressLocked?: boolean;
  recent?: string[];
}

/**
 * Mira, phase 1: she reads.
 *
 * No capability above R0 is reachable from here — not gated by a flag but by
 * construction, because the executor below has no branch that writes. That is
 * deliberate. A voice interface over a wrong action model is worse than no
 * voice interface, and the same is true of a chat one: the cheapest possible
 * proof that the router, the manifest and the governor agree is to let them
 * answer questions for a while before letting them do anything.
 *
 * Degradation is a feature, as everywhere else in this codebase. Every branch
 * below returns a deterministic sentence; nothing here needs a model to work,
 * and the model — when it arrives in a later phase — only rewrites prose that
 * already exists and is already correct.
 */
@Injectable()
export class MiraService {
  private readonly logger = new Logger('MiraService');

  constructor(
    private readonly financial: FinancialService,
    private readonly restaurants: RestaurantsService,
    private readonly drive: DriveService,
    private readonly registry: MiraRegistry,
  ) {}

  async ask(text: string, ctx: AskContext): Promise<MiraTurn> {
    const routed = route(text, { capabilities: this.registry.upTo('R0') });
    const cap = routed.capabilityId ? this.registry.byId(routed.capabilityId) : undefined;

    const lev: LevityVerdict = levity({
      lane: routed.lane,
      risk: cap?.risk,
      domain: cap?.path.split('/')[0],
      text,
      recent: ctx.recent,
      distressLocked: ctx.distressLocked,
      weeksKnown: ctx.weeksKnown,
      hour: ctx.hour,
      dial: ctx.dial,
    });

    const trace = [`route: ${routed.why} (${routed.confidence.toFixed(2)})`, ...lev.trace];

    const turn = async (): Promise<{ text: string; payload?: unknown; goto?: MiraTurn['goto'] }> => {
      if (routed.lane === 'LISTEN') {
        return { text: lev.distress ? 'Okay. Forget everything else for a second. Tell me what happened.' : "Yeah. What's going on?" };
      }
      if (routed.lane === 'ADVISE') {
        // The advise lane belongs to the astrology engine, which already
        // computes deterministically and already has its own enforced voice.
        // Wiring it is a later phase; saying so plainly beats improvising an
        // interpretation here.
        return { text: "I have thoughts. Which part do you want them on?" };
      }
      // Before giving up: is this a place rather than a task? "Where do I set my
      // allergies", "take me to my budgets" — the question the hub wall cannot
      // answer, and the one that made ⌘K necessary in the first place.
      if (isUncertain(routed) || !cap) {
        const why = whyWeAsk(text) ?? undefined;
        if (why) {
          return {
            text: `${why.changes.join(' ')} You set it at ${why.toldAt}.`,
            goto: { label: why.fact, path: why.toldAt },
          };
        }
        const found = findInCity(text, 2);
        if (found.length === 1) {
          return { text: `That’s ${found[0].label}. Want me to take you?`, goto: { label: found[0].label, path: found[0].path } };
        }
        if (found.length > 1) {
          return { text: `Two places that could be: ${found.map((f) => f.label).join(' or ')}. Which one?` };
        }
        return { text: this.clarify(routed) };
      }
      return this.read(cap.id, ctx.userId);
    };

    const { text: draft, payload, goto } = await turn();

    // Deterministic text, checked against her own voice rules anyway. It should
    // never fail — and if a future edit makes it fail, this is where we find
    // out, rather than a citizen.
    const bad = violations(draft);
    if (bad.length) this.logger.warn(`Mira's own line broke voice: ${bad.map((v) => v.why).join(', ')}`);
    const say = acceptOrFallback(draft, "I can't do that from here.");

    return {
      text: say,
      lane: routed.lane,
      capabilityId: routed.capabilityId,
      confidence: routed.confidence,
      levity: lev.level,
      payload,
      goto,
      trace,
    };
  }

  /** One question, never two, and never a guess between two things. */
  private clarify(r: Routed): string {
    if (r.why === 'cancel what') return "Cancel which one — say the booking and I'll find it.";
    if (r.why.includes('score the same')) return 'Two things that could mean. Which one?';
    if (r.why === 'nothing matched' || r.why === 'empty') {
      return "That's not something I can do yet. What are you actually trying to get done?";
    }
    return 'Say a bit more and I can find it.';
  }

  /**
   * The executor. Reads only.
   *
   * A switch over manifest ids rather than a registry: there are four of them.
   * When there are forty this becomes a map that modules register into — but
   * building that now would be an abstraction over a single use, and the
   * switch is the thing that makes "R0 only" verifiable by reading it.
   */
  private async read(id: string, userId: string): Promise<{ text: string; payload?: unknown }> {
    switch (id) {
      case 'financial GET wallet': {
        const w = await this.financial.wallet(userId);
        const bal = Number(pick(w, 'balance') ?? pick(w, 'balancePaise') ?? 0);
        return { text: `₹${bal.toLocaleString('en-IN')}.`, payload: w };
      }
      case 'financial GET transactions': {
        const txns = asList(await this.financial.transactions(userId));
        if (!txns.length) return { text: 'Nothing yet.', payload: [] };
        const recent = txns.slice(0, 3);
        const names = recent.map((t) => str(pick(t, 'title')) ?? str(pick(t, 'description')) ?? 'a charge');
        return { text: `Last ${recent.length}: ${names.join(', ')}.`, payload: recent };
      }
      case 'drive GET': {
        const items = asList(await this.drive.list(userId), 'files', 'items');
        if (!items.length) return { text: 'Nothing in your drive yet.', payload: [] };
        return { text: `${items.length} in your drive. Which one?`, payload: items.slice(0, 8) };
      }
      case 'restaurants GET discover': {
        const list = asList(await this.restaurants.discover(userId, {} as never), 'places', 'items');
        if (!list.length) return { text: 'Nothing that fits right now.', payload: [] };
        const names = list.slice(0, 3).map((p) => str(pick(p, 'name'))).filter(Boolean);
        return { text: `${list.length} that fit. ${names.join(', ')}.`, payload: list.slice(0, 6) };
      }
      default:
        // Reachable only if the manifest grows past what this switch knows.
        // Say so rather than pretending — the honesty rule the whole codebase
        // is built on applies to Mira's own gaps first.
        return { text: "That's not something I can do yet." };
    }
  }
}

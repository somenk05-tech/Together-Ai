import { Injectable, Logger } from '@nestjs/common';
import { FinancialService } from '../financial/financial.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { DriveService } from '../drive/drive.service';
import { AstrologyService } from '../astrology/astrology.service';
import { TarotService } from '../astrology/tarot.service';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { NutritionService } from '../nutrition/nutrition.service';
import { MedicalService } from '../medical/medical.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { FitnessService } from '../fitness/fitness.service';
import { BeautyService } from '../beauty/beauty.service';
import { EntertainmentService } from '../entertainment/entertainment.service';
import { TravelService } from '../travel/travel.service';
import { ThoughtsService } from '../thoughts/thoughts.service';
import { route, isUncertain, type Routed } from './router';
import { levity, type LevityLevel, type LevityVerdict } from './levity';
import { moodFor, tilted, type Mood } from './mood';
import { say, nothing, type Colour } from './say';
import { resolveChoice, type Choice } from './choose';
import { MiraRegistry } from './mira.registry';
import { MiraLedger, type Outcome } from './ledger';
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
function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
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
const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** "a, b and c" — an assistant that says "a, b, c" is reading out a database. */
function list(items: string[]): string {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? '';
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

export interface MiraTurn {
  text: string;
  lane: Routed['lane'];
  capabilityId?: string;
  confidence: number;
  levity: LevityLevel;
  /** The colour this turn was said in. Sent so the client can show it, and so a
   *  misfire post-mortem can reproduce the exact sentence. */
  mood: Mood;
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
  goto?: Choice;
  /**
   * The options she just offered, when the turn was a question.
   *
   * Sent out so the next ask can carry them back. This is the whole of her
   * short-term memory and it deliberately lives on the wire rather than on the
   * server — see `choose.ts` for why the alternative is worse.
   */
  choices?: Choice[];
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
  /** Session counter, for the mood and for which aside she reaches for. */
  seed?: number;
  /** What she offered last turn, handed back so an answer is read as an answer. */
  answering?: Choice[];
}

/** One branch's output: the fact, and the asides that would be true of it. */
interface Attempt {
  text: string;
  asides?: string[];
  payload?: unknown;
  goto?: Choice;
  choices?: Choice[];
  outcome?: Outcome;
}

/**
 * Mira, phase 1: she reads — now across the whole city.
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
    private readonly astrology: AstrologyService,
    private readonly tarot: TarotService,
    private readonly prescriptions: PrescriptionsService,
    private readonly nutrition: NutritionService,
    private readonly medical: MedicalService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly profile: MasterProfileService,
    private readonly fitness: FitnessService,
    private readonly beauty: BeautyService,
    private readonly entertainment: EntertainmentService,
    private readonly travel: TravelService,
    private readonly thoughts: ThoughtsService,
    private readonly registry: MiraRegistry,
    private readonly ledger: MiraLedger,
  ) {}

  async ask(text: string, ctx: AskContext): Promise<MiraTurn> {
    const seed = ctx.seed ?? 0;

    // ── SHE ANSWERS HER OWN QUESTION FIRST ────────────────────────────────
    // Before routing, before scoring, before anything: if she asked "which
    // one?" last turn and this turn is one of the answers, it is an answer.
    // Sending it back through the matcher that produced the question is what
    // made her loop in production.
    const answered = ctx.answering?.length ? resolveChoice(text, ctx.answering) : undefined;

    const routed: Routed = answered
      ? { lane: 'RETRIEVE', confidence: 1, why: 'answered the question she asked' }
      : route(text, { capabilities: this.registry.upTo('R0') });
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
    // Mood is chosen from the session, not from the turn — and levity is then
    // tilted WITHIN what the governor allowed, never across it. `tilted()`
    // returns 0 whenever the cap is 0, which is where distress, the listen
    // lane, a failed step, medical and R4 all land.
    const mood = moodFor({ seed, hour: ctx.hour, lastSessionDistressed: ctx.distressLocked });
    const colour: Colour = { mood, level: tilted(mood, lev.level), seed };

    const trace = [`route: ${routed.why} (${routed.confidence.toFixed(2)})`, `mood: ${mood}`, ...lev.trace];

    /**
     * Every branch says what KIND of turn it was, and the ledger writes it down.
     *
     * The interesting number about Mira is not how often her capabilities work —
     * it is what people ask for that is not one of them. That set is the roadmap,
     * written by citizens rather than guessed at.
     */
    const turn = async (): Promise<Attempt> => {
      if (answered) {
        return {
          outcome: 'navigate',
          text: `${answered.label}. Come on.`,
          asides: ['You could have led with that.', 'Right where you left it.'],
          goto: answered,
        };
      }
      if (routed.lane === 'LISTEN') {
        return {
          outcome: 'listen',
          text: lev.distress
            ? 'Okay. Forget everything else for a second. Tell me what happened.'
            : "Yeah. What's going on?",
        };
      }
      if (routed.lane === 'ADVISE') {
        // The interpretation lane belongs to the astrology engine, which already
        // computes deterministically and already has its own enforced voice.
        // Rather than improvise here, she offers the reading that actually
        // exists — which is now something she can fetch.
        return this.dayBrief(ctx.userId);
      }
      // Before giving up: is this a place rather than a task? "Where do I set my
      // allergies", "take me to my budgets" — the question the hub wall cannot
      // answer, and the one that made ⌘K necessary in the first place.
      if (isUncertain(routed) || !cap) {
        const why = whyWeAsk(text) ?? undefined;
        if (why) {
          return {
            outcome: 'navigate',
            text: `${why.changes.join(' ')} You set it at ${why.toldAt}.`,
            goto: { label: why.fact, path: why.toldAt },
          };
        }

        // ── DECISIVE, AND ONLY ASKING ON A REAL CONTEST ────────────────────
        // The old code asked whenever there were two hits. "Astrology" at 1.0
        // beside "Astrology Log" at 0.5 is not a tie, and treating it as one is
        // half of the loop the owner found. A runner-up has to be genuinely
        // close before a question is worth a turn.
        const found = findInCity(text, 3);
        const [top, second] = found;
        if (top && (!second || top.score - second.score >= CONTEST)) {
          return {
            outcome: 'navigate',
            text: `${top.label}. Want me to take you?`,
            asides: ['It has been there the whole time.'],
            goto: { label: top.label, path: top.path },
          };
        }
        if (top && second) {
          const options = found.slice(0, 3).map(({ label, path }) => ({ label, path }));
          return {
            outcome: 'clarify',
            text: `${list(options.map((o) => o.label))}. Which one?`,
            choices: options,
          };
        }
        return { outcome: 'clarify', text: this.clarify(routed), choices: [] };
      }
      return { outcome: 'capability', ...(await this.read(cap.id, ctx.userId, colour)) };
    };

    const attempt = await turn();
    const outcome: Outcome = attempt.outcome ?? 'capability';
    const draft = say(attempt.text, colour, attempt.asides ?? []);

    // Fire and forget, by construction — recording a question must never slow
    // an answer down and must never be the reason one fails.
    this.ledger.record({
      userId: ctx.userId,
      text,
      lane: routed.lane,
      confidence: routed.confidence,
      capability: cap?.id,
      outcome,
      levity: lev.level,
    });

    // Deterministic text, checked against her own voice rules anyway. It should
    // never fail — and if a future edit makes it fail, this is where we find
    // out, rather than a citizen.
    const bad = violations(draft);
    if (bad.length) this.logger.warn(`Mira's own line broke voice: ${bad.map((v) => v.why).join(', ')}`);
    const said = acceptOrFallback(draft, "I can't do that from here.");

    return {
      text: said,
      lane: routed.lane,
      capabilityId: routed.capabilityId,
      confidence: routed.confidence,
      levity: lev.level,
      mood,
      payload: attempt.payload,
      goto: attempt.goto,
      choices: attempt.choices?.length ? attempt.choices : undefined,
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
   * "How is my day going to be?" — the question that started all of this.
   *
   * ── WHY IT IS ONE TURN AND NOT FIVE ───────────────────────────────────────
   *
   * Asked in production, she said *"That's not something I can do yet"* — while
   * the citizen's reading for that exact day was sitting in `astroReading`,
   * their doses were expanded and waiting in `medicines/today`, and their unread
   * count was one query away. Every part of the answer existed. Nothing joined
   * them up, and an assistant that makes you visit four hubs to assemble your
   * own morning is a menu with a personality.
   *
   * So this is the one composite in the executor, and it is the shape the rest
   * of "proactive" will take: HER OWN READING FIRST, because that is what was
   * asked, then only the facts that would change what somebody does before
   * lunch.
   *
   * ── EVERY READ IS GUARDED SEPARATELY ──────────────────────────────────────
   *
   * Five hubs, `Promise.allSettled`, and a dead one contributes nothing rather
   * than taking the answer down. A morning brief that fails entirely because the
   * watchlist service is down is worse than no morning brief — and this is the
   * one turn most likely to be somebody's first.
   *
   * The astrology letter is written by a model and cached per citizen per day.
   * On a cache miss it returns `pending`, and `pending` is reported, never
   * retried in a loop: it costs a model call and it is not hers to spend.
   */
  private async dayBrief(userId: string): Promise<Attempt> {
    const [reading, doses, prep, post, alerts] = await Promise.allSettled([
      this.astrology.daily(userId),
      this.prescriptions.today(userId),
      this.nutrition.prepAlerts(userId),
      this.mail.account(userId),
      this.notifications.unreadCount(userId),
    ]);
    const ok = <T,>(r: PromiseSettledResult<T>): T | undefined => (r.status === 'fulfilled' ? r.value : undefined);

    const parts: string[] = [];
    const r = ok(reading);
    if (pick(r, 'needsProfile') === true) {
      return {
        outcome: 'navigate',
        text: 'I need your birth details before I can read your day — date, time and place.',
        goto: { label: 'Astrology', path: '/astrology' },
      };
    }
    if (pick(r, 'pending') === true) {
      parts.push('Your reading for today is still being written. Give it a few minutes.');
    } else {
      const body = str(pick(r, 'body'));
      const title = str(pick(r, 'title'));
      if (body) parts.push(firstSentences(body, 2));
      else if (title) parts.push(title);
    }

    const due = asList(ok(doses), 'doses').filter((d) => {
      const s = str(pick(d, 'status'));
      return s === 'due' || s === 'upcoming';
    });
    if (due.length) {
      const names = due.slice(0, 3).map((d) => str(pick(d, 'medicine')) ?? 'something').filter(Boolean);
      parts.push(`${due.length === 1 ? 'One dose' : `${due.length} doses`} still to take — ${list(names)}.`);
    }

    const cook = asList(ok(prep), 'alerts');
    if (cook.length) {
      const next = cook[0];
      const what = str(pick(next, 'title')) ?? str(pick(next, 'what'));
      const when = str(pick(next, 'startBy'));
      if (what) parts.push(when ? `${what} wants starting by ${when}.` : `${what} is next in the kitchen.`);
    }

    const unreadMail = num(pick(pick(ok(post), 'counts'), 'inboxUnread')) ?? 0;
    const unseen = num(ok(alerts)) ?? 0;
    const waiting: string[] = [];
    if (unreadMail) waiting.push(`${unreadMail} unread`);
    if (unseen) waiting.push(`${unseen} notification${unseen === 1 ? '' : 's'}`);
    if (waiting.length) parts.push(`${list(waiting)} waiting.`);

    if (!parts.length) {
      return {
        outcome: 'capability',
        text: 'Nothing on your day yet — no reading, no doses, nothing waiting.',
        asides: ['Enjoy it while it lasts.'],
      };
    }

    return {
      outcome: 'capability',
      text: parts.join(' '),
      asides: due.length
        ? ['The pills are not going to take themselves.']
        : ['That is the whole of it. Ask me for any of it properly and I will open it.'],
      payload: { reading: ok(reading), doses: due.slice(0, 6), prep: cook.slice(0, 3) },
      goto: { label: 'Astrology', path: '/astrology' },
    };
  }

  /**
   * The executor. Reads only, across the whole city.
   *
   * A SWITCH RATHER THAN A REGISTRY, STILL — and now that there are
   * twenty-five of them the choice is worth restating rather than assumed. A
   * map that modules register into would be shorter and would move the answer
   * to "what can she actually do" out of this file and into twelve others. The
   * switch is the thing that makes R0-ONLY VERIFIABLE BY READING IT: every
   * branch here calls a service method whose name begins with a read, and you
   * can check that claim in one screen. That property is worth more than the
   * line count.
   *
   * Each branch returns the FACT and the asides that would be true of it.
   * Whether an aside is said is not this method's business — `say()` asks the
   * governor. A branch cannot make itself funny, which is the whole safety
   * argument for having jokes at all.
   */
  private async read(id: string, userId: string, c: Colour): Promise<Attempt> {
    switch (id) {
      // ── MONEY ──────────────────────────────────────────────────────────
      case 'financial GET wallet': {
        const w = await this.financial.wallet(userId);
        const bal = num(pick(w, 'balanceInr')) ?? num(pick(w, 'balance')) ?? 0;
        return {
          text: `${rupees(bal)}.`,
          asides: bal <= 0 ? ['Which is a number, technically.'] : [],
          payload: w,
        };
      }
      case 'financial GET transactions': {
        const txns = asList(await this.financial.transactions(userId));
        if (!txns.length) return { text: nothing('your transactions', c), payload: [] };
        const recent = txns.slice(0, 3);
        const names = recent.map((t) => str(pick(t, 'title')) ?? str(pick(t, 'description')) ?? 'a charge');
        return { text: `Last ${recent.length}: ${list(names)}.`, payload: recent };
      }
      case 'financial GET budgets': {
        const rows = asList(await this.financial.budgets(userId));
        const over = rows.filter((b) => (num(pick(b, 'spent')) ?? 0) > (num(pick(b, 'monthlyInr')) ?? Infinity));
        if (!rows.length) return { text: 'No budgets set yet.', payload: [] };
        if (!over.length) return { text: `${rows.length} budgets, all inside.`, asides: ['Suspicious.'], payload: rows };
        const names = over.map((b) => str(pick(b, 'category')) ?? 'one').slice(0, 3);
        return { text: `Over on ${list(names)}.`, asides: ['Not judging. Reporting.'], payload: over };
      }
      case 'financial GET spending': {
        const s = await this.financial.spending(userId);
        const total = num(pick(s, 'thisMonthInr')) ?? num(pick(s, 'total')) ?? 0;
        return { text: `${rupees(total)} this month.`, payload: s };
      }

      // ── THE DAY ────────────────────────────────────────────────────────
      case 'astrology GET daily':
        return this.dayBrief(userId);
      case 'astrology GET gems': {
        const g = await this.astrology.gems(userId);
        if (pick(g, 'needsProfile') === true) return this.needBirth();
        const stone = str(pick(g, 'stone')) ?? str(pick(pick(g, 'primary'), 'name'));
        if (!stone) return { text: 'Nothing your chart is asking for right now.', payload: g };
        return { text: `${stone}.`, asides: ['Do not buy it from a man on a train.'], payload: g, goto: { label: 'Gemstones', path: '/astrology/gemstones' } };
      }
      case 'astrology GET remedies': {
        const r = await this.astrology.remedies(userId);
        if (pick(r, 'needsProfile') === true) return this.needBirth();
        const items = asList(r, 'practices', 'remedies', 'items');
        if (!items.length) return { text: 'Nothing prescribed right now.', payload: r };
        const names = items.slice(0, 3).map((p) => str(pick(p, 'title')) ?? str(pick(p, 'name'))).filter(Boolean) as string[];
        return { text: `${items.length}: ${list(names)}.`, payload: r, goto: { label: 'Remedies', path: '/astrology/remedies' } };
      }
      case 'astrology GET tarot/daily': {
        const card = await this.tarot.dailyCard(userId);
        const name = str(pick(card, 'name')) ?? str(pick(pick(card, 'card'), 'name'));
        if (!name) return { text: 'No card today.', payload: card };
        return { text: `${name}.`, asides: ['Make of that what you like.'], payload: card, goto: { label: 'Tarot', path: '/astrology/tarot' } };
      }

      // ── THE BODY. No asides reach these — the governor caps medical and
      //    medicines at L0, and `say()` will drop anything written here. They
      //    are left empty so nobody has to discover that by testing it.
      case 'medicines GET today': {
        const t = await this.prescriptions.today(userId);
        const doses = asList(t, 'doses');
        if (!doses.length) return { text: 'Nothing to take today.', payload: t };
        const due = doses.filter((d) => { const s = str(pick(d, 'status')); return s === 'due' || s === 'upcoming'; });
        const taken = doses.filter((d) => str(pick(d, 'status')) === 'taken').length;
        if (!due.length) return { text: `All ${doses.length} done.`, payload: t };
        const names = due.slice(0, 3).map((d) => str(pick(d, 'medicine')) ?? 'one').filter(Boolean);
        return {
          text: `${due.length} still to take — ${list(names)}.${taken ? ` ${taken} done.` : ''}`,
          payload: t,
          goto: { label: 'Medicines', path: '/medicines' },
        };
      }
      case 'medical GET summary': {
        const s = await this.medical.healthSummary(userId);
        if (pick(s, 'hasPanel') !== true) {
          return { text: 'No blood work on file yet.', goto: { label: 'Medical', path: '/medical' } };
        }
        const score = num(pick(s, 'score'));
        const band = str(pick(s, 'band'));
        const taken = str(pick(s, 'takenOn'));
        return {
          text: `${score ?? '—'}${band ? `, ${band}` : ''}${taken ? `, from ${taken}` : ''}.`,
          payload: s,
          goto: { label: 'Medical', path: '/medical' },
        };
      }
      case 'profile GET health-score': {
        const h = await this.profile.healthScore(userId);
        const score = num(pick(h, 'score'));
        if (score === undefined) return { text: 'Not enough on file to score yet.', payload: h };
        return { text: `${score}.`, payload: h, goto: { label: 'Profile', path: '/profile' } };
      }

      // ── FOOD ───────────────────────────────────────────────────────────
      case 'nutrition GET targets': {
        const t = await this.nutrition.targets(userId);
        const kcal = num(pick(t, 'calories')) ?? num(pick(t, 'kcal'));
        const protein = num(pick(t, 'protein')) ?? num(pick(t, 'proteinG'));
        if (kcal === undefined) return { text: 'No targets set yet.', payload: t, goto: { label: 'Nutrition', path: '/nutrition' } };
        return {
          text: `${Math.round(kcal)} kcal${protein !== undefined ? `, ${Math.round(protein)}g protein` : ''}.`,
          payload: t,
        };
      }
      case 'nutrition GET prep-alerts': {
        const a = asList(await this.nutrition.prepAlerts(userId), 'alerts');
        if (!a.length) return { text: 'Nothing needs starting yet.', asides: ['Kitchen is quiet.'] };
        const next = a[0];
        const what = str(pick(next, 'title')) ?? str(pick(next, 'what')) ?? 'the next meal';
        const when = str(pick(next, 'startBy'));
        return {
          text: when ? `${what}, start by ${when}.` : `${what} is next.`,
          asides: ['Do not let it become an order.'],
          payload: a.slice(0, 4),
          goto: { label: 'Nutrition', path: '/nutrition' },
        };
      }

      // ── WHAT IS WAITING ────────────────────────────────────────────────
      case 'mail GET account': {
        const acc = await this.mail.account(userId);
        const unread = num(pick(pick(acc, 'counts'), 'inboxUnread')) ?? 0;
        if (!unread) return { text: 'Inbox is clear.', asides: ['Enjoy the silence.'], payload: acc };
        return {
          text: `${unread} unread.`,
          asides: ['They will still be there in an hour.'],
          payload: acc,
          goto: { label: 'Mail', path: '/mail' },
        };
      }
      case 'notifications GET unread-count': {
        const n = (await this.notifications.unreadCount(userId)) || 0;
        if (!n) return { text: 'Nothing waiting.', payload: { count: 0 } };
        return { text: `${n}.`, payload: { count: n } };
      }

      // ── WHO THEY ARE ───────────────────────────────────────────────────
      case 'profile GET master': {
        const p = await this.profile.get(userId);
        const name = str(pick(p, 'name'));
        const age = num(pick(p, 'age'));
        const bits = [name, age !== undefined ? `${age}` : undefined].filter(Boolean) as string[];
        return {
          text: bits.length ? `${list(bits)}. The rest is on your profile.` : 'Not much yet, honestly.',
          asides: ['Less than you would think, and only what you told me.'],
          payload: p,
          goto: { label: 'Profile', path: '/profile' },
        };
      }
      case 'profile GET completion': {
        const rows = asList(await this.profile.completion(userId));
        const gaps = rows.filter((r) => pick(r, 'complete') !== true);
        if (!gaps.length) return { text: 'Nothing missing.', asides: ['Rare.'], payload: rows };
        const names = gaps.slice(0, 3).map((g) => str(pick(g, 'label')) ?? 'one').filter(Boolean);
        return { text: `${gaps.length} still open: ${list(names)}.`, payload: gaps };
      }

      // ── THINGS IN FLIGHT ───────────────────────────────────────────────
      case 'restaurants GET discover': {
        const l = asList(await this.restaurants.discover(userId, {} as never), 'places', 'items');
        if (!l.length) return { text: 'Nothing that fits right now.', payload: [] };
        const names = l.slice(0, 3).map((p) => str(pick(p, 'name'))).filter(Boolean) as string[];
        return { text: `${l.length} that fit. ${list(names)}.`, payload: l.slice(0, 6) };
      }
      case 'restaurants GET orders': {
        const o = asList(await this.restaurants.myOrders(userId));
        if (!o.length) return { text: nothing('your orders', c), payload: [] };
        const latest = str(pick(o[0], 'status')) ?? 'placed';
        return { text: `${o.length}. The last one is ${latest}.`, payload: o.slice(0, 5), goto: { label: 'Orders', path: '/restaurants/orders' } };
      }
      case 'restaurants GET reservations': {
        const r = asList(await this.restaurants.myReservations(userId));
        if (!r.length) return { text: 'No table booked.', asides: ['Say the word and I will find one — once I am allowed to book.'], payload: [] };
        const where = str(pick(r[0], 'restaurantName')) ?? str(pick(r[0], 'name'));
        return { text: where ? `${r.length}. Next: ${where}.` : `${r.length} booked.`, payload: r.slice(0, 5) };
      }
      case 'travel GET trips': {
        const t = asList(await this.travel.myTrips(userId));
        if (!t.length) return { text: 'No trips.', asides: ['Sedentary, but cheap.'], payload: [] };
        const where = str(pick(t[0], 'destination')) ?? str(pick(t[0], 'title'));
        return { text: where ? `${t.length}. Next: ${where}.` : `${t.length} on file.`, payload: t.slice(0, 5), goto: { label: 'Travel', path: '/travel' } };
      }

      // ── THE REST OF THE CITY ───────────────────────────────────────────
      case 'drive GET': {
        const items = asList(await this.drive.list(userId), 'files', 'items');
        if (!items.length) return { text: nothing('your drive', c), payload: [] };
        return { text: `${items.length} in your drive. Which one?`, payload: items.slice(0, 8) };
      }
      case 'drive GET usage': {
        const u = await this.drive.usage(userId);
        const pct = num(pick(u, 'usedPct'));
        return {
          text: pct === undefined ? 'Storage is fine.' : `${Math.round(pct)}% used.`,
          asides: (pct ?? 0) > 85 ? ['You are a hoarder with a login.'] : [],
          payload: u,
        };
      }
      case 'fitness GET plan': {
        const p = await this.fitness.plan(userId);
        const focus = str(pick(p, 'todayFocus')) ?? str(pick(p, 'focus')) ?? str(pick(p, 'title'));
        if (!focus) return { text: 'No plan set yet.', payload: p, goto: { label: 'Fitness', path: '/fitness' } };
        return { text: `${focus}.`, asides: ['The plan is not the hard part.'], payload: p, goto: { label: 'Fitness', path: '/fitness' } };
      }
      case 'fitness GET log': {
        const l = await this.fitness.log(userId);
        const mins = num(pick(l, 'weekMinutes')) ?? 0;
        return {
          text: `${mins} minutes this week.`,
          asides: mins === 0 ? ['A clean slate, if you want to call it that.'] : ['Keep going.'],
          payload: l,
        };
      }
      case 'beauty GET routine': {
        const r = await this.beauty.routine(userId);
        if (pick(r, 'needsBudget') === true) {
          return { text: 'You need a budget before there is a routine.', payload: r, goto: { label: 'Beauty', path: '/beauty' } };
        }
        const count = num(pick(r, 'productCount')) ?? asList(r, 'routines').length;
        return { text: `${count} steps.`, payload: r, goto: { label: 'Beauty', path: '/beauty' } };
      }
      case 'entertainment GET watchlist': {
        const items = asList(await this.entertainment.watchlist(userId), 'items');
        if (!items.length) return { text: nothing('your watchlist', c), asides: ['Bold of you to have free time.'], payload: [] };
        const names = items.slice(0, 3).map((i) => str(pick(i, 'title')) ?? str(pick(i, 'name'))).filter(Boolean) as string[];
        return { text: `${items.length}. ${list(names)}.`, payload: items.slice(0, 8), goto: { label: 'Entertainment', path: '/entertainment' } };
      }
      case 'thoughts GET': {
        const items = asList(await this.thoughts.list(userId, LAST_FEW), 'items');
        if (!items.length) return { text: nothing('your notes', c), payload: [] };
        const first = str(pick(items[0], 'title')) ?? str(pick(items[0], 'body'));
        return {
          text: first ? `${items.length}. The last one starts "${firstSentences(first, 1)}".` : `${items.length}.`,
          payload: items.slice(0, 5),
          goto: { label: 'Thoughts', path: '/thoughts' },
        };
      }

      default:
        // Reachable only if the manifest grows past what this switch knows.
        // Say so rather than pretending — the honesty rule the whole codebase
        // is built on applies to Mira's own gaps first.
        //
        // And say so in the LEDGER too, which is why `outcome` is returned from
        // here at all: a decorator the executor has no branch for is two halves
        // of the same feature disagreeing in production, and recording it as a
        // successful capability would hide exactly the thing worth finding.
        return { outcome: 'gap', text: "That's not something I can do yet." };
    }
  }

  private needBirth(): Attempt {
    return {
      text: 'I need your birth details first — date, time and place.',
      goto: { label: 'Astrology', path: '/astrology' },
    };
  }
}

/**
 * How far the top match has to beat the runner-up before she stops asking.
 *
 * 0.25 is the gap between an exact name match (1.0) and a room that merely
 * contains the word (0.5, and 0.8 for a substring), which is the case that
 * produced the loop. Two rooms that both score 0.8 stay a question, because
 * they genuinely are one.
 */
const CONTEST = 0.25;

/** The last few notes. Typed off the service so a schema change is a red build. */
const LAST_FEW = { limit: 5 } as Parameters<ThoughtsService['list']>[1];

/**
 * The opening of a longer text, cut at a sentence.
 *
 * The astrology letter is prose written for a page. Reading the whole thing
 * into a chat bubble is how an assistant turns an answer into homework.
 */
function firstSentences(body: string, count: number): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g);
  if (!parts?.length) return clean.slice(0, 180);
  return parts.slice(0, count).join(' ').trim();
}

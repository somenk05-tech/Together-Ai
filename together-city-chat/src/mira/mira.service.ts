import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../shared/prisma/prisma.service';
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
import { persona, confidant, lifePathOf, FREE_CHATS, SUB_INR, PAYWALL_LINE } from './persona';
import { findInCity, whyWeAsk } from './city';
import { readSituation, type Read } from './relate';
import { readForget } from './forget';
import { DaybookService } from '../daybook/daybook.service';

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
/**
 * THE LOOKING-BACK SHEET'S QUESTIONS, so an answer is read back with the
 * question it was given to. "the meeting" tells her nothing; "what went well:
 * the meeting" tells her everything. The order is the order on the page.
 */
const REFLECTION_PROMPTS: Array<[string, string]> = [
  ['feeling', 'how the day felt to them, 1–10 (their reading, not a mark)'],
  ['wentWell', 'what went well today'],
  ['proudOf', 'something they are proud of'],
  ['grateful1', 'grateful for'],
  ['grateful2', 'grateful for'],
  ['grateful3', 'grateful for'],
  ['difficult', "what was difficult or didn't go as planned"],
  ['learned', 'what they can learn from it'],
  ['win', 'the win of today'],
  ['challenge', 'the challenge'],
  ['tomorrow', "tomorrow's focus"],
];

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
/**
 * "When will I find love?"
 *
 * Asked in production the night she went live, and it reached NOTHING. ADVISE
 * wants `my chart` or `horoscope`; LISTEN wants `i feel`; `readSituation` wants
 * one of nine relationship words and "love" is not one; and `city.ts` gives
 * Dating the words matches/dates/profile. So it fell all the way through to the
 * gap, and the gap said: "What are you actually trying to get done?"
 *
 * That is Mode 3 answering a Mode 1 question — an operational clause asked of
 * somebody wondering about their life — and under a spectrum that is 70% friend
 * it is exactly inverted. §24 bans the register; §7 names the mode.
 *
 * She also may not answer it. §11: no guaranteed marriage, no guaranteed
 * anything. So this returns the honest shape — she declines the prediction, says
 * what she actually has, and opens it. §25: honesty with direction is guidance;
 * honesty without direction is criticism.
 */
const FORETOLD =
  /\b(?:when will i|when am i (?:going to|gonna)|will i ever|am i (?:ever )?going to (?:find|meet|get|be)|is it (?:a )?good time to)\b/i;

function foretold(text: string): Attempt | undefined {
  if (!FORETOLD.test(text)) return undefined;
  return {
    outcome: 'advise',
    text: "I'm not going to put a date on that — nobody honestly can. Your reading is the closest thing I have to an answer, and it's written fresh each day.",
    goto: { label: 'Astrology', path: '/astrology' },
  };
}

/**
 * An instant, in the citizen's own clock.
 *
 * Framework §10: she must understand the user's timezone, and must never be
 * vague when precise information is available. The first cut of `dayBrief`
 * interpolated the hub's raw field and said "wants starting by
 * 2026-08-15T05:15:00.000Z" — a machine string in a sentence, and UTC, so even
 * read correctly it named an hour five and a half hours from the one on the
 * citizen's wall.
 *
 * Falls back to nothing rather than to a wrong time: an omitted clause reads as
 * her not mentioning it, and a wrong one reads as her being wrong.
 */
function clockTime(iso: string | undefined, tz: string | undefined): string | undefined {
  if (!iso) return undefined;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz || 'UTC',
    }).format(at).replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
  } catch {
    return undefined;
  }
}

/**
 * The line the persona uses to speak from the citizen's clock: "Friday 15
 * August, 12:58 am". Their zone, never the server's, for the reason clockTime
 * gives above — and absent rather than wrong when the zone is not sent.
 */
function clockLine(tz: string | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
    }).format(new Date()).replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
  } catch {
    return undefined;
  }
}

/**
 * A field that came out of a hub is quoted, never conjugated.
 *
 * "Coconut-curry Lentil Stew Served Over Quinoa Thali wants starting by ..." is
 * a database row made to act as the subject of a verb. Every other line she
 * says was written by a person; that one was a join result wearing a sentence.
 */
function asNamed(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ').toLowerCase();
  const words = t.split(' ');
  const kept: string[] = [];
  for (const w of words) {
    if ([...kept, w].join(' ').length > 26) break;
    kept.push(w);
  }
  return (kept.length ? kept : words.slice(0, 3)).join(' ');
}

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
  /**
   * The conversation meter, on turns that used or hit it. `freeLeft` is null
   * for a subscriber — not zero, which would read as "none left". Optional on
   * the wire, ALWAYS, so an older client never chokes on it.
   */
  pass?: { freeLeft: number | null };
  /** True when this turn is the meter saying so, and the client may offer the subscription. */
  paywall?: boolean;
}

export interface AskContext {
  userId: string;
  /** Whole weeks since their first turn with her. Humour is earned. */
  weeksKnown: number;
  /** Local hour in THEIR timezone. Never the server's. */
  hour: number;
  /**
   * Their IANA timezone, e.g. 'Asia/Kolkata'. Sent by the client for the same
   * reason `hour` is, and it cannot be derived from `hour`: an offset guessed
   * from the hour rounds to the nearest hour, which is wrong by thirty minutes
   * for every citizen in India. Optional, so an older client still gets answers.
   */
  tz?: string;
  dial?: 0 | 1 | 2;
  distressLocked?: boolean;
  recent?: string[];
  /** Session counter, for the mood and for which aside she reaches for. */
  seed?: number;
  /** What she offered last turn, handed back so an answer is read as an answer. */
  answering?: Choice[];
  /**
   * The day's transcript, both voices, oldest first — sent by the client
   * because the thread lives on the device and the server keeps no session.
   * This is what makes "just feeling lonely" a continuation instead of a
   * sentence from nowhere; without it the model re-meets the citizen on every
   * turn, which is the deterministic Mira's oldest defect wearing a new coat.
   */
  history?: Array<{ who: 'me' | 'mira'; text: string }>;
  /**
   * Which tab is asking. `friend` is the companion — conversation leads, and
   * the interpretive lanes (astrology questions, "how is my day") go to the
   * model with her full mystic register. `city` (and absent, for an older
   * client) is the assistant she has always been. Capabilities, navigation
   * and the crisis hand-off behave identically in both: a tab changes her
   * register, never her safety and never what she can actually do.
   */
  mode?: 'friend' | 'city';
  /** The in-app path they were standing on when they opened her. */
  page?: string;
}

/** One branch's output: the fact, and the asides that would be true of it. */
interface Attempt {
  text: string;
  asides?: string[];
  payload?: unknown;
  goto?: Choice;
  choices?: Choice[];
  outcome?: Outcome;
  /** Where the conversation meter stands, on turns that moved or hit it. */
  pass?: { freeLeft: number | null };
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
    // Appended rather than inserted, so the spec's positional stubs stay true.
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly daybook: DaybookService,
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
      /**
       * FORGETTING OUTRANKS EVERYTHING, including the choice she offered
       * last turn — somebody asking her to forget is exercising the promise
       * that makes her memory tolerable, and it must never be misread as an
       * answer to "which one?". forget.ts is strict about what counts as the
       * command, so "I forgot my keys" still flows to the conversation.
       */
      const forget = readForget(text);
      if (forget) return this.forget(ctx.userId, forget);
      if (answered) {
        return {
          outcome: 'navigate',
          text: `${answered.label}. Come on.`,
          asides: ['You could have led with that.', 'Right where you left it.'],
          goto: answered,
        };
      }
      if (routed.lane === 'LISTEN') {
        // Even here — especially here. If what they described is control,
        // violence or somebody at the edge, "what's going on?" is the wrong
        // next move and the hand-off outranks it — including outranking the
        // model. A crisis is handled by code that cannot have a bad day.
        const beyond = readSituation(text);
        if (beyond?.handOff) return relate(beyond);
        // The model, when configured, is what makes this a conversation
        // rather than one canned question. The governor has already set the
        // register: on a distressed turn the persona is stripped of every
        // joke before the model sees a word.
        const talked = await this.converse(text, ctx, lev.distress);
        if (talked) return talked;
        return {
          outcome: 'listen',
          text: lev.distress
            ? 'Okay. Forget everything else for a second. Tell me what happened.'
            : "Yeah. What's going on?",
        };
      }
      if (routed.lane === 'ADVISE') {
        // The hand-off is checked before ANY register: control, violence or
        // somebody at the edge outranks the friend tab and the model alike.
        const situation = readSituation(text);
        if (situation?.handOff) return relate(situation);
        if (ctx.mode === 'friend') {
          // The friend tab. "When will I find love" was the second question
          // ever asked of her, and the assistant's honest deflection was the
          // wrong register for it. Here the model answers with the chart and
          // the numbers she actually knows — and when the model is off, she
          // falls through to exactly what the assistant would have said.
          const talked = await this.converse(text, ctx, lev.distress);
          if (talked) return talked;
        }
        const told = foretold(text);
        if (told) return told;
        if (situation) return relate(situation);
        // The interpretation lane belongs to the astrology engine, which already
        // computes deterministically and already has its own enforced voice.
        // Rather than improvise here, she offers the reading that actually
        // exists — which is now something she can fetch.
        return this.dayBrief(ctx.userId, ctx.tz);
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
        // A PERSON IS NOT A PLACE. "I don't know how to tell my dad" must not
        // become "Dad. Want me to take you?" — so this is asked before the
        // place-finder, and it returns nothing at all unless there is genuinely
        // a situation to read.
        const situation = readSituation(text);
        if (situation?.handOff) return relate(situation);
        // In the friend tab the one-liner oracle steps aside: "when will I
        // find love" deserves the model, with the chart and the numbers she
        // actually knows, not a stock sentence. The city tab keeps
        // foretold() — terse and honest is the assistant's register — and
        // navigation below gets its chance in both tabs.
        const told = ctx.mode === 'friend' ? undefined : foretold(text);
        if (told) return told;
        if (situation && ctx.mode !== 'friend') return relate(situation);

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
        // Nothing matched: the lane the whole framework was written for. This
        // used to be "That's not something I can do yet" — the sentence the
        // owner screenshotted twice. Now it is a conversation, when the model
        // is configured; the old sentence stays as the honest fallback when
        // it is not, so a missing key degrades rather than breaks.
        if (ctx.mode === 'friend' || routed.why === 'nothing matched' || routed.why === 'empty') {
          const talked = await this.converse(text, ctx, lev.distress);
          if (talked) return talked;
        }
        // The friend tab with the model off keeps the relationship lane's
        // own script rather than losing it to a clarify.
        if (situation) return relate(situation);
        return { outcome: 'clarify', text: this.clarify(routed), choices: [] };
      }
      return { outcome: 'capability', ...(await this.read(cap.id, ctx.userId, colour, ctx.tz)) };
    };

    const attempt = await turn();
    const outcome: Outcome = attempt.outcome ?? 'capability';
    // Model prose and the meter's own line are complete sentences said in her
    // register already; running them through say() would staple an aside onto
    // a paragraph. Everything deterministic keeps the full treatment.
    const draft = outcome === 'chat' || outcome === 'paywall'
      ? attempt.text
      : say(attempt.text, colour, attempt.asides ?? []);

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

    /**
     * THE RECORD IS HER MEMORY. Both sides of every exchange, kept per
     * citizen on the server, which is what lets tomorrow's Mira remember
     * today — across devices, unlike the browser's day store, which remains
     * the display. Fire-and-forget like the ledger: remembering must never
     * slow an answer and must never be the reason one fails. The two turns
     * a forget produces are NOT recorded — a wipe that immediately writes
     * "forget everything" back into the memory it wiped is a wipe that
     * keeps a receipt, and the receipt is the thing they asked to lose.
     */
    if (outcome !== 'forget') this.remember(ctx.userId, ctx.mode === 'friend' ? 'friend' : 'city', text, said);

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
      pass: attempt.pass,
      ...(outcome === 'paywall' ? { paywall: true } : {}),
    };
  }

  // ── THE CONVERSATION LANE ─────────────────────────────────────────────
  //
  // Everything the deterministic Mira cannot say — comfort, curiosity, a real
  // exchange — comes from here. Three rules, all enforced in code rather than
  // hoped for in the prompt:
  //
  //  1. THE METER IS CHECKED FIRST. Two hundred model conversations are free;
  //     after that the subscription carries them. Capabilities, navigation
  //     and the greeting never touch the meter — the working city stays free.
  //  2. THE PERSONA IS BUILT FROM WHAT IS TRUE: their name, their clock,
  //     their Vedic chart when they have given birth details, and the honest
  //     list of what she can actually do — so the model cannot promise an
  //     order button that does not exist.
  //  3. HER VOICE RULES OUTRANK THE MODEL. A reply that breaks them is
  //     dropped and the deterministic sentence stands. Warmth is never worth
  //     sounding like a call centre.

  private async converse(text: string, ctx: AskContext, distress: boolean): Promise<Attempt | undefined> {
    if (!this.ai.enabled) return undefined;
    const pass = await this.passOf(ctx.userId);
    if (!pass.paid && pass.freeLeft <= 0) {
      return { outcome: 'paywall', text: PAYWALL_LINE, pass: { freeLeft: 0 } };
    }
    const [name, chart] = await Promise.all([this.nameOf(ctx.userId), this.chartOf(ctx.userId)]);
    const system = persona({
      mode: ctx.mode === 'friend' ? 'friend' : 'city',
      name,
      signs: chart?.signs ?? null,
      lifePath: lifePathOf(chart?.birthDate),
      page: ctx.page ?? null,
      clock: clockLine(ctx.tz),
      weeksKnown: ctx.weeksKnown,
      distress,
      canDo: this.registry.all().map((c) => c.intent.toLowerCase()),
    });
    // HER MEMORY FIRST, THE DEVICE SECOND. The server record spans days and
    // devices; the client's day store is one browser and clears at midnight.
    // When the record answers, it IS the context — including today, because
    // every exchange lands in it as it happens. The client trail remains the
    // fallback for the first conversation and for a read that fails, so a
    // slow table costs continuity, never an answer.
    const remembered = await this.recall(ctx.userId, ctx.mode === 'friend' ? 'friend' : 'city');
    const trail = remembered.length
      ? remembered
      : (ctx.history ?? []).slice(-12)
          .map((h) => ({ role: h.who === 'me' ? ('user' as const) : ('assistant' as const), content: h.text.slice(0, 2000) }));
    if (trail.length && trail[trail.length - 1].role === 'user' && trail[trail.length - 1].content === text) trail.pop();
    /**
     * The wire wants strict alternation starting with a user turn. The
     * record is written in pairs so it usually is — but a half-failed write
     * or a capability answer squeezed between chats can double a role, and
     * one malformed transcript must not cost the conversation. Same-role
     * neighbours are joined; a leading assistant turn is dropped.
     */
    const squashed: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const turn of [...trail, { role: 'user' as const, content: text }]) {
      const last = squashed[squashed.length - 1];
      if (last && last.role === turn.role) last.content += `\n${turn.content}`;
      else squashed.push({ ...turn });
    }
    while (squashed.length && squashed[0].role !== 'user') squashed.shift();
    const said = await this.ai.converse(system, squashed);
    if (!said) return undefined;
    const bad = violations(said);
    if (bad.length) {
      this.logger.warn(`Mira's model reply broke voice (${bad.map((v) => v.why).join(', ')}) — deterministic line stands`);
      return undefined;
    }
    const left = await this.spendChat(ctx.userId, pass);
    return { outcome: 'chat', text: said, pass: { freeLeft: left } };
  }

  /** Where the meter stands. A missing row is a citizen who has never chatted. */
  private async passOf(userId: string): Promise<{ paid: boolean; used: number; freeLeft: number }> {
    const row = await this.prisma.miraPass.findUnique({ where: { userId } }).catch(() => null);
    const used = row?.chatUsed ?? 0;
    const paid = Boolean(row?.paidUntil && row.paidUntil.getTime() > Date.now());
    return { paid, used, freeLeft: Math.max(0, FREE_CHATS - used) };
  }

  /**
   * One conversation, spent. Subscribers are not counted — null says "not
   * metered", which the client must not render as "0 left". Fire-and-forget
   * on failure: a meter that cannot be written must never cost an answer.
   */
  private async spendChat(userId: string, pass: { paid: boolean; used: number }): Promise<number | null> {
    if (pass.paid) return null;
    await this.prisma.miraPass.upsert({
      where: { userId },
      update: { chatUsed: { increment: 1 } },
      create: { userId, chatUsed: 1 },
    }).catch(() => undefined);
    return Math.max(0, FREE_CHATS - pass.used - 1);
  }

  /**
   * ₹999 from the city wallet, thirty days on the pass, one transaction.
   *
   * NOT a @Mira() capability, on purpose: she still cannot spend money. This
   * is behind an explicit button the citizen presses, priced on its face, and
   * it goes through the same unified rail as every checkout in the city — so
   * an insufficient wallet answers with the same sentence everywhere.
   * Extending an active pass stacks from its end, never from today: paying
   * early must never eat the days already bought.
   */
  async subscribe(userId: string): Promise<{ paidUntil: string; freeLeft: null }> {
    const row = await this.prisma.miraPass.findUnique({ where: { userId } }).catch(() => null);
    const now = Date.now();
    const from = row?.paidUntil && row.paidUntil.getTime() > now ? row.paidUntil.getTime() : now;
    const until = new Date(from + 30 * 24 * 60 * 60 * 1000);
    await this.financial.paid(
      userId,
      { hub: 'Mira', category: 'subscription', label: 'Mira · 30 days of conversation', amountInr: SUB_INR },
      (tx) => tx.miraPass.upsert({
        where: { userId },
        update: { paidUntil: until },
        create: { userId, paidUntil: until },
      }),
    );
    return { paidUntil: until.toISOString(), freeLeft: null };
  }

  /**
   * THE CONFIDANT — she reads ONE conversation, and only that one.
   *
   * The citizen pressed her mark inside a person-to-person chat. The client
   * sends that thread's transcript with the ask, and the reply is built from
   * that window of text and NOTHING else. The scope is the promise, and it is
   * enforced by absence rather than by prompt: this method never touches
   * MiraTurn (no recall, no remember — what two people said to each other is
   * not hers to keep), never loads the chart or the name, and never reaches
   * the router or the executor. One model call in, one paragraph out.
   *
   * The crisis hand-off still outranks the model — a thread can hold the same
   * darkness a friend-tab turn can, and it is handled by code that cannot
   * have a bad day. The meter is the same one conversation spends: this IS a
   * model conversation, wherever she was standing when it happened.
   */
  async confide(
    userId: string,
    input: {
      otherName?: string; ask: string;
      transcript: Array<{ who: 'me' | 'them'; text: string }>;
      /** 'draft' is the Help-me-reply button: a message to paste, not a
       *  reading of the thread. See `confidant` in persona.ts. */
      mode?: 'read' | 'draft';
    },
  ): Promise<{ text: string; pass?: { freeLeft: number | null }; paywall?: boolean }> {
    const record = (outcome: Outcome) =>
      this.ledger.record({ userId, text: input.ask, lane: 'LISTEN', confidence: 1, outcome, levity: 0 });

    // The hand-off first, deterministically, before any model sees a word.
    const situation = readSituation(input.ask);
    if (situation?.handOff) {
      record('relate');
      return { text: `${situation.reflection} ${situation.handOff}` };
    }

    if (!this.ai.enabled) {
      record('confide');
      return { text: 'I can see this conversation, but my reading half isn’t switched on right now. Try me again in a while.' };
    }

    const pass = await this.passOf(userId);
    if (!pass.paid && pass.freeLeft <= 0) {
      record('paywall');
      return { text: PAYWALL_LINE, pass: { freeLeft: 0 }, paywall: true };
    }

    const them = (input.otherName ?? '').trim() || 'Them';
    /* A DRAFT IS NOT A READING, and distress outranks the draft. If the thread
       is heavy she goes back to being present rather than handing over a
       polished sentence — the one turn where "here are the words" is the wrong
       help is the turn where somebody is hurting. */
    const draftOnly = input.mode === 'draft' && !situation;
    const system = confidant({ otherName: input.otherName, distress: Boolean(situation), draftOnly });
    // One user turn: the window of text, then the question. A single message
    // is trivially a legal transcript, and it keeps the model from mistaking
    // the OTHER person's words for its interlocutor's.
    const window = input.transcript.slice(-40)
      .map((t) => `${t.who === 'me' ? 'Me' : them}: ${t.text.slice(0, 1000)}`)
      .join('\n');
    const content = window
      ? `THE CONVERSATION SO FAR:\n${window}\n\nMY QUESTION: ${input.ask}`
      : `The conversation is empty so far.\n\nMY QUESTION: ${input.ask}`;

    const said = await this.ai.converse(system, [{ role: 'user', content }]);
    if (!said || violations(said).length) {
      if (said) this.logger.warn('Mira’s confidant reply broke voice — the plain line stands');
      record('confide');
      // Not billed — a reply she was not allowed to say costs nobody anything.
      return { text: 'I’ve read it. Ask me plainly what you want to know about it — where they’re coming from, or how to answer.' };
    }

    record('confide');
    const left = await this.spendChat(userId, pass);
    return { text: said, pass: { freeLeft: left } };
  }

  /**
   * SHE READS ONE DAY — the citizen's own.
   *
   * "Ask Mira about this day", from the daybook. Unlike the chat confidant,
   * this is not somebody else's words: it is the citizen's own page, so she
   * reads it FROM THE SERVER rather than from what a screen happened to be
   * showing. That is the honest source for "what did I say I wanted?" — a
   * question about a day they may not be looking at.
   *
   * The scope is still one day. She is handed that date's page and its lines
   * and nothing else — not the month, not the neighbouring days, not her own
   * memory of them — because "what happened on the 15th" is a question about
   * the 15th, and a friend who answers it by reviewing your year is not
   * answering it.
   *
   * SHE MAY NOT INVENT A DAY. An empty page comes back as an empty page: the
   * prompt says so and the deterministic line below says so, because the one
   * unforgivable failure for a diary's reader is confident fiction about a
   * day somebody actually lived.
   */
  async readDay(userId: string, date: string, ask: string, tz?: string): Promise<{
    text: string; pass?: { freeLeft: number | null }; paywall?: boolean;
  }> {
    const record = () => this.ledger.record({ userId, text: ask, lane: 'RETRIEVE', confidence: 1, outcome: 'confide', levity: 0 });
    const day = await this.daybook.day(userId, date).catch(() => null);
    // A day holding nothing but a photograph is NOT an empty day. It was, for
    // one commit: the check listed the fields that existed when it was written,
    // so somebody who kept a picture and no words would have been told there
    // was nothing there — by the one part of the city that had just been handed
    // their memory.
    const answered = Object.values(day?.reflection ?? {}).filter((v) => v !== null && v !== '').length;
    const bare = !day || (!day.mood && !day.feelNote && !day.journal
      && day.items.length === 0 && day.photos.length === 0 && answered === 0);

    if (bare) {
      record();
      return { text: `Nothing on ${date} yet — no mood, nothing planned, nothing written. Put something down and I'll have something to read.` };
    }
    if (!this.ai.enabled) {
      record();
      const done = day.items.filter((i) => i.done).length;
      const pics = day.photos.length ? `, ${day.photos.length} picture${day.photos.length === 1 ? '' : 's'} kept` : '';
      return { text: `${date}: ${day.mood ? `${day.mood}, ` : ''}${day.items.length} thing${day.items.length === 1 ? '' : 's'} down${day.items.length ? `, ${done} done` : ''}${day.journal ? ', and a page written' : ''}${pics}.` };
    }

    const pass = await this.passOf(userId);
    if (!pass.paid && pass.freeLeft <= 0) {
      record();
      return { text: PAYWALL_LINE, pass: { freeLeft: 0 }, paywall: true };
    }

    const lines = [
      `THE DAY: ${date}${tz ? ` (their clock: ${tz})` : ''}`,
      day.mood ? `HOW IT FELT: ${day.mood}${day.feelNote ? ` — ${day.feelNote}` : ''}` : null,
      day.items.length
        ? `ON THE PAGE:\n${day.items.map((i) => `- [${i.done ? 'done' : 'not done'}] ${i.kind}${i.at ? ` at ${i.at}` : ''}: ${i.title}`).join('\n')}`
        : null,
      day.journal ? `WHAT THEY WROTE:\n${day.journal.slice(0, 6000)}` : null,
      // A COUNT, AND NOTHING ELSE, BECAUSE SHE CANNOT SEE THEM. Telling her a
      // picture exists lets her say "you kept a photo of it" rather than
      // pretending the day held nothing; telling her any more than that would
      // be inviting her to describe an image nobody showed her.
      day.photos.length ? `PICTURES THEY KEPT ON THIS DAY: ${day.photos.length}` : null,
      /* THE LOOKING-BACK SHEET, in the citizen's own words and labelled with
         the question each answer was given to — an answer read back without
         its prompt is a sentence with the subject removed. `feeling` is a
         1–10 reading of the day, and she is told below what it is not. */
      answered ? `WHAT THEY WROTE LOOKING BACK:\n${REFLECTION_PROMPTS
        .filter(([k]) => {
          const v = (day.reflection as Record<string, unknown>)[k];
          return v !== null && v !== undefined && v !== '';
        })
        .map(([k, q]) => `- ${q}: ${String((day.reflection as Record<string, unknown>)[k]).slice(0, 1200)}`)
        .join('\n')}` : null,
    ].filter(Boolean).join('\n\n');

    const system = [
      'You are Mira, reading one day of a citizen\'s own daybook with them — their moods, their plans, their writing. You are their friend, not a reporting tool.',
      'THIS IS THE WHOLE OF WHAT YOU CAN SEE: one day. Not the month, not yesterday, not anything you remember from elsewhere. If they ask about another day or a pattern over time, say plainly that you are only looking at this one.',
      'NEVER INVENT A DAY. Everything you say has to be traceable to what is below. If it is not there, it did not happen as far as you know, and you say so rather than filling the gap — a diary read back wrong is worse than a diary unread.',
      'YOU CANNOT SEE THEIR PICTURES. If the day says pictures were kept, you know only how many. Never describe one, never guess what is in it, never say it looks like anything — you have not been shown it, and you say so if asked.',
      'THE 1-10 IS HOW THE DAY FELT TO THEM, NOT A MARK. Never call it a score, never compare it to another day, never congratulate or commiserate about the number. If they wrote 4, the useful thing is what they said around it.',
      'You are reading, not grading. No productivity scoring, no "you only completed 2 of 5", no advice they did not ask for. If they ask what it looked like, tell them warmly and briefly, in their own terms.',
      'Two to four sentences, almost always. A chat bubble, not a report. Contractions. No headers, no bullet lists unless they ask for a list.',
      'Banned from your mouth, always: "As an AI", "great question", "happy to help", "is there anything else", "I understand how you feel", "absolutely!", "of course!", "based on your query", announcing lists, narrating machinery. You sound like Mira — a person — or you say nothing.',
      'Reply with the message only — no preamble, no signature, no quotation marks around it.',
    ].join('\n\n');

    const said = await this.ai.converse(system, [{ role: 'user', content: `${lines}\n\nMY QUESTION: ${ask}` }]);
    if (!said || violations(said).length) {
      if (said) this.logger.warn('Mira\'s daybook reply broke voice - the plain line stands');
      record();
      return { text: 'I\u2019ve read it. Ask me plainly what you want to know about this day.' };
    }
    record();
    const left = await this.spendChat(userId, pass);
    return { text: said, pass: { freeLeft: left } };
  }

  /**
   * THE VISIBLE THREAD, SERVED FROM HER RECORD.
   *
   * "user data on mobile and site should be same" — the owner, holding a
   * phone showing one conversation beside a laptop showing another. The
   * record already spans devices (it is what her memory reads); this serves
   * the same rows to the SCREEN, so the thread a citizen sees follows their
   * account instead of their browser. The device day-store remains the
   * offline fallback, never the truth. Bounded, try/caught whole: a failed
   * read is an empty thread the client ignores, never an error.
   */
  async thread(userId: string, room: 'friend' | 'city'): Promise<{
    turns: Array<{ who: 'you' | 'mira'; text: string; at: string }>;
  }> {
    try {
      const rows = await this.prisma.miraTurn.findMany({
        where: { userId, room },
        orderBy: { createdAt: 'desc' },
        take: 60,
      });
      return {
        turns: rows.reverse().map((t: { who: string; text: string; createdAt: Date }) => ({
          who: t.who === 'you' ? ('you' as const) : ('mira' as const),
          text: t.text,
          at: t.createdAt.toISOString(),
        })),
      };
    } catch {
      return { turns: [] };
    }
  }

  /**
   * The last stretch of the record, oldest first, shaped for the wire.
   * Bounded (unbounded-reads rule) and try/caught whole: a missing table, a
   * stale client or a slow read returns [] and the caller falls back to the
   * device's own transcript.
   */
  private async recall(userId: string, room: 'friend' | 'city'): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    try {
      const rows = await this.prisma.miraTurn.findMany({
        where: { userId, room },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      return rows.reverse().map((t: { who: string; text: string }) => ({
        role: t.who === 'you' ? ('user' as const) : ('assistant' as const),
        content: t.text.slice(0, 1500),
      }));
    } catch {
      return [];
    }
  }

  /** Write both sides of an exchange into the record. Fire-and-forget, and
   *  the reply is stamped a millisecond later so the pair reads back in the
   *  order it was said. */
  private remember(userId: string, room: 'friend' | 'city', asked: string, said: string): void {
    try {
      const at = Date.now();
      void this.prisma.miraTurn.createMany({
        data: [
          { userId, room, who: 'you', text: asked.slice(0, 4000), createdAt: new Date(at) },
          { userId, room, who: 'mira', text: said.slice(0, 4000), createdAt: new Date(at + 1) },
        ],
      }).catch(() => undefined);
    } catch { /* memory is best-effort, never load-bearing */ }
  }

  /**
   * Tear pages out of her notebook — the one write she can do, and it only
   * ever removes. Scoped to the asker's own record by construction: the
   * WHERE carries their userId before anything else.
   */
  private async forget(userId: string, ask: { scope: string; topic?: string }): Promise<Attempt> {
    if (ask.scope === 'dismiss') return { outcome: 'forget', text: 'Dropped.' };
    if (ask.scope === 'unclear') {
      return {
        outcome: 'clarify',
        text: 'Everything, or a topic? Say "forget everything", or "forget about the loan" — and it is truly gone.',
        choices: [],
      };
    }
    try {
      if (ask.scope === 'everything') {
        await this.prisma.miraTurn.deleteMany({ where: { userId } });
        return {
          outcome: 'forget',
          text: 'Done — all of it, gone from my memory, on every device. What\u2019s still on this screen goes when you press Clear this screen.',
        };
      }
      const gone = await this.prisma.miraTurn.deleteMany({
        where: { userId, text: { contains: ask.topic ?? '', mode: 'insensitive' } },
      });
      return {
        outcome: 'forget',
        text: gone.count > 0
          ? `Done. ${gone.count} thing${gone.count === 1 ? '' : 's'} that mentioned it — gone from my memory.`
          : 'Nothing in my memory mentions that, so there was nothing to forget. We\u2019re clean.',
      };
    } catch {
      return { outcome: 'forget', text: 'That didn\u2019t take just now. Ask me again in a minute — it matters.' };
    }
  }

  /** Their name, for the persona. Best-effort — she talks fine without it. */
  private async nameOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
    return u?.name ?? null;
  }

  /** Their Vedic signs and birth date, when birth details exist. Best-effort,
   *  never blocking — she talks fine without either. */
  private async chartOf(userId: string): Promise<{
    signs: { sun?: string | null; moon?: string | null; rising?: string | null };
    birthDate: string | null;
  } | null> {
    try {
      const p = (await this.astrology.getProfile(userId)) as
        { birthDate?: string; chart?: { sunSign?: string; moonSign?: string; ascendant?: string | null } } | null;
      if (!p?.chart) return null;
      return {
        signs: { sun: p.chart.sunSign ?? null, moon: p.chart.moonSign ?? null, rising: p.chart.ascendant ?? null },
        birthDate: typeof p.birthDate === 'string' ? p.birthDate : null,
      };
    } catch {
      return null;
    }
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
  private async dayBrief(userId: string, tz?: string): Promise<Attempt> {
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
      if (body) parts.push(firstSentences(body, 1));
      else if (title) parts.push(title);
    }

    const due = asList(ok(doses), 'doses').filter((d) => {
      const s = str(pick(d, 'status'));
      return s === 'due' || s === 'upcoming';
    });
    if (due.length) {
      const names = due.slice(0, 3).map((d) => str(pick(d, 'medicine')) ?? 'something').filter(Boolean);
      parts.push(`${due.length === 1 ? 'One dose' : `${due.length} doses`} left — ${list(names)}.`);
    }

    const cook = asList(ok(prep), 'alerts');
    if (cook.length) {
      const next = cook[0];
      const what = str(pick(next, 'title')) ?? str(pick(next, 'what'));
      const when = clockTime(str(pick(next, 'startBy')), tz);
      if (what) {
        parts.push(when
          ? `Start ${asNamed(what)} by ${when}.`
          : `Next in the kitchen: ${asNamed(what)}.`);
      }
    }

    const unreadMail = num(pick(pick(ok(post), 'counts'), 'inboxUnread')) ?? 0;
    const unseen = num(ok(alerts)) ?? 0;
    const waiting: string[] = [];
    if (unreadMail) waiting.push(`${unreadMail} unread`);
    if (unseen) waiting.push(`${unseen} alert${unseen === 1 ? '' : 's'}`);
    if (waiting.length) parts.push(`${waiting.join(', ')}.`);

    if (!parts.length) {
      return {
        outcome: 'capability',
        text: 'Nothing on your day yet — no reading, no doses, nothing waiting.',
        asides: ['Enjoy it while it lasts.'],
      };
    }

    // §23, and it is load-bearing rather than stylistic. `say()` drops her aside
    // once the finished line exceeds the mood's word budget, so an unbounded
    // join does not merely make her verbose — it makes her voiceless, and it
    // does it silently, on the turn most likely to be somebody's first. The
    // reading is always kept; the rest is reachable by asking, which is the
    // whole premise of her existing.
    return {
      outcome: 'capability',
      text: parts.slice(0, 4).join(' '),
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
  private async read(id: string, userId: string, c: Colour, tz?: string): Promise<Attempt> {
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
        return this.dayBrief(userId, tz);
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
        // Same two faults as the day brief had, in a second branch: a raw ISO
        // instant and a Title Case row used as a noun. Found by the land script's
        // grep, not by anybody reading — which is the argument for the grep.
        const raw = str(pick(next, 'title')) ?? str(pick(next, 'what'));
        const what = raw ? asNamed(raw) : 'the next meal';
        const when = clockTime(str(pick(next, 'startBy')), tz);
        return {
          text: when ? `Start ${what} by ${when}.` : `Next: ${what}.`,
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
 * One relationship turn, assembled.
 *
 * Reflection first, always — what she HEARD, before anything she concluded.
 * Then the hand-off OR the script, never both: the entire point of a hand-off
 * is that a better opening sentence is the wrong answer.
 *
 * No asides are offered. `levity.ts` caps the listen lane at 0 and `say()` is
 * what decides — but the array is left empty rather than relying on that,
 * because nobody should have to run the governor in their head to know whether
 * a joke can land on somebody describing a marriage.
 */
function relate(r: Read): Attempt {
  if (r.handOff) return { outcome: 'relate', text: `${r.reflection} ${r.handOff}` };
  if (!r.script) return { outcome: 'relate', text: r.reflection };
  return { outcome: 'relate', text: `${r.reflection} If you want a way in: ${r.script.opening} ${r.script.why}` };
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
